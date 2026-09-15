import { Interface } from '@ethersproject/abi'
import { CurrencyAmount, Ether, MaxUint256, Token, V2_ROUTER_ADDRESSES, WETH9 } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { getV2AddLiquidityGasEstimateTransactions } from './v2'

const ERC20_INTERFACE = new Interface(['function approve(address spender, uint256 amount) external returns (bool)'])
const V2_ROUTER_INTERFACE = new Interface([
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256, uint256, uint256)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256, uint256, uint256)',
])

describe('getV2AddLiquidityGasEstimateTransactions', () => {
  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')
  // 1 USDC = 2 DAI
  const pair = new Pair(
    CurrencyAmount.fromRawAmount(USDC, (1_000_000n * 10n ** 6n).toString()),
    CurrencyAmount.fromRawAmount(DAI, (2_000_000n * 10n ** 18n).toString())
  )

  const router = V2_ROUTER_ADDRESSES[1]
  const recipient = '0x000000000000000000000000000000000000000f'
  const deadline = '1800000000'
  const independentAmount = CurrencyAmount.fromRawAmount(USDC, (100n * 10n ** 6n).toString())
  const baseParams = { pair, independentAmount, recipient, deadline }

  it('returns max approvals for both tokens plus the addLiquidity transaction when no allowances are given', () => {
    const transactions = getV2AddLiquidityGasEstimateTransactions(baseParams)

    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toEqual({
      to: pair.token0.address,
      calldata: ERC20_INTERFACE.encodeFunctionData('approve', [router, MaxUint256.toString()]),
      value: '0x00',
    })
    expect(transactions[1].to).toEqual(pair.token1.address)

    // dependent side quoted from reserves at 1 USDC = 2 DAI, mins at the default 2.5% slippage
    expect(transactions[2]).toEqual({
      to: router,
      calldata: V2_ROUTER_INTERFACE.encodeFunctionData('addLiquidity', [
        pair.token0.address,
        pair.token1.address,
        (200n * 10n ** 18n).toString(), // DAI sorts before USDC
        (100n * 10n ** 6n).toString(),
        (195n * 10n ** 18n).toString(),
        (975n * 10n ** 5n).toString(),
        recipient,
        deadline,
      ]),
      value: '0x00',
    })
  })

  it('omits approvals whose allowance already covers the required amount', () => {
    const transactions = getV2AddLiquidityGasEstimateTransactions({
      ...baseParams,
      token0: { allowance: (10n ** 24n).toString() },
      token1: { allowance: (10n ** 24n).toString() },
    })

    expect(transactions).toHaveLength(1)
    expect(transactions[0].to).toEqual(router)
  })

  it('uses addLiquidityETH and attaches value when one side is native', () => {
    const eth = Ether.onChain(1)
    // 1 ETH = 2000 DAI
    const ethPair = new Pair(
      CurrencyAmount.fromRawAmount(WETH9[1], (1_000n * 10n ** 18n).toString()),
      CurrencyAmount.fromRawAmount(DAI, (2_000_000n * 10n ** 18n).toString())
    )

    const transactions = getV2AddLiquidityGasEstimateTransactions({
      ...baseParams,
      pair: ethPair,
      independentAmount: CurrencyAmount.fromRawAmount(eth, (10n ** 18n).toString()),
    })

    // approval for DAI only, then addLiquidityETH carrying the native value
    expect(transactions).toHaveLength(2)
    expect(transactions[0].to).toEqual(DAI.address)
    expect(transactions[1].to).toEqual(router)
    expect(BigInt(transactions[1].value)).toEqual(10n ** 18n)

    const decoded = V2_ROUTER_INTERFACE.decodeFunctionData('addLiquidityETH', transactions[1].calldata)
    expect(decoded[0]).toEqual(DAI.address)
    expect(decoded[1].toString()).toEqual((2_000n * 10n ** 18n).toString())
    expect(decoded[4].toLowerCase()).toEqual(recipient.toLowerCase())
  })

  it('uses the dependent amount override when provided', () => {
    const emptyPair = new Pair(CurrencyAmount.fromRawAmount(USDC, 0), CurrencyAmount.fromRawAmount(DAI, 0))
    const transactions = getV2AddLiquidityGasEstimateTransactions({
      ...baseParams,
      pair: emptyPair,
      dependentAmount: CurrencyAmount.fromRawAmount(DAI, (300n * 10n ** 18n).toString()),
    })

    const decoded = V2_ROUTER_INTERFACE.decodeFunctionData('addLiquidity', transactions[2].calldata)
    expect(decoded[2].toString()).toEqual((300n * 10n ** 18n).toString())
    expect(decoded[3].toString()).toEqual((100n * 10n ** 6n).toString())
  })

  it('throws when the independent amount is not a pair token', () => {
    const OTHER = new Token(1, '0x0000000000000000000000000000000000000009', 18, 'OTHER')
    expect(() =>
      getV2AddLiquidityGasEstimateTransactions({
        ...baseParams,
        independentAmount: CurrencyAmount.fromRawAmount(OTHER, 1),
      })
    ).toThrow('INDEPENDENT_NOT_IN_PAIR')
  })
})
