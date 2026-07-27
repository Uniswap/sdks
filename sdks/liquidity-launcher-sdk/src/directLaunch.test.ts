import { describe, expect, it } from 'bun:test'
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, getAddress, toFunctionSelector } from 'viem'

import { LIQUIDITY_LAUNCHER_ABI, UERC20_FACTORY_ABI, V4_QUOTER_ABI } from './abis'
import { getLauncherAddresses } from './addresses'
import { SupportedChainId } from './chains'
import { ZERO_ADDRESS } from './constants'
import {
  buildDirectLaunchTransaction,
  DIRECT_LAUNCH_POOL_LP_FEE,
  DIRECT_LAUNCH_POOL_TICK_SPACING,
  DIRECT_LAUNCH_TOKEN_DECIMALS,
  DIRECT_LAUNCH_TOTAL_SUPPLY_RAW,
  DISABLED_CREATOR_FEE_BENEFICIARY,
  getDirectLaunchAddresses,
  getDirectLaunchPoolId,
  getDirectLaunchPoolKey,
  isDirectLaunchSupportedChain,
  predictDirectLaunchTokenAddressCall,
  quoteDirectLaunchBuyCall,
} from './directLaunch'
import { isLauncherSdkError } from './errors'
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
  feeBeneficiary: FEE_RECIPIENT,
  salt: SALT,
}

describe('getDirectLaunchAddresses', () => {
  it('carries the Robinhood (4663) stack from the 2026-07-27 redeploy', () => {
    const addresses = getDirectLaunchAddresses(CHAIN_ID)
    expect(addresses?.directLaunchStrategy).toBe(getAddress('0x2CB3650C70A88E5563b6A2Db0B609F886ec7DE4e'))
    expect(addresses?.feeSplitter).toBe(getAddress('0x7278d55E2fB14dB975d3DE07b3E6cd3081c03BA5'))
    expect(addresses?.beneficiaryVault).toBe(getAddress('0xB8997753B221Bd3e8D7143Ca2994cF4c18e619Bc'))
  })

  it('resolves the launcher-side contracts from the single launcher registry', () => {
    const direct = getDirectLaunchAddresses(CHAIN_ID)
    const launcher = getLauncherAddresses(CHAIN_ID)
    expect(direct?.liquidityLauncher).toBe(launcher!.liquidityLauncher)
    expect(direct?.uerc20Factory).toBe(launcher!.uerc20Factory!)
  })

  it('is undefined where the strategy/splitter are not deployed', () => {
    expect(getDirectLaunchAddresses(SupportedChainId.MAINNET)).toBeUndefined()
    expect(getDirectLaunchAddresses(999999)).toBeUndefined()
    expect(isDirectLaunchSupportedChain(CHAIN_ID)).toBe(true)
    expect(isDirectLaunchSupportedChain(SupportedChainId.MAINNET)).toBe(false)
  })
})

describe('predictDirectLaunchTokenAddressCall', () => {
  it('targets the factory view with the launcher as creator and the wallet in the graffiti', () => {
    const call = predictDirectLaunchTokenAddressCall({
      chainId: CHAIN_ID,
      wallet: WALLET,
      name: 'Test Token',
      symbol: 'TEST',
    })
    const addresses = getDirectLaunchAddresses(CHAIN_ID)
    expect(call.address).toBe(addresses!.uerc20Factory)
    expect(call.abi).toBe(UERC20_FACTORY_ABI)
    expect(call.functionName).toBe('getUERC20Address')
    expect(call.args).toEqual([
      'Test Token',
      'TEST',
      DIRECT_LAUNCH_TOKEN_DECIMALS,
      addresses!.liquidityLauncher,
      computeGraffiti(WALLET),
    ])
  })

  it('throws UNSUPPORTED_CHAIN for a chain without a deployed stack', () => {
    try {
      predictDirectLaunchTokenAddressCall({ chainId: 1, wallet: WALLET, name: 'T', symbol: 'T' })
      throw new Error('expected to throw')
    } catch (error) {
      expect(isLauncherSdkError(error)).toBe(true)
      expect((error as Error).message).toContain('not deployed')
    }
  })
})

describe('buildDirectLaunchTransaction', () => {
  it('builds one zero-value launcher multicall: createToken then distributeToken', () => {
    const transaction = buildDirectLaunchTransaction(BUILD_PARAMS)
    const addresses = getDirectLaunchAddresses(CHAIN_ID)
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
    expect(decimals).toBe(DIRECT_LAUNCH_TOKEN_DECIMALS)
    expect(initialSupply).toBe(DIRECT_LAUNCH_TOTAL_SUPPLY_RAW)
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
    expect(distribution.strategy).toBe(addresses!.directLaunchStrategy)
    expect(distribution.amount).toBe(DIRECT_LAUNCH_TOTAL_SUPPLY_RAW)
    const [config] = decodeAbiParameters(
      [{ type: 'tuple', components: [{ name: 'feeBeneficiary', type: 'address' }] }] as const,
      distribution.configData
    )
    expect(config.feeBeneficiary).toBe(FEE_RECIPIENT)
  })

  it('rejects a zero, launcher, or vault fee beneficiary (mirrors the on-chain reverts)', () => {
    expect(() =>
      buildDirectLaunchTransaction({
        ...BUILD_PARAMS,
        feeBeneficiary: '0x0000000000000000000000000000000000000000',
      })
    ).toThrow('fee beneficiary')
    const addresses = getDirectLaunchAddresses(CHAIN_ID)!
    expect(() =>
      buildDirectLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: addresses.liquidityLauncher })
    ).toThrow('fee beneficiary')
    // The BeneficiaryVault rejects itself at registration (InvalidBeneficiary).
    expect(() =>
      buildDirectLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: addresses.beneficiaryVault })
    ).toThrow('fee beneficiary')
  })

  it('accepts the disabled-creator-fee placeholder (the 4663 CompoundingClaimRecipient)', () => {
    expect(DISABLED_CREATOR_FEE_BENEFICIARY).toBe(getAddress('0x3fC7BA967295C10AFD2Ad4f098Dce3a71e6b8c73'))
    expect(() =>
      buildDirectLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: DISABLED_CREATOR_FEE_BENEFICIARY })
    ).not.toThrow()
  })

  it('throws UNSUPPORTED_CHAIN where Direct Launch is not deployed', () => {
    expect(() => buildDirectLaunchTransaction({ ...BUILD_PARAMS, chainId: SupportedChainId.MAINNET })).toThrow(
      'not deployed'
    )
  })
})

