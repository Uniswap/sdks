---
"@uniswap/uniswapx-sdk": major
---

fix: DCA intent EIP-712 hashing to match DCALib.sol

The DCA intent hashing in `order/v4/hashing.ts` diverged from the contract's
`DCALib.sol` on four independent axes, so a DCA intent signed with this SDK
produces a struct hash the contract does not reproduce.

- `FeedInfo` now carries a nested `FeedTemplate` instead of a `bytes32 feedId`.
  The contract hashes the template's own fields, so the feed identifier is
  derived from them rather than supplied separately.
- The referenced-struct order in `DCA_INTENT_TYPE` is now alphabetical, as
  EIP-712 requires: `FeedInfo`, `FeedTemplate`, `OutputAllocation`,
  `PrivateIntent`.
- `feedType` is hashed with `keccak256` instead of being encoded inline, and
  the `FeedInfo` field type is `bytes32` rather than `string`.
- Struct arrays are hashed as `keccak256` over the concatenated member hashes.
  `abi.encode` of a `bytes32[]` prepends an offset and a length word that the
  contract never produces. This affected the oracle feed array and the output
  allocation array.

**Breaking:** `FeedInfo` is an exported type, reachable through `v4/index.ts`
and `order/index.ts`. Its `feedId: string` and `feed_address: string` fields
are replaced by `feedTemplate: FeedTemplate` and `feedAddress: string`. Callers
constructing a `FeedInfo` must supply the template the contract hashes.

No DCA intent signed with the previous encoding can be verified by the
contract, so this makes an existing signature shape usable rather than
invalidating live ones - but the public type change is breaking and needs a
major release.
