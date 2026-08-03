import { describe, expect, it } from 'bun:test'
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, getAddress, toFunctionSelector } from 'viem'

import { LIQUIDITY_LAUNCHER_ABI, UERC20_FACTORY_ABI, V4_QUOTER_ABI } from './abis'
import { getInstantLaunchDeployment, getInstantLaunchStrategy, getLauncherAddresses } from './addresses'
import { SupportedChainId } from './chains'
import { ZERO_ADDRESS } from './constants'
import { isLauncherSdkError } from './errors'
import {
  buildInstantLaunchTransaction,
  DISABLED_CREATOR_FEE_BENEFICIARY,
  getInstantLaunchAddresses,
  getInstantLaunchPoolId,
  getInstantLaunchPoolKey,
  INSTANT_LAUNCH_POOL_LP_FEE,
  INSTANT_LAUNCH_POOL_TICK_SPACING,
  INSTANT_LAUNCH_TOKEN_DECIMALS,
  INSTANT_LAUNCH_TOTAL_SUPPLY_RAW,
  isInstantLaunchSupportedChain,
  predictInstantLaunchTokenAddressCall,
  quoteInstantLaunchBuyCall,
} from './instantLaunch'
import { computeGraffiti, computeLbpPoolId } from './poolId'

const CHAIN_ID = SupportedChainId.ROBINHOOD
const WALLET = getAddress('0x51b0bad1e2977ad4a256d4863f569923d3a10b1d')
const PREDICTED_TOKEN = getAddress('0x00000000000000000000000000000000000000bb')
const FEE_RECIPIENT = getAddress('0x00000000000000000000000000000000000000cc')
const SALT = `0x${'11'.repeat(32)}` as const

const BUILD_PARAMS = {
  chainId: CHAIN_ID,
  name: 'Test Token',
  symbol: 'TEST',
  predictedTokenAddress: PREDICTED_TOKEN,
  metadata: { description: 'A test launch', website: '', image: 'ipfs://cid', extraData: '0x' as const },
  creatorFeesEnabled: true,
  feeBeneficiary: FEE_RECIPIENT,
  salt: SALT,
} as const

describe('getInstantLaunchAddresses', () => {
  it('resolves the fees-on Robinhood (4663) stack from the canonical dev-README deployment', () => {
    const addresses = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: true })
    expect(addresses?.strategy).toBe(getAddress('0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00'))
    expect(addresses?.feeSplitter).toBe(getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'))
    expect(addresses?.beneficiaryVault).toBe(getAddress('0x587D2fDDDF14F6f84022b51e8c3a473eB88C4544'))
    expect(addresses?.compoundingClaimRecipient).toBe(getAddress('0x666DA63451A502A323677C2Ef5F763181358be9b'))
    expect(addresses?.creatorFeesEnabled).toBe(true)
  })

  it('resolves the fees-off Robinhood stack to its own strategy + splitter, same singletons', () => {
    const on = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: true })
    const off = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: false })
    expect(off?.strategy).toBe(getAddress('0x16b63f1c8415FD68591c31FB3c6796a333DD640C'))
    expect(off?.feeSplitter).toBe(getAddress('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23'))
    expect(off?.strategy).not.toBe(on!.strategy)
    expect(off?.feeSplitter).not.toBe(on!.feeSplitter)
    expect(off?.beneficiaryVault).toBe(on!.beneficiaryVault)
    expect(off?.compoundingClaimRecipient).toBe(on!.compoundingClaimRecipient)
    expect(off?.creatorFeesEnabled).toBe(false)
  })

  it('resolves the launcher-side contracts from the single launcher registry', () => {
    const stack = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: true })
    const launcher = getLauncherAddresses(CHAIN_ID)
    expect(stack?.liquidityLauncher).toBe(launcher!.liquidityLauncher)
    expect(stack?.uerc20Factory).toBe(launcher!.uerc20Factory!)
  })

  it('is undefined where the stack is not deployed', () => {
    expect(getInstantLaunchAddresses(SupportedChainId.MAINNET, { creatorFeesEnabled: true })).toBeUndefined()
    expect(getInstantLaunchAddresses(999999, { creatorFeesEnabled: false })).toBeUndefined()
    expect(isInstantLaunchSupportedChain(CHAIN_ID)).toBe(true)
    expect(isInstantLaunchSupportedChain(SupportedChainId.MAINNET)).toBe(false)
  })
})