// A real 4663 Direct Launch token ("TTT"); its pool id and slot0 were read back on-chain 2026-07-26
// (StateView.getSlot0 → lpFee 2500, tick 121980). Launched via an earlier strategy deploy, but the
// pool-key derivation (hookless native-ETH pool at LP_FEE/TICK_SPACING) is identical across deploys,
// so it stays a valid golden vector for the PoolKey/PoolId math.
const LAUNCHED_TOKEN = getAddress('0xFb12A16F5842bA4886130cAA6664aB5db2D2F2fb')
const LAUNCHED_TOKEN_POOL_ID = '0xacab50a30661df2dd6bff53c7ba773a20a0efe0eea8b4216efd08caf557c73a3'

describe('getDirectLaunchPoolKey', () => {
  it('derives the hookless native-ETH pool at the strategy immutables, ETH always currency0', () => {
    expect(getDirectLaunchPoolKey(LAUNCHED_TOKEN)).toEqual({
      currency0: ZERO_ADDRESS,
      currency1: LAUNCHED_TOKEN,
      fee: DIRECT_LAUNCH_POOL_LP_FEE,
      tickSpacing: DIRECT_LAUNCH_POOL_TICK_SPACING,
      hooks: ZERO_ADDRESS,
    })
    expect(DIRECT_LAUNCH_POOL_LP_FEE).toBe(2500)
    expect(DIRECT_LAUNCH_POOL_TICK_SPACING).toBe(60)
  })

  it('EIP-55 normalizes a lowercase token address', () => {
    const key = getDirectLaunchPoolKey(LAUNCHED_TOKEN.toLowerCase() as `0x${string}`)
    expect(key.currency1).toBe(LAUNCHED_TOKEN)
  })

  it('rejects a malformed or zero token address with INVALID_INPUT', () => {
    for (const bad of ['0x1234', ZERO_ADDRESS] as const) {
      try {
        getDirectLaunchPoolKey(bad)
        throw new Error('expected to throw')
      } catch (error) {
        expect(isLauncherSdkError(error)).toBe(true)
        expect((error as { code: string }).code).toBe('INVALID_INPUT')
      }
    }
  })
})

describe('getDirectLaunchPoolId', () => {
  it('matches the on-chain pool id for the real launched token (golden vector)', () => {
    expect(getDirectLaunchPoolId(LAUNCHED_TOKEN)).toBe(LAUNCHED_TOKEN_POOL_ID)
  })

  it('is casing-independent (lowercase input → same pool id)', () => {
    expect(getDirectLaunchPoolId(LAUNCHED_TOKEN.toLowerCase() as `0x${string}`)).toBe(LAUNCHED_TOKEN_POOL_ID)
  })

  it('agrees with the generic computeLbpPoolId derivation', () => {
    expect(getDirectLaunchPoolId(LAUNCHED_TOKEN)).toBe(
      computeLbpPoolId(
        ZERO_ADDRESS,
        LAUNCHED_TOKEN,
        DIRECT_LAUNCH_POOL_LP_FEE,
        DIRECT_LAUNCH_POOL_TICK_SPACING,
        ZERO_ADDRESS
      )
    )
  })
})

describe('quoteDirectLaunchBuyCall', () => {
  const V4_QUOTER = getAddress('0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94') // 4663

  it('describes an exact-in ETH→token quoteExactInputSingle on the launch pool', () => {
    const call = quoteDirectLaunchBuyCall({ v4Quoter: V4_QUOTER, token: LAUNCHED_TOKEN, exactAmountInWei: 10n ** 15n })
    expect(call.address).toBe(V4_QUOTER)
    expect(call.abi).toBe(V4_QUOTER_ABI)
    expect(call.functionName).toBe('quoteExactInputSingle')
    expect(call.args).toEqual([
      {
        poolKey: getDirectLaunchPoolKey(LAUNCHED_TOKEN),
        zeroForOne: true,
        exactAmount: 10n ** 15n,
        hookData: '0x',
      },
    ])
  })

  it('encodes to the live-verified calldata (selector + argument layout golden vector)', () => {
    // This exact eth_call quoted 0.001 ETH → 197.775299 TTT on 4663 (2026-07-26).
    expect(toFunctionSelector(V4_QUOTER_ABI[0])).toBe('0xaa9d21cb')
    const call = quoteDirectLaunchBuyCall({ v4Quoter: V4_QUOTER, token: LAUNCHED_TOKEN, exactAmountInWei: 10n ** 15n })
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
