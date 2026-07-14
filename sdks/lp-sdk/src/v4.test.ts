import { Interface } from '@ethersproject/abi'
import { MaxAllowanceTransferAmount, PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { CHAIN_TO_ADDRESSES_MAP, CurrencyAmount, Ether, MaxUint256, Percent, Token } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk'
import { getV4AddLiquidityGasEstimateTransactions } from './v4'

const ERC20_INTERFACE = new Interface(['function approve(address spender, uint256 amount) external returns (bool)'])
const PERMIT2_INTERFACE = new Interface([
  'function approve(address token, address spender, uint160 amount, uint48 expiration) external',
])
const EMPTY_HOOK = '0x0000000000000000000000000000000000000000'

describe('getV4AddLiquidityGasEstimateTransactions', () => {
  const currency0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
  const currency1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
  const pool = new Pool(currency0, currency1, 3000, 60, EMPTY_HOOK, encodeSqrtRatioX96(1, 1), 0, 0)

  const positionManager = CHAIN_TO_ADDRESSES_MAP[1].v4PositionManagerAddress as string
  const recipient = '0x000000000000000000000000000000000000000f'
  const deadline = '1800000000'
  const independentAmount = CurrencyAmount.fromRawAmount(currency0, (10n ** 18n).toString())
  const baseParams = { pool, tickLower: -60, tickUpper: 60, independentAmount, recipient, deadline }

  const expectedPosition = Position.fromAmount0({
    pool,
    tickLower: -60,
    tickUpper: 60,
    amount0: independentAmount.quotient,
    useFullPrecision: true,
  })

  it('returns ERC-20 and Permit2 approvals for both tokens plus the mint transaction when no allowances are given', () => {
    const transactions = getV4AddLiquidityGasEstimateTransactions(baseParams)

    expect(transactions).toHaveLength(5)
    expect(transactions[0]).toEqual({
      to: currency0.address,
      calldata: ERC20_INTERFACE.encodeFunctionData('approve', [PERMIT2_ADDRESS, MaxUint256.toString()]),
      value: '0x00',
    })
    expect(transactions[1]).toEqual({
      to: PERMIT2_ADDRESS,
      calldata: PERMIT2_INTERFACE.encodeFunctionData('approve', [
        currency0.address,
        positionManager,
        MaxAllowanceTransferAmount.toString(),
        deadline,
      ]),
      value: '0x00',
    })
    expect(transactions[2].to).toEqual(currency1.address)
    expect(transactions[3].to).toEqual(PERMIT2_ADDRESS)

    const expected = V4PositionManager.addCallParameters(expectedPosition, {
      recipient,
      createPool: undefined,
      sqrtPriceX96: undefined,
      slippageTolerance: new Percent(250, 10_000),
      deadline,
      useNative: undefined,
    })
    expect(transactions[4]).toEqual({ to: positionManager, calldata: expected.calldata, value: expected.value })
  })

  it('omits approvals covered by existing ERC-20 and Permit2 allowances', () => {
    const covered = {
      allowance: (10n ** 24n).toString(),
      permit2Allowance: { amount: MaxAllowanceTransferAmount.toString(), expiration: deadline },
    }
    const transactions = getV4AddLiquidityGasEstimateTransactions({
      ...baseParams,
      currency0: covered,
      currency1: covered,
    })

    expect(transactions).toHaveLength(1)
    expect(transactions[0].to).toEqual(positionManager)
  })

  it('includes a Permit2 approval when the existing permit expires before the deadline', () => {
    const transactions = getV4AddLiquidityGasEstimateTransactions({
      ...baseParams,
      currency0: {
        allowance: (10n ** 24n).toString(),
        permit2Allowance: { amount: MaxAllowanceTransferAmount.toString(), expiration: '1799999999' },
      },
      currency1: {
        allowance: (10n ** 24n).toString(),
        permit2Allowance: { amount: MaxAllowanceTransferAmount.toString(), expiration: deadline },
      },
    })

    expect(transactions).toHaveLength(2)
    expect(transactions[0].to).toEqual(PERMIT2_ADDRESS)
    expect(transactions[1].to).toEqual(positionManager)
  })

  it('skips approvals for the native side and attaches value for native pools', () => {
    const eth = Ether.onChain(1)
    const nativePool = new Pool(eth, currency1, 3000, 60, EMPTY_HOOK, encodeSqrtRatioX96(1, 1), 0, 0)

    const transactions = getV4AddLiquidityGasEstimateTransactions({
      ...baseParams,
      pool: nativePool,
      independentAmount: CurrencyAmount.fromRawAmount(eth, (10n ** 18n).toString()),
    })

    // ERC-20 + Permit2 approvals for currency1 only, then the mint carrying native value
    expect(transactions).toHaveLength(3)
    expect(transactions[0].to).toEqual(currency1.address)
    expect(transactions[1].to).toEqual(PERMIT2_ADDRESS)
    expect(transactions[2].to).toEqual(positionManager)
    expect(transactions[2].value).not.toEqual('0x00')

    // native v4 pools default to the tighter native slippage tolerance
    const expectedNativePosition = Position.fromAmount0({
      pool: nativePool,
      tickLower: -60,
      tickUpper: 60,
      amount0: independentAmount.quotient,
      useFullPrecision: true,
    })
    const expected = V4PositionManager.addCallParameters(expectedNativePosition, {
      recipient,
      createPool: undefined,
      sqrtPriceX96: undefined,
      slippageTolerance: new Percent(5, 10_000),
      deadline,
      useNative: eth,
    })
    expect(transactions[2].calldata).toEqual(expected.calldata)
    expect(transactions[2].value).toEqual(expected.value)
  })

  it('produces an increase transaction when tokenId is set', () => {
    const transactions = getV4AddLiquidityGasEstimateTransactions({
      ...baseParams,
      recipient: undefined,
      tokenId: '42',
    })

    const expected = V4PositionManager.addCallParameters(expectedPosition, {
      tokenId: '42',
      slippageTolerance: new Percent(250, 10_000),
      deadline,
      useNative: undefined,
    })
    expect(transactions[4]).toEqual({ to: positionManager, calldata: expected.calldata, value: expected.value })
  })

  it('throws when minting without a recipient', () => {
    expect(() => getV4AddLiquidityGasEstimateTransactions({ ...baseParams, recipient: undefined })).toThrow(
      'NO_RECIPIENT'
    )
  })
})