describe('predictInstantLaunchTokenAddressCall', () => {
  it('targets the factory view with the launcher as creator and the wallet in the graffiti', () => {
    const call = predictInstantLaunchTokenAddressCall({
      chainId: CHAIN_ID,
      wallet: WALLET,
      name: 'Test Token',
      symbol: 'TEST',
    })
    const launcher = getLauncherAddresses(CHAIN_ID)
    expect(call.address).toBe(launcher!.uerc20Factory!)
    expect(call.abi).toBe(UERC20_FACTORY_ABI)
    expect(call.functionName).toBe('getUERC20Address')
    expect(call.args).toEqual([
      'Test Token',
      'TEST',
      INSTANT_LAUNCH_TOKEN_DECIMALS,
      launcher!.liquidityLauncher,
      computeGraffiti(WALLET),
    ])
  })

  it('throws UNSUPPORTED_CHAIN for a chain without a deployed stack', () => {
    try {
      predictInstantLaunchTokenAddressCall({ chainId: 1, wallet: WALLET, name: 'T', symbol: 'T' })
      throw new Error('expected to throw')
    } catch (error) {
      expect(isLauncherSdkError(error)).toBe(true)
      expect((error as Error).message).toContain('not deployed')
    }
  })
})

describe('buildInstantLaunchTransaction', () => {
  it('builds one zero-value launcher multicall: createToken then distributeToken', () => {
    const transaction = buildInstantLaunchTransaction(BUILD_PARAMS)
    const addresses = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: true })
    expect(transaction.to).toBe(addresses!.liquidityLauncher)
    expect(transaction.value).toBe(0n)
    expect(transaction.chainId).toBe(CHAIN_ID)

    const multicall = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: transaction.data })
    expect(multicall.functionName).toBe('multicall')
    const calls = multicall.args[0] as readonly `0x${string}`[]
    expect(calls).toHaveLength(2)

    const create = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: calls[0]! })
    expect(create.functionName).toBe('createToken')
    const [factory, name, symbol, decimals, initialSupply, recipient] = create.args as unknown as readonly [
      string,
      string,
      string,
      number,
      bigint,
      string,
      `0x${string}`
    ]
    expect(factory).toBe(addresses!.uerc20Factory)
    expect(name).toBe('Test Token')
    expect(symbol).toBe('TEST')
    expect(decimals).toBe(INSTANT_LAUNCH_TOKEN_DECIMALS)
    expect(initialSupply).toBe(INSTANT_LAUNCH_TOTAL_SUPPLY_RAW)
    // The launcher must receive the mint so distributeToken can hand it to the strategy.
    expect(recipient).toBe(addresses!.liquidityLauncher)

    const distribute = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: calls[1]! })
    expect(distribute.functionName).toBe('distributeToken')
    const [token, distribution, salt] = distribute.args as unknown as readonly [
      string,
      { strategy: string; amount: bigint; configData: `0x${string}` },
      `0x${string}`
    ]
    expect(token).toBe(PREDICTED_TOKEN)
    expect(salt).toBe(SALT)
    expect(distribution.strategy).toBe(addresses!.strategy)
    expect(distribution.amount).toBe(INSTANT_LAUNCH_TOTAL_SUPPLY_RAW)
    const [config] = decodeAbiParameters(
      [{ type: 'tuple', components: [{ name: 'feeBeneficiary', type: 'address' }] }] as const,
      distribution.configData
    )
    expect(config.feeBeneficiary).toBe(FEE_RECIPIENT)
  })

  it('selects the fees-off strategy and encodes the placeholder beneficiary when creator fees are off', () => {
    const transaction = buildInstantLaunchTransaction({
      ...BUILD_PARAMS,
      creatorFeesEnabled: false,
      feeBeneficiary: undefined,
    })
    const offStack = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: false })

    const multicall = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: transaction.data })
    const calls = multicall.args[0] as readonly `0x${string}`[]
    const distribute = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: calls[1]! })
    const [, distribution] = distribute.args as unknown as readonly [
      string,
      { strategy: string; amount: bigint; configData: `0x${string}` }
    ]
    expect(distribution.strategy).toBe(offStack!.strategy)
    const [config] = decodeAbiParameters(
      [{ type: 'tuple', components: [{ name: 'feeBeneficiary', type: 'address' }] }] as const,
      distribution.configData
    )
    // The config field is mandatory on-chain even though the fees-off instance ignores it; the
    // placeholder must be non-zero and not the launcher.
    expect(config.feeBeneficiary).toBe(DISABLED_CREATOR_FEE_BENEFICIARY)
    expect(DISABLED_CREATOR_FEE_BENEFICIARY).not.toBe(ZERO_ADDRESS)
    expect(DISABLED_CREATOR_FEE_BENEFICIARY).not.toBe(offStack!.liquidityLauncher)
  })

  it('rejects a zero, launcher, or vault fee beneficiary (mirrors the on-chain reverts)', () => {
    expect(() =>
      buildInstantLaunchTransaction({
        ...BUILD_PARAMS,
        feeBeneficiary: '0x0000000000000000000000000000000000000000',
      })
    ).toThrow('fee beneficiary')
    const addresses = getInstantLaunchAddresses(CHAIN_ID, { creatorFeesEnabled: true })!
    expect(() =>
      buildInstantLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: addresses.liquidityLauncher })
    ).toThrow('fee beneficiary')
    // The BeneficiaryVault rejects itself at registration (InvalidBeneficiary).
    expect(() =>
      buildInstantLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: addresses.beneficiaryVault })
    ).toThrow('fee beneficiary')
  })

  it('rejects a fee beneficiary passed alongside creatorFeesEnabled: false', () => {
    expect(() =>
      buildInstantLaunchTransaction({
        ...BUILD_PARAMS,
        creatorFeesEnabled: false,
        // Cast: the type forbids this pairing; the runtime guard must catch untyped callers.
        feeBeneficiary: FEE_RECIPIENT as unknown as undefined,
      })
    ).toThrow('creator fees are disabled')
  })

  it('throws UNSUPPORTED_CHAIN where Instant Launch is not deployed', () => {
    expect(() => buildInstantLaunchTransaction({ ...BUILD_PARAMS, chainId: SupportedChainId.MAINNET })).toThrow(
      'not deployed'
    )
  })
})

