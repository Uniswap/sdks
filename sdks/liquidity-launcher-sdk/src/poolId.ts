import { type Address, type Hex, encodeAbiParameters, keccak256 } from 'viem'

/**
 * Compute the Uniswap v4 PoolId for a launch pool, matching the on-chain `PoolKey.toId()`:
 * `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))` with the two currencies
 * sorted ascending.
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
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [currency0, currency1, fee, tickSpacing, hook]
    )
  )
}

/** `graffiti = keccak256(abi.encode(originalCreator))` — `LiquidityLauncher.getGraffiti`. */
export function computeGraffiti(originalCreator: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [originalCreator]))
}
