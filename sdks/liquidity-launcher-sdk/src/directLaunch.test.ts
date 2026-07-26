import { describe, expect, it } from 'bun:test'
import { decodeAbiParameters, decodeFunctionData, getAddress } from 'viem'

import { LIQUIDITY_LAUNCHER_ABI, UERC20_FACTORY_ABI } from './abis'
import { getLauncherAddresses } from './addresses'
import { SupportedChainId } from './chains'
import {
  buildDirectLaunchTransaction,
  DIRECT_LAUNCH_TOKEN_DECIMALS,
  DIRECT_LAUNCH_TOTAL_SUPPLY_RAW,
  DISABLED_CREATOR_FEE_BENEFICIARY,
  getDirectLaunchAddresses,
  isDirectLaunchSupportedChain,
  predictDirectLaunchTokenAddressCall,
} from './directLaunch'
import { isLauncherSdkError } from './errors'
import { computeGraffiti } from './poolId'

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
  it('carries the Robinhood (4663) stack, on-chain-verified 2026-07-24', () => {
    const addresses = getDirectLaunchAddresses(CHAIN_ID)
    expect(addresses?.directLaunchStrategy).toBe(getAddress('0x6E572A882eD13e310204698e474D7A1c8Cc59215'))
    expect(addresses?.feeSplitter).toBe(getAddress('0xc98D02d3700818B3Af1Ec22dAA75F9FDe9C7d59B'))
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

  it('rejects a zero or launcher fee beneficiary (mirrors the strategy revert)', () => {
    expect(() =>
      buildDirectLaunchTransaction({
        ...BUILD_PARAMS,
        feeBeneficiary: '0x0000000000000000000000000000000000000000',
      })
    ).toThrow('fee beneficiary')
    const launcher = getDirectLaunchAddresses(CHAIN_ID)!.liquidityLauncher
    expect(() => buildDirectLaunchTransaction({ ...BUILD_PARAMS, feeBeneficiary: launcher })).toThrow('fee beneficiary')
  })

  it('accepts the disabled-creator-fee placeholder', () => {
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
