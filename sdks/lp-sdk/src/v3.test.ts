import { Interface } from '@ethersproject/abi'
import {
  CurrencyAmount,
  Ether,
  MaxUint256,
  NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  Percent,
  Token,
  WETH9,
} from '@uniswap/sdk-core'
import { encodeSqrtRatioX96, FeeAmount, NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import { getV3AddLiquidityGasEstimateTransactions } from './v3'

const ERC20_INTERFACE = new Interface(['function approve(address spender, uint256 amount) external returns (bool)'])

describe('getV3AddLiquidityGasEstimateTransactions', () => {
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
  const pool = new Pool(token0, token1, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])

  const positionManager = NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[1]
  const recipient = '0x000000000000000000000000000000000000000f'
  const deadline = '1800000000'
  const independentAmount = CurrencyAmount.fromRawAmount(token0, (10n ** 18n).toString())
  const baseParams = { pool, tickLower: -60, tickUpper: 60, independentAmount, recipient, deadline }

  const expectedPosition = Position.fromAmount0({
    pool,
    tickLower: -60,
    tickUpper: 60,
    amount0: independentAmount.quotient,
    useFullPrecision: true,
  })

  it('returns max approvals for both tokens plus the mint transaction when no allowances are given', () => {
    const transactions = getV3AddLiquidityGasEstimateTransactions(baseParams)

    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toEqual({
      to: token0.address,
      calldata: ERC20_INTERFACE.encodeFunctionData('approve', [positionManager, MaxUint256.toString()]),
      value: '0x00',
    })
    expect(transactions[1]).toEqual({
      to: token1.address,
      calldata: ERC20_INTERFACE.encodeFunctionData('approve', [positionManager, MaxUint256.toString()]),
      value: '0x00',
    })

    const expected = NonfungiblePositionManager.addCallParameters(expectedPosition, {
      recipient,
      createPool: undefined,
      slippageTolerance: new Percent(250, 10_000),
      deadline,
      useNative: undefined,
    })
    expect(transactions[2]).toEqual({ to: positionManager, calldata: expected.calldata, value: expected.value })
  })

  it('omits approvals whose allowance already covers the required amount', () => {
    const transactions = getV3AddLiquidityGasEstimateTransactions({
      ...baseParams,
      token0: { allowance: (10n ** 24n).toString() },
      token1: { allowance: (10n ** 24n).toString() },
    })

    expect(transactions).toHaveLength(1)
    expect(transactions[0].to).toEqual(positionManager)
  })

  it('prepends an approve(0) reset for tokens that require it', () => {
    const transactions = getV3AddLiquidityGasEstimateTransactions({
      ...baseParams,
      token0: { allowance: 1, requiresReset: true },
      token1: { allowance: (10n ** 24n).toString() },
    })

    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toEqual({
      to: token0.address,
      calldata: ERC20_INTERFACE.encodeFunctionData('approve', [positionManager, '0']),
      value: '0x00',
    })
    expect(transactions[1].to).toEqual(token0.address)
    expect(transactions[2].to).toEqual(positionManager)
  })

  it('skips the native side approval and attaches value when the independent amount is native', () => {
    const dai = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')
    const wethPool = new Pool(dai, WETH9[1], FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
    const eth = Ether.onChain(1)

    const transactions = getV3AddLiquidityGasEstimateTransactions({
      ...baseParams,
      pool: wethPool,
      independentAmount: CurrencyAmount.fromRawAmount(eth, (10n ** 18n).toString()),
    })

    // approval for DAI only, then the mint carrying native value
    expect(transactions).toHaveLength(2)
    expect(transactions[0].to).toEqual(dai.address)
    expect(transactions[1].to).toEqual(positionManager)
    expect(transactions[1].value).not.toEqual('0x00')
  })

  it('produces an increase transaction when tokenId is set', () => {
    const transactions = getV3AddLiquidityGasEstimateTransactions({
      ...baseParams,
      recipient: undefined,
      tokenId: '42',
    })

    const expected = NonfungiblePositionManager.addCallParameters(expectedPosition, {
      tokenId: '42',
      slippageTolerance: new Percent(250, 10_000),
      deadline,
      useNative: undefined,
    })
    expect(transactions[2]).toEqual({ to: positionManager, calldata: expected.calldata, value: expected.value })
  })

  it('throws when minting without a recipient', () => {
    expect(() => getV3AddLiquidityGasEstimateTransactions({ ...baseParams, recipient: undefined })).toThrow(
      'NO_RECIPIENT'
    )
  })
})
