import { type Abi } from 'viem'

/**
 * ABIs for the margin stack. The margin-contract ABIs are FORGE-GENERATED from a pinned
 * v4-periphery commit (`src/generated/abis.ts`, regenerated with `bun run regenerate:abis` and
 * CI-verified against a fresh build of the pin with `bun run check:abis`) — nothing hand-written
 * can drift from the deployed contracts. Each is `as const satisfies Abi` so viem/wagmi infer
 * argument and return types; the deployed entry-point selectors are additionally anchored against
 * the live mainnet router in encode.test.ts.
 */
export {
  AAVE_LENDING_ADAPTER_ABI,
  AAVE_V4_LENDING_ADAPTER_ABI,
  COMPOUND_V3_LENDING_ADAPTER_ABI,
  ILENDING_ADAPTER_ABI,
  LENDING_ADAPTER_ABI,
  MARGIN_ACCOUNT_ABI,
  MARGIN_ROUTER_ABI,
  MORPHO_LENDING_ADAPTER_ABI,
  V4_PERIPHERY_PIN,
} from './generated/abis.js'

/**
 * Minimal Permit2 AllowanceTransfer surface used by the equity-funding flow. Hand-written and
 * excluded from the generated bindings deliberately: canonical Permit2 is immutable and identical
 * on every chain, so there is no source to drift from.
 */
export const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const satisfies Abi

/**
 * Minimal Aave v3 AaveProtocolDataProvider surface used for market discovery (`markets.ts`):
 * enumerating reserves and reading the collateral/borrow eligibility flags. Hand-written like
 * PERMIT2_ABI: this is Aave's own external protocol, not a v4-periphery contract, so there is
 * nothing to pin or regenerate from. Field order verified against the live mainnet DataProvider
 * the margin Aave v3 adapter resolves via its own `dataProvider()` getter.
 */
export const AAVE_V3_DATA_PROVIDER_ABI = [
  {
    type: 'function',
    name: 'getAllReservesTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'symbol', type: 'string' },
          { name: 'tokenAddress', type: 'address' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getReserveConfigurationData',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'decimals', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'liquidationThreshold', type: 'uint256' },
      { name: 'liquidationBonus', type: 'uint256' },
      { name: 'reserveFactor', type: 'uint256' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
      { name: 'borrowingEnabled', type: 'bool' },
      { name: 'stableBorrowRateEnabled', type: 'bool' },
      { name: 'isActive', type: 'bool' },
      { name: 'isFrozen', type: 'bool' },
    ],
  },
] as const satisfies Abi

/**
 * Minimal Aave v4 Spoke surface used for market discovery, beyond what the margin adapter ABI
 * already forwards. Reserve ids are a dense sequence starting at 0 with no enumeration method
 * (verified onchain: `getReserve` on an unused id reverts `ReserveNotListed`), so discovery scans
 * ids until the first revert.
 */
export const AAVE_V4_SPOKE_RESERVES_ABI = [
  {
    type: 'function',
    name: 'getReserve',
    stateMutability: 'view',
    inputs: [{ name: 'reserveId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'underlying', type: 'address' },
          { name: 'hub', type: 'address' },
          { name: 'assetId', type: 'uint16' },
          { name: 'decimals', type: 'uint8' },
          { name: 'collateralRisk', type: 'uint24' },
          { name: 'flags', type: 'uint8' },
          { name: 'dynamicConfigKey', type: 'uint32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getReserveConfig',
    stateMutability: 'view',
    inputs: [{ name: 'reserveId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'collateralRisk', type: 'uint24' },
          { name: 'paused', type: 'bool' },
          { name: 'frozen', type: 'bool' },
          { name: 'borrowable', type: 'bool' },
          { name: 'receiveSharesEnabled', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getDynamicReserveConfig',
    stateMutability: 'view',
    inputs: [
      { name: 'reserveId', type: 'uint256' },
      { name: 'dynamicConfigKey', type: 'uint32' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'collateralFactor', type: 'uint16' },
          { name: 'maxLiquidationBonus', type: 'uint32' },
          { name: 'liquidationFee', type: 'uint16' },
        ],
      },
    ],
  },
] as const satisfies Abi

/**
 * Minimal Compound v3 Comet surface used for market discovery, beyond what the margin adapter ABI
 * already forwards (`baseToken`). Collateral assets are enumerable: `numAssets()` plus
 * `getAssetInfo(i)` for `i` in `[0, numAssets)`.
 */
export const COMPOUND_V3_COMET_ASSETS_ABI = [
  {
    type: 'function',
    name: 'numAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'getAssetInfo',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint8' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'offset', type: 'uint8' },
          { name: 'asset', type: 'address' },
          { name: 'priceFeed', type: 'address' },
          { name: 'scale', type: 'uint64' },
          { name: 'borrowCollateralFactor', type: 'uint64' },
          { name: 'liquidateCollateralFactor', type: 'uint64' },
          { name: 'liquidationFactor', type: 'uint64' },
          { name: 'supplyCap', type: 'uint128' },
        ],
      },
    ],
  },
] as const satisfies Abi
