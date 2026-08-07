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
