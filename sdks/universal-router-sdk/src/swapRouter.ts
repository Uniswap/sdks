import invariant from 'tiny-invariant'
import UniversalRouter from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import {
  MethodParameters,
  Multicall,
  Position as V3Position,
  NonfungiblePositionManager as V3PositionManager,
  RemoveLiquidityOptions as V3RemoveLiquidityOptions,
} from '@uniswap/v3-sdk'
import {
  Position as V4Position,
  V4PositionManager,
  AddLiquidityOptions as V4AddLiquidityOptions,
  MintOptions,
  Pool as V4Pool,
  PoolKey,
} from '@uniswap/v4-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, TradeType, Percent, CHAIN_TO_ADDRESSES_MAP, SupportedChainsType } from '@uniswap/sdk-core'
import { UniswapTrade, SwapOptions, TokenTransferMode } from './entities/actions/uniswap'
import { AcrossV4DepositV3Params } from './entities/actions/across'
import { SwapSpecification, SwapStep } from './types/encodeSwaps'
import { RoutePlanner, CommandType } from './utils/routerCommands'
import { encodePermit, encodeV3PositionPermit } from './utils/inputTokens'
import {
  ROUTER_AS_RECIPIENT,
  SENDER_AS_RECIPIENT,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
  isAtLeastV2_1_1,
} from './utils/constants'
import { getCurrencyAddress } from './utils/getCurrencyAddress'
import { encodeFee1e18, encodeFeeBips } from './utils/numbers'
import { encodeSwapStep } from './utils/encodeSwapStep'
import { computeEncodeSwapsAmounts } from './utils/computeEncodeSwapsAmounts'
import { validateEncodeSwaps } from './utils/validateEncodeSwaps'
import { getUniversalRouterDomain, EXECUTE_SIGNED_TYPES, generateNonce } from './utils/eip712'
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer'

export type SwapRouterConfig = {
  sender?: string // address
  deadline?: BigNumberish
}

export type SignedRouteOptions = {
  intent: string // bytes32 - application-specific intent identifier
  data: string // bytes32 - application-specific data
  sender: string // msg.sender to verify, or address(0) to skip sender verification
  nonce?: string // bytes32 - optional nonce. If not provided, random nonce is generated. Use NONCE_SKIP_CHECK to skip nonce verification
}

export type EIP712Payload = {
  domain: TypedDataDomain
  types: Record<string, TypedDataField[]>
  value: {
    commands: string
    inputs: string[]
    intent: string
    data: string
    sender: string
    nonce: string
    deadline: string
  }
}

export interface MigrateV3ToV4Options {
  inputPosition: V3Position
  outputPosition: V4Position
  v3RemoveLiquidityOptions: V3RemoveLiquidityOptions
  v4AddLiquidityOptions: V4AddLiquidityOptions
}

type NormalizedSwapSpecification = Omit<SwapSpecification, 'recipient' | 'tokenTransferMode' | 'urVersion'> & {
  recipient: string
  tokenTransferMode: TokenTransferMode
  urVersion: UniversalRouterVersion
}

const DEFAULT_PROXY_DEADLINE_BUFFER_SECONDS = 30 * 60

function isMint(options: V4AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some((k) => k === 'recipient')
}