describe('deployment registry selectors', () => {
  it('getInstantLaunchStrategy keys the variant by creatorFeesEnabled', () => {
    const on = getInstantLaunchStrategy(CHAIN_ID, { creatorFeesEnabled: true })
    const off = getInstantLaunchStrategy(CHAIN_ID, { creatorFeesEnabled: false })
    expect(on?.strategy).toBe(getAddress('0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00'))
    expect(on?.creatorFeeNativeBps).toBe(4000)
    expect(on?.creatorFeeTokenBps).toBe(0)
    expect(off?.strategy).toBe(getAddress('0x16b63f1c8415FD68591c31FB3c6796a333DD640C'))
    expect(off?.creatorFeeNativeBps).toBe(0)
  })

  it('getInstantLaunchDeployment reverse-resolves a stored strategy address case-insensitively', () => {
    // A historical (c3f9506) strategy with indexed launches: stays resolvable after later appends.
    const deployment = getInstantLaunchDeployment('0x60d73b21cdf2ea846ab3d58699bbbb8f29d72491')
    expect(deployment?.chainId).toBe(CHAIN_ID)
    expect(deployment?.creatorFeesEnabled).toBe(true)
    expect(deployment?.feeSplitter).toBe(getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'))
    // The intermediate (8e40a35) generation resolves too, and is not the current selection.
    const intermediate = getInstantLaunchDeployment('0xce57498d3474dcc244dfb6710ffbe6d4441cd2b2')
    expect(intermediate?.creatorFeesEnabled).toBe(true)
    expect(intermediate).not.toBe(getInstantLaunchStrategy(CHAIN_ID, { creatorFeesEnabled: true })!)
    expect(getInstantLaunchDeployment('0x00000000000000000000000000000000000000aa')).toBeUndefined()
  })
})

// A real 4663 Instant Launch token ("TTT"); its pool id and slot0 were read back on-chain 2026-07-26
// (StateView.getSlot0 → lpFee 2500). Launched via an earlier strategy deploy, but the pool-key
// derivation (hookless native-ETH pool at LP_FEE/TICK_SPACING) is identical across deploys, so it
// stays a valid golden vector for the PoolKey/PoolId math.
const LAUNCHED_TOKEN = getAddress('0xFb12A16F5842bA4886130cAA6664aB5db2D2F2fb')
const LAUNCHED_TOKEN_POOL_ID = '0xacab50a30661df2dd6bff53c7ba773a20a0efe0eea8b4216efd08caf557c73a3'

describe('getInstantLaunchPoolKey', () => {
  it('derives the hookless native-ETH pool at the strategy immutables, ETH always currency0', () => {
    expect(getInstantLaunchPoolKey(LAUNCHED_TOKEN)).toEqual({
      currency0: ZERO_ADDRESS,
      currency1: LAUNCHED_TOKEN,
      fee: INSTANT_LAUNCH_POOL_LP_FEE,
      tickSpacing: INSTANT_LAUNCH_POOL_TICK_SPACING,
      hooks: ZERO_ADDRESS,
    })
    expect(INSTANT_LAUNCH_POOL_LP_FEE).toBe(2500)
    expect(INSTANT_LAUNCH_POOL_TICK_SPACING).toBe(60)
  })

  it('EIP-55 normalizes a lowercase token address', () => {
    const key = getInstantLaunchPoolKey(LAUNCHED_TOKEN.toLowerCase() as `0x${string}`)
    expect(key.currency1).toBe(LAUNCHED_TOKEN)
  })

  it('rejects a malformed or zero token address with INVALID_INPUT', () => {
    for (const bad of ['0x1234', ZERO_ADDRESS] as const) {
      try {
        getInstantLaunchPoolKey(bad)
        throw new Error('expected to throw')
      } catch (error) {
        expect(isLauncherSdkError(error)).toBe(true)
        expect((error as { code: string }).code).toBe('INVALID_INPUT')
      }
    }
  })
})

describe('getInstantLaunchPoolId', () => {
  it('matches the on-chain pool id for the real launched token (golden vector)', () => {
    expect(getInstantLaunchPoolId(LAUNCHED_TOKEN)).toBe(LAUNCHED_TOKEN_POOL_ID)
  })

  it('is casing-independent (lowercase input → same pool id)', () => {
    expect(getInstantLaunchPoolId(LAUNCHED_TOKEN.toLowerCase() as `0x${string}`)).toBe(LAUNCHED_TOKEN_POOL_ID)
  })

  it('agrees with the generic computeLbpPoolId derivation', () => {
    expect(getInstantLaunchPoolId(LAUNCHED_TOKEN)).toBe(
      computeLbpPoolId(
        ZERO_ADDRESS,
        LAUNCHED_TOKEN,
        INSTANT_LAUNCH_POOL_LP_FEE,
        INSTANT_LAUNCH_POOL_TICK_SPACING,
        ZERO_ADDRESS
      )
    )
  })
})

describe('quoteInstantLaunchBuyCall', () => {
  const V4_QUOTER = getAddress('0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94') // 4663

  it('describes an exact-in ETH→token quoteExactInputSingle on the launch pool', () => {
    const call = quoteInstantLaunchBuyCall({ v4Quoter: V4_QUOTER, token: LAUNCHED_TOKEN, exactAmountInWei: 10n ** 15n })
    expect(call.address).toBe(V4_QUOTER)
    expect(call.abi).toBe(V4_QUOTER_ABI)
    expect(call.functionName).toBe('quoteExactInputSingle')
    expect(call.args).toEqual([
      {
        poolKey: getInstantLaunchPoolKey(LAUNCHED_TOKEN),
        zeroForOne: true,
        exactAmount: 10n ** 15n,
        hookData: '0x',
      },
    ])
  })

  it('encodes to the live-verified calldata (selector + argument layout golden vector)', () => {
    // This exact eth_call quoted 0.001 ETH → 197.775299 TTT on 4663 (2026-07-26).
    expect(toFunctionSelector(V4_QUOTER_ABI[0])).toBe('0xaa9d21cb')
    const call = quoteInstantLaunchBuyCall({ v4Quoter: V4_QUOTER, token: LAUNCHED_TOKEN, exactAmountInWei: 10n ** 15n })
    const data = encodeFunctionData({ abi: call.abi, functionName: 'quoteExactInputSingle', args: call.args as never })
    expect(data).toBe(
      '0xaa9d21cb' +
        '0000000000000000000000000000000000000000000000000000000000000020' + // params tuple offset
        '0000000000000000000000000000000000000000000000000000000000000000' + // currency0 = native ETH
        '000000000000000000000000fb12a16f5842ba4886130caa6664ab5db2d2f2fb' + // currency1 = token
        '00000000000000000000000000000000000000000000000000000000000009c4' + // fee = 2500
        '000000000000000000000000000000000000000000000000000000000000003c' + // tickSpacing = 60
        '0000000000000000000000000000000000000000000000000000000000000000' + // hooks = address(0)
        '0000000000000000000000000000000000000000000000000000000000000001' + // zeroForOne = true
        '00000000000000000000000000000000000000000000000000038d7ea4c68000' + // exactAmount = 1e15
        '0000000000000000000000000000000000000000000000000000000000000100' + // hookData offset
        '0000000000000000000000000000000000000000000000000000000000000000' // hookData = empty
    )
  })
})
