import { type Address, type Hex, encodeAbiParameters, keccak256 } from 'viem'

/**
 * A Uniswap v4 `PoolKey`, currencies pre-sorted ascending exactly as the on-chain struct is
 * constructed (native `address(0)` sorts first). This is the canonical input to {@link computeV4PoolId}.
 */
export interface V4PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

/**
 * Compute a Uniswap v4 PoolId from an already-sorted {@link V4PoolKey}, matching the on-chain
 * `PoolKey.toId()`: `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`. The
 * currencies are assumed already address-sorted, exactly as a real v4 `PoolKey` is constructed.
 */
export function computeV4PoolId(poolKey: V4PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    )
  )
}

/**
 * Compute the Uniswap v4 PoolId for a launch pool, matching the on-chain `PoolKey.toId()`:
 * `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))` with the two currencies
 * sorted ascending, then delegating to {@link computeV4PoolId}.
 *
 * The same pool id is used two ways: to look up the LBPStrategy's `registeredPoolIds[poolId]`
 * reservation, and to read the v4 `StateView.getSlot0(poolId)` initialization state. Pass the
 * REGISTERED hook (address(0) for the standard hookless launch pool) so the key matches what the
 * strategy stored.
 */
export function computeLbpPoolId(
  currency: Address,
  token: Address,
  fee: number,
  tickSpacing: number,
  hook: Address
): Hex {
  const [currency0, currency1] = BigInt(currency) < BigInt(token) ? [currency, token] : [token, currency]
  return computeV4PoolId({ currency0, currency1, fee, tickSpacing, hooks: hook })
}

/** `graffiti = keccak256(abi.encode(originalCreator))` — `LiquidityLauncher.getGraffiti`. */
export function computeGraffiti(originalCreator: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [originalCreator]))
}
