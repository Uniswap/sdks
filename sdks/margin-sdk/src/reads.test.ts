import { describe, expect, test } from 'bun:test'
import { type Address, encodeFunctionData } from 'viem'

import { LENDING_ADAPTER_ABI, MARGIN_ACCOUNT_ABI, MARGIN_ROUTER_ABI, PERMIT2_ABI } from './abis.js'
import { encodeRouterPermit, permit2ApproveCall } from './encode.js'
import {
  accountManagerCall,
  accountOfCall,
  accountOwnerCall,
  currentLtvCall,
  describePositionCall,
  governanceCall,
  isAdapterAllowedCall,
  isSupportedMarketCall,
  maxLtvCall,
  positionOfCall,
} from './reads.js'

const ROUTER: Address = '0x0000000004BBC92D0657580CAe35aEBF054E5CDC'
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ACCOUNT: Address = '0x64487fb85302b5A2f38EF91144155986D331D2Fe'
const OWNER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const MARKET = { collateral: WETH, debt: USDC }

/**
 * The read layer is the backend's position/health-monitoring surface. Every descriptor must wire
 * the exact (address, abi, functionName, args) the venue-agnostic ILendingAdapter/router expose;
 * `encodeFunctionData` over each descriptor also proves the args ABI-encode against the SDK ABI.
 */
describe('read descriptors', () => {
  const cases: Array<{
    name: string
    call: { address: Address; abi: unknown; functionName: string; args: readonly unknown[] }
    address: Address
    args: readonly unknown[]
  }> = [
    {
      name: 'accountOf',
      call: accountOfCall({ marginRouter: ROUTER, owner: OWNER, subId: 7n }),
      address: ROUTER,
      args: [OWNER, 7n],
    },
    {
      name: 'isAdapterAllowed',
      call: isAdapterAllowedCall({ marginRouter: ROUTER, adapter: ADAPTER }),
      address: ROUTER,
      args: [ADAPTER],
    },
    { name: 'governance', call: governanceCall(ROUTER), address: ROUTER, args: [] },
    {
      name: 'isSupportedMarket',
      call: isSupportedMarketCall({ adapter: ADAPTER, market: MARKET }),
      address: ADAPTER,
      args: [MARKET],
    },
    {
      name: 'positionOf',
      call: positionOfCall({ adapter: ADAPTER, account: ACCOUNT, market: MARKET }),
      address: ADAPTER,
      args: [ACCOUNT, MARKET],
    },
    { name: 'maxLtvWad', call: maxLtvCall({ adapter: ADAPTER, market: MARKET }), address: ADAPTER, args: [MARKET] },
    {
      name: 'currentLtvWad',
      call: currentLtvCall({ adapter: ADAPTER, account: ACCOUNT, market: MARKET }),
      address: ADAPTER,
      args: [ACCOUNT, MARKET],
    },
    {
      name: 'describePosition',
      call: describePositionCall({ adapter: ADAPTER, account: ACCOUNT, market: MARKET }),
      address: ADAPTER,
      args: [ACCOUNT, MARKET],
    },
    { name: 'owner', call: accountOwnerCall(ACCOUNT), address: ACCOUNT, args: [] },
    { name: 'manager', call: accountManagerCall(ACCOUNT), address: ACCOUNT, args: [] },
  ]

  for (const { name, call, address, args } of cases) {
    test(`${name}Call wires address/function/args and ABI-encodes`, () => {
      const functionName =
        name === 'maxLtvWad' ? 'maxLtvWad' : name === 'currentLtvWad' ? 'currentLtvWad' : call.functionName
      expect(call.address).toBe(address)
      expect(call.functionName).toBe(functionName)
      expect(call.args).toEqual(args)
      // encoding against the SDK ABI proves the descriptor's args match the function's inputs
      expect(() =>
        encodeFunctionData({
          abi: call.abi as never,
          functionName: call.functionName as never,
          args: call.args as never,
        })
      ).not.toThrow()
    })
  }

  test('accountOfCall defaults subId to 0', () => {
    expect(accountOfCall({ marginRouter: ROUTER, owner: OWNER }).args).toEqual([OWNER, 0n])
  })

  test('descriptors reference the expected ABIs', () => {
    expect(accountOfCall({ marginRouter: ROUTER, owner: OWNER }).abi).toBe(MARGIN_ROUTER_ABI)
    expect(positionOfCall({ adapter: ADAPTER, account: ACCOUNT, market: MARKET }).abi).toBe(LENDING_ADAPTER_ABI)
    expect(accountOwnerCall(ACCOUNT).abi).toBe(MARGIN_ACCOUNT_ABI)
  })
})

describe('fund-authorization encoders (cast byte vectors)', () => {
  test('encodeRouterPermit matches cast calldata byte-for-byte (expiration/nonce order)', () => {
    // cast calldata 'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)'
    //   0xf39F… '((WETH,1000000000,1750000000,3),ROUTER,1790000000)' 0xdeadbeef
    const expected =
      '0x2b67b570000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000000684ee18000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000004bbc92d0657580cae35aebf054e5cdc000000000000000000000000000000000000000000000000000000006ab13b8000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000004deadbeef00000000000000000000000000000000000000000000000000000000'
    expect(
      encodeRouterPermit(
        OWNER,
        {
          details: { token: WETH, amount: 1_000_000_000n, expiration: 1_750_000_000, nonce: 3 },
          spender: ROUTER,
          sigDeadline: 1_790_000_000n,
        },
        '0xdeadbeef'
      )
    ).toBe(expected as `0x${string}`)
  })

  test('permit2ApproveCall encodes to the cast approve calldata byte-for-byte', () => {
    // cast calldata 'approve(address,address,uint160,uint48)' WETH ROUTER 1e18 281474976710655
    const expected =
      '0x87517c45000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000004bbc92d0657580cae35aebf054e5cdc0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000ffffffffffff'
    const call = permit2ApproveCall({
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      token: WETH,
      spender: ROUTER,
      amount: 10n ** 18n,
    })
    expect(call.abi).toBe(PERMIT2_ABI)
    expect(encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args as never })).toBe(
      expected as `0x${string}`
    )
  })
})