export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(UniversalRouter.abi)

  public static PROXY_INTERFACE: Interface = new Interface([
    'function execute(address router, address token, uint256 amount, bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external',
  ])

  public static swapCallParameters(
    trades: RouterTrade<Currency, Currency, TradeType>,
    options: SwapOptions,
    bridgeOptions?: AcrossV4DepositV3Params[] // Optional bridge parameters
  ): MethodParameters {
    // TODO: use permit if signature included in swapOptions
    const planner = new RoutePlanner()

    const trade: UniswapTrade = new UniswapTrade(trades, options)

    const inputCurrency = trade.trade.inputAmount.currency

    if (options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
      invariant(!inputCurrency.isNative, 'PROXY_NATIVE_INPUT: SwapProxy only supports ERC20 input')
      invariant(!!options.chainId, 'PROXY_MISSING_CHAIN_ID: chainId required when tokenTransferMode is ApproveProxy')
      invariant(!options.inputTokenPermit, 'PROXY_PERMIT_CONFLICT: Permit2 not used with SwapProxy')
    } else {
      invariant(!(inputCurrency.isNative && !!options.inputTokenPermit), 'NATIVE_INPUT_PERMIT')

      if (options.inputTokenPermit) {
        encodePermit(planner, options.inputTokenPermit)
      }
    }

    const nativeCurrencyValue = inputCurrency.isNative
      ? BigNumber.from(trade.trade.maximumAmountIn(options.slippageTolerance).quotient.toString())
      : BigNumber.from(0)

    trade.encode(planner, { allowRevert: false })

    // Add bridge commands if provided
    if (bridgeOptions) {
      for (const bridge of bridgeOptions) {
        planner.addAcrossBridge(bridge)
      }
    }

    if (options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
      return SwapRouter.encodeProxyPlan(planner, trade, options)
    }

    return SwapRouter.encodePlan(planner, nativeCurrencyValue, {
      deadline: options.deadlineOrPreviousBlockhash ? BigNumber.from(options.deadlineOrPreviousBlockhash) : undefined,
    })
  }

  /**
   * Encodes router-provided swap steps inside the SDK safety envelope.
   *
   * Routers own `swapSteps`, including any route-dependent `WRAP_ETH` / `UNWRAP_WETH`
   * commands needed to execute the route and normalize balances for settlement/refund.
   * The SDK owns ingress, fees, final settlement, and exact-output refund.
   *
   * After the last router step, gross output must be held in UR as `spec.routing.outputToken`.
   * For `EXACT_OUTPUT`, routers must normalize unused input into `spec.routing.inputToken` before
   * control returns to the envelope.
   * The SDK refunds unused input with `SWEEP(getCurrencyAddress(inputToken), recipient, 0)`.
   *
   * The SDK does not infer route topology or add transition commands on behalf of routers.
   */
  public static encodeSwaps(spec: SwapSpecification, swapSteps: SwapStep[]): MethodParameters {
    const normalizedSpec = SwapRouter.normalizeEncodeSwapsSpec(spec)
    const planner = new RoutePlanner()

    validateEncodeSwaps(normalizedSpec, swapSteps)

    const { maxAmountIn, netMinOrExactOut } = computeEncodeSwapsAmounts(normalizedSpec)
    const {
      routing: { inputToken, outputToken },
    } = normalizedSpec

    if (normalizedSpec.tokenTransferMode === TokenTransferMode.Permit2) {
      if (normalizedSpec.permit) {
        encodePermit(planner, normalizedSpec.permit)
      }

      if (!inputToken.isNative) {
        planner.addCommand(
          CommandType.PERMIT2_TRANSFER_FROM,
          [getCurrencyAddress(inputToken), ROUTER_AS_RECIPIENT, maxAmountIn],
          false,
          normalizedSpec.urVersion
        )
      }
    }

    for (const step of swapSteps) {
      encodeSwapStep(planner, step, normalizedSpec.urVersion)
    }

    if (normalizedSpec.fee?.kind === 'portion') {
      const feeCommandType = isAtLeastV2_1_1(normalizedSpec.urVersion)
        ? CommandType.PAY_PORTION_FULL_PRECISION
        : CommandType.PAY_PORTION
      const encodedFee = isAtLeastV2_1_1(normalizedSpec.urVersion)
        ? encodeFee1e18(normalizedSpec.fee.fee)
        : encodeFeeBips(normalizedSpec.fee.fee)

      planner.addCommand(
        feeCommandType,
        [getCurrencyAddress(outputToken), normalizedSpec.fee.recipient, encodedFee],
        false,
        normalizedSpec.urVersion
      )
    } else if (normalizedSpec.fee?.kind === 'flat') {
      planner.addCommand(
        CommandType.TRANSFER,
        [getCurrencyAddress(outputToken), normalizedSpec.fee.recipient, normalizedSpec.fee.amount],
        false,
        normalizedSpec.urVersion
      )
    }

    // Assumes routers already normalized final gross output into `routing.outputToken`.
    planner.addCommand(
      CommandType.SWEEP,
      [getCurrencyAddress(outputToken), normalizedSpec.recipient, netMinOrExactOut],
      false,
      normalizedSpec.urVersion
    )

    // Assumes routers already normalized unused input into `routing.inputToken`.
    if (normalizedSpec.tradeType === TradeType.EXACT_OUTPUT) {
      planner.addCommand(
        CommandType.SWEEP,
        [getCurrencyAddress(inputToken), normalizedSpec.recipient, 0],
        false,
        normalizedSpec.urVersion
      )
    }

    if (normalizedSpec.tokenTransferMode === TokenTransferMode.ApproveProxy) {
      return SwapRouter.encodeProxyCall(
        planner,
        getCurrencyAddress(inputToken),
        maxAmountIn,
        normalizedSpec.chainId!,
        normalizedSpec.urVersion,
        normalizedSpec.deadline
      )
    }

    return SwapRouter.encodePlan(planner, inputToken.isNative ? maxAmountIn : BigNumber.from(0), {
      deadline: normalizedSpec.deadline ? BigNumber.from(normalizedSpec.deadline) : undefined,
    })
  }

  /**
   * Generate EIP712 payload for signed execution (no signing performed)
   * Decodes existing execute() calldata and prepares it for signing
   *
   * @param calldata The calldata from swapCallParameters() or similar
   * @param signedOptions Options for signed execution (intent, data, sender, nonce)
   * @param deadline The deadline timestamp
   * @param chainId The chain ID
   * @param routerAddress The Universal Router contract address
   * @returns EIP712 payload ready to be signed externally
   */
  public static getExecuteSignedPayload(
    calldata: string,
    signedOptions: SignedRouteOptions,
    deadline: BigNumberish,
    chainId: number,
    routerAddress: string
  ): EIP712Payload {
    // Decode the execute() calldata to extract commands and inputs
    // Try to decode with deadline first, then without
    let decoded: any
    let commands: string
    let inputs: string[]

    try {
      decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[],uint256)', calldata)
      commands = decoded.commands as string
      inputs = decoded.inputs as string[]
    } catch (e) {
      // Try without deadline
      decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', calldata)
      commands = decoded.commands as string
      inputs = decoded.inputs as string[]
    }

    // Use provided nonce or generate random one
    const nonce = signedOptions.nonce || generateNonce()

    // sender is provided directly (address(0) = skip verification)
    const sender = signedOptions.sender

    const domain = getUniversalRouterDomain(chainId, routerAddress)

    const intent = signedOptions.intent

    const data = signedOptions.data

    const deadlineStr = BigNumber.from(deadline).toString()

    const value = {
      commands,
      inputs,
      intent,
      data,
      sender,
      nonce,
      deadline: deadlineStr,
    }

    return {
      domain,
      types: EXECUTE_SIGNED_TYPES,
      value,
    }
  }

  /**
   * Encode executeSigned() call with signature
   *
   * @param calldata The original calldata from swapCallParameters()
   * @param signature The signature obtained from external signing
   * @param signedOptions The same options used in getExecuteSignedPayload()
   * @param deadline The deadline timestamp
   * @param nativeCurrencyValue The native currency value (ETH) to send
   * @returns Method parameters for executeSigned()
   */
  public static encodeExecuteSigned(
    calldata: string,
    signature: string,
    signedOptions: SignedRouteOptions,
    deadline: BigNumberish,
    nativeCurrencyValue: BigNumber = BigNumber.from(0)
  ): MethodParameters {
    // Decode the execute() calldata to extract commands and inputs
    // Try to decode with deadline first, then without
    let decoded: any
    let commands: string
    let inputs: string[]

    try {
      decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[],uint256)', calldata)
      commands = decoded.commands as string
      inputs = decoded.inputs as string[]
    } catch (e) {
      // Try without deadline
      decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', calldata)
      commands = decoded.commands as string
      inputs = decoded.inputs as string[]
    }

    // Use provided nonce (must match what was signed)
    // Nonce must match what was signed - require it to be provided
    if (!signedOptions.nonce) {
      throw new Error('Nonce is required for encodeExecuteSigned - use the nonce from getExecuteSignedPayload')
    }
    const nonce = signedOptions.nonce

    // Determine verifySender based on sender address
    const verifySender = signedOptions.sender !== '0x0000000000000000000000000000000000000000'

    // Encode executeSigned function call using the Universal Router v2.1 ABI
    const signedCalldata = SwapRouter.INTERFACE.encodeFunctionData('executeSigned', [
      commands,
      inputs,
      signedOptions.intent,
      signedOptions.data,
      verifySender,
      nonce,
      signature,
      deadline,
    ])

    return { calldata: signedCalldata, value: nativeCurrencyValue.toHexString() }
  }

  /**
   * Builds the call parameters for a migration from a V3 position to a V4 position.
   * Some requirements of the parameters:
   *   - v3RemoveLiquidityOptions.collectOptions.recipient must equal v4PositionManager
   *   - v3RemoveLiquidityOptions.liquidityPercentage must be 100%
   *   - input pool and output pool must have the same tokens
   *   - V3 NFT must be approved, or valid inputV3NFTPermit must be provided with UR as spender
   */
  public static migrateV3ToV4CallParameters(
    options: MigrateV3ToV4Options,
    positionManagerOverride?: string
  ): MethodParameters {
    const v4Pool: V4Pool = options.outputPosition.pool
    const v3Token0 = options.inputPosition.pool.token0
    const v3Token1 = options.inputPosition.pool.token1
    const v4PositionManagerAddress =
      positionManagerOverride ?? CHAIN_TO_ADDRESSES_MAP[v4Pool.chainId as SupportedChainsType].v4PositionManagerAddress

    // owner of the v3 nft must be the receiver of the v4 nft

    // validate the parameters
    if (v4Pool.currency0.isNative) {
      invariant(
        (v4Pool.currency0.wrapped.equals(v3Token0) && v4Pool.currency1.equals(v3Token1)) ||
          (v4Pool.currency0.wrapped.equals(v3Token1) && v4Pool.currency1.equals(v3Token0)),
        'TOKEN_MISMATCH'
      )
    } else {
      invariant(v3Token0 === v4Pool.token0, 'TOKEN0_MISMATCH')
      invariant(v3Token1 === v4Pool.token1, 'TOKEN1_MISMATCH')
    }

    invariant(
      options.v3RemoveLiquidityOptions.liquidityPercentage.equalTo(new Percent(100, 100)),
      'FULL_REMOVAL_REQUIRED'
    )
    invariant(options.v3RemoveLiquidityOptions.burnToken == true, 'BURN_TOKEN_REQUIRED')
    invariant(
      options.v3RemoveLiquidityOptions.collectOptions.recipient === v4PositionManagerAddress,
      'RECIPIENT_NOT_POSITION_MANAGER'
    )
    invariant(isMint(options.v4AddLiquidityOptions), 'MINT_REQUIRED')
    invariant(options.v4AddLiquidityOptions.migrate, 'MIGRATE_REQUIRED')

    const planner = new RoutePlanner()

    // to prevent reentrancy by the pool hook, we initialize the v4 pool before moving funds
    if (options.v4AddLiquidityOptions.createPool) {
      const poolKey: PoolKey = V4Pool.getPoolKey(
        v4Pool.currency0,
        v4Pool.currency1,
        v4Pool.fee,
        v4Pool.tickSpacing,
        v4Pool.hooks
      )
      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [poolKey, v4Pool.sqrtRatioX96.toString()])
      // remove createPool setting, so that it doesnt get encoded again later
      delete options.v4AddLiquidityOptions.createPool
    }

    // add position permit to the universal router planner
    if (options.v3RemoveLiquidityOptions.permit) {
      // permit spender should be UR
      const universalRouterAddress = UNIVERSAL_ROUTER_ADDRESS(
        UniversalRouterVersion.V2_0,
        options.inputPosition.pool.chainId as SupportedChainsType
      )
      invariant(universalRouterAddress == options.v3RemoveLiquidityOptions.permit.spender, 'INVALID_SPENDER')
      // don't need to transfer it because v3posm uses isApprovedOrOwner()
      encodeV3PositionPermit(planner, options.v3RemoveLiquidityOptions.permit, options.v3RemoveLiquidityOptions.tokenId)
      // remove permit so that multicall doesnt add it again
      delete options.v3RemoveLiquidityOptions.permit
    }

    // encode v3 withdraw
    const v3RemoveParams: MethodParameters = V3PositionManager.removeCallParameters(
      options.inputPosition,
      options.v3RemoveLiquidityOptions
    )
    const v3Calls: string[] = Multicall.decodeMulticall(v3RemoveParams.calldata)

    for (const v3Call of v3Calls) {
      // slice selector - 0x + 4 bytes = 10 characters
      const selector = v3Call.slice(0, 10)
      invariant(
        selector == V3PositionManager.INTERFACE.getSighash('collect') ||
          selector == V3PositionManager.INTERFACE.getSighash('decreaseLiquidity') ||
          selector == V3PositionManager.INTERFACE.getSighash('burn'),
        'INVALID_V3_CALL: ' + selector
      )
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [v3Call])
    }

    // encode v4 mint
    const v4AddParams = V4PositionManager.addCallParameters(options.outputPosition, options.v4AddLiquidityOptions)
    // only modifyLiquidities can be called by the UniversalRouter
    const selector = v4AddParams.calldata.slice(0, 10)
    invariant(selector == V4PositionManager.INTERFACE.getSighash('modifyLiquidities'), 'INVALID_V4_CALL: ' + selector)

    planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [v4AddParams.calldata])

    return SwapRouter.encodePlan(planner, BigNumber.from(0), {
      deadline: BigNumber.from(options.v4AddLiquidityOptions.deadline),
    })
  }

  /**
   * Encodes a planned route into a method name and parameters for the Router contract.
   * @param planner the planned route
   * @param nativeCurrencyValue the native currency value of the planned route
   * @param config the router config
   */
  private static encodePlan(
    planner: RoutePlanner,
    nativeCurrencyValue: BigNumber,
    config: SwapRouterConfig = {}
  ): MethodParameters {
    const { commands, inputs } = planner
    const functionSignature = !!config.deadline ? 'execute(bytes,bytes[],uint256)' : 'execute(bytes,bytes[])'
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs]
    const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters)
    return { calldata, value: nativeCurrencyValue.toHexString() }
  }

  /**
   * Encodes a planned route into calldata targeting the SwapProxy contract.
   * The proxy pulls ERC20 tokens from the user into the UR, then executes commands.
   */
  private static encodeProxyPlan(planner: RoutePlanner, trade: UniswapTrade, options: SwapOptions): MethodParameters {
    return SwapRouter.encodeProxyCall(
      planner,
      (trade.trade.inputAmount.currency as { address: string }).address,
      BigNumber.from(trade.trade.maximumAmountIn(options.slippageTolerance).quotient.toString()),
      options.chainId!,
      options.urVersion ?? UniversalRouterVersion.V2_0,
      options.deadlineOrPreviousBlockhash ? BigNumber.from(options.deadlineOrPreviousBlockhash) : undefined
    )
  }

  private static encodeProxyCall(
    planner: RoutePlanner,
    inputToken: string,
    inputAmount: BigNumber,
    chainId: number,
    urVersion: UniversalRouterVersion,
    deadline?: BigNumberish
  ): MethodParameters {
    const { commands, inputs } = planner
    const routerAddress = UNIVERSAL_ROUTER_ADDRESS(urVersion, chainId)
    const resolvedDeadline = deadline
      ? BigNumber.from(deadline)
      : BigNumber.from(Math.floor(Date.now() / 1000) + DEFAULT_PROXY_DEADLINE_BUFFER_SECONDS)

    const calldata = SwapRouter.PROXY_INTERFACE.encodeFunctionData('execute', [
      routerAddress,
      inputToken,
      inputAmount,
      commands,
      inputs,
      resolvedDeadline,
    ])

    return { calldata, value: BigNumber.from(0).toHexString() }
  }

  private static normalizeEncodeSwapsSpec(spec: SwapSpecification): NormalizedSwapSpecification {
    return {
      ...spec,
      recipient: spec.recipient ?? SENDER_AS_RECIPIENT,
      tokenTransferMode: spec.tokenTransferMode ?? TokenTransferMode.Permit2,
      urVersion: spec.urVersion ?? UniversalRouterVersion.V2_0,
    }
  }
}
