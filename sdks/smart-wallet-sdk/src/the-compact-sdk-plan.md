# The Compact SDK

The Compact SDK is a TypeScript SDK for building and interacting with [The Compact v1][3]. This document is intended to guide but not strictly constrain development.

## 0. Top‑level goals

**Primary objective**

Provide a TS SDK that makes it easy to:

- Build and sign EIP‑712 **compacts** (`Compact`, `BatchCompact`, `MultichainCompact`) ([Uniswap Docs][1])
- Build **claim** payloads (`Claim`, `BatchClaim`, multichain variants) with correct `claimant` packing and witness hashing ([Uniswap Docs][2])
- Call `ITheCompact` / `ITheCompactClaims` safely with strongly‑typed payloads and decoded errors (see [Uniswap Docs][2])

…without every integrator re‑implementing the weird witness typestring / packing / Permit2 semantics. ([Uniswap Docs][1])

**Design constraints**

- First‑class support for:

  - Ethereum mainnet, Base, Unichain (same address `0x00000000000000171ede64904551eeDF3C6C9788`) ([Uniswap Docs][3])
  - Drop‑in support for custom deployments (same bytecode elsewhere).

- Framework‑agnostic core (just TS + viem primitives), with optional adapters for ethers later.
- Fluent builders for ergonomics, but everything decomposes down into plain TS structs that mirror the Solidity structs exactly.

---

## 1. Package layout & modules

Proposed structure:

```txt
src/
  index.ts

  config/
    chains.ts          // chain metadata, default addresses
    domain.ts          // EIP-712 domain helpers

  abi/
    theCompact.ts      // ABI + TS types
    theCompactClaims.ts
    // potentially allocator/emissary ABIs as needed

  types/
    eip712.ts          // Compact / BatchCompact / MultichainCompact, Element, Lock, Mandate
    claims.ts          // Claim, BatchClaim, MultichainClaim, etc.
    runtime.ts         // enums: Scope, ResetPeriod, CompactCategory...

  builders/
    compact.ts         // CompactBuilder (single/batch/multichain)
    claim.ts           // ClaimBuilder (+ batch/multichain variants)
    deposit.ts         // Deposit/deposit+register & Permit2 helpers
    mandate.ts         // MandateType definitions, witness hashing & typestrings

  encoding/
    locks.ts           // lockTag helpers, id encode/decode
    claimants.ts       // claimant pack/unpack
    hashes.ts          // claimHash, elementsHash, idsAndAmountsHash, etc.

  client/
    coreClient.ts      // createCompactClient()
    sponsor.ts
    arbiter.ts
    relayer.ts
    allocator.ts
    view.ts

  errors/
    decode.ts          // revert data decoder => rich error types
    types.ts
```

We can export “low‑level” utilities (encoding, types, hashes) for power users, while the builders & client cover most integrations.

---

## 2. Core primitives & config

### 2.1 Chain + contract config

```ts
// config/chains.ts
export interface CompactDeployment {
  chainId: number
  address: `0x${string}`
}

export const defaultDeployments: CompactDeployment[] = [
  { chainId: 1, address: '0x00000000000000171ede64904551eeDF3C6C9788' },
  { chainId: 8453, address: '0x00000000000000171ede64904551eeDF3C6C9788' }, // Base
  { chainId: 130, address: '0x00000000000000171ede64904551eeDF3C6C9788' }, // Unichain (example)
]
```

Domain helper:

```ts
// config/domain.ts
export interface CompactDomain {
  name: 'TheCompact'
  version: '1'
  chainId: number
  verifyingContract: `0x${string}`
}

export function createDomain(params: { chainId: number; contractAddress: `0x${string}` }): CompactDomain {
  return {
    name: 'TheCompact',
    version: '1',
    chainId: params.chainId,
    verifyingContract: params.contractAddress,
  }
}
```

We can optionally cross‑check `DOMAIN_SEPARATOR()` at runtime in a debug helper. ([Uniswap Docs][2])

---

## 3. Type layer (TS mirrors of Solidity structs)

### 3.1 EIP‑712 payloads (Compacts) ([Uniswap Docs][1])

```ts
// types/eip712.ts
export interface Lock {
  lockTag: `0x${string}` // bytes12
  token: `0x${string}` // address (or zero address)
  amount: bigint // uint256
}

export interface Compact {
  arbiter: `0x${string}`
  sponsor: `0x${string}`
  nonce: bigint
  expires: bigint
  lockTag: `0x${string}` // bytes12
  token: `0x${string}`
  amount: bigint
  // optional Mandate appended
}

export interface BatchCompact {
  arbiter: `0x${string}`
  sponsor: `0x${string}`
  nonce: bigint
  expires: bigint
  commitments: Lock[]
  // optional Mandate appended
}

export interface MultichainElement {
  arbiter: `0x${string}`
  chainId: bigint
  commitments: Lock[]
  // Mandate appended
}

export interface MultichainCompact {
  sponsor: `0x${string}`
  nonce: bigint
  expires: bigint
  elements: MultichainElement[]
}
```

### 3.2 Claims & components ([Uniswap Docs][2])

```ts
export interface Component {
  claimant: bigint // packed lockTag + recipient
  amount: bigint
}

export interface Claim {
  allocatorData: `0x${string}`
  sponsorSignature: `0x${string}` // empty if caller is sponsor / emissary pathway
  sponsor: `0x${string}`
  nonce: bigint
  expires: bigint
  witness: `0x${string}` // bytes32
  witnessTypestring: string
  id: bigint // ERC6909 id
  allocatedAmount: bigint
  claimants: Component[]
}
```

Batch/multichain claim structs can be added similarly, but v1 of the SDK can focus on the common `Claim` + `BatchClaim` first, then extend. ([GitHub][4])

### 3.3 Runtime enums / config

Map Solidity enums to TS:

```ts
export enum CompactCategory {
  Compact = 0,
  BatchCompact = 1,
  MultichainCompact = 2,
}

export enum Scope {
  SingleChain,
  Multichain,
}

export enum ResetPeriod {
  OneSecond = 0,
  FifteenSeconds = 1,
  OneMinute = 2,
  TenMinutes = 3,
  OneHourAndFiveMinutes = 4,
  OneDay = 5,
  SevenDaysAndOneHour = 6,
  ThirtyDays = 7,
}

// Helper to convert ResetPeriod enum value to seconds for display
export function resetPeriodToSeconds(resetPeriod: ResetPeriod): bigint {
  // ...
}
```

---

## 4. Encoding helpers (pure functions)

### 4.1 lockTag / lockId helpers

From the docs:

- `lockTag` encodes allocatorId, scope, resetPeriod into `bytes12`.
- The full ERC6909 `id` is `lockTag || token` (12 bytes + 20 bytes ⇒ 32 bytes / uint256). ([GitHub][4])

We provide:

```ts
// encoding/locks.ts
export interface LockTagParts {
  allocatorId: bigint // uint96?
  scope: Scope
  resetPeriod: ResetPeriod // seconds
}

export function encodeLockTag(parts: LockTagParts): `0x${string}` {
  /* bit packing */
}
export function decodeLockTag(lockTag: `0x${string}`): LockTagParts {
  /* ... */
}

export function encodeLockId(lockTag: `0x${string}`, token: `0x${string}`): bigint
export function decodeLockId(id: bigint): { lockTag: `0x${string}`; token: `0x${string}` }
```

### 4.2 claimant helpers

`claimant = (lockTag << 160) | recipient`. If `lockTag == 0`, treat as withdraw‑underlying; if `lockTag == claimed lockTag`, plain transfer; if different non‑zero lockTag, convert. ([Uniswap Docs][2])

```ts
// encoding/claimants.ts
export type ClaimantKind = 'transfer' | 'convert' | 'withdraw'

export interface ClaimantInputBase {
  amount: bigint
}

export interface TransferClaimant extends ClaimantInputBase {
  kind: 'transfer'
  recipient: `0x${string}`
}

export interface ConvertClaimant extends ClaimantInputBase {
  kind: 'convert'
  recipient: `0x${string}`
  targetLockTag: `0x${string}`
}

export interface WithdrawClaimant extends ClaimantInputBase {
  kind: 'withdraw'
  recipient: `0x${string}`
}

export type ClaimantInput = TransferClaimant | ConvertClaimant | WithdrawClaimant

export function buildComponent(lockTagOfClaim: `0x${string}`, claimant: ClaimantInput): Component {
  // pack lockTag + recipient according to rules
}

export function decodeComponent(component: Component): {
  kind: ClaimantKind
  recipient: `0x${string}`
  lockTag?: `0x${string}`
}
```

This is a good place for most integrators to plug in; they should never need to touch the raw `uint256 claimant` values.

---

## 5. Mandate / witness tooling

The witness mechanism is the hairiest part:

- Compacts include an optional `Mandate` struct at the end of the EIP‑712 type string. ([Uniswap Docs][1])
- Claims use `witness: bytes32` (hash) and `witnessTypestring` which is **“arguments inside the Mandate struct (e.g. `uint256 myArg,bytes32 otherArg`) plus any nested struct definitions, without the final `)`”**. ([Uniswap Docs][1])

We should encapsulate this completely.

```ts
// builders/mandate.ts
export type Eip712Field = { name: string; type: string }

export interface MandateType<TValue extends object = any> {
  readonly name: 'Mandate'
  readonly fields: readonly Eip712Field[]
  readonly nestedTypes?: Record<string, readonly Eip712Field[]> // e.g. MandateCondition
  readonly witnessTypestring: string // correctly formatted (no final ')')

  encode(value: TValue): `0x${string}` // ABI-encoded struct
  hash(value: TValue): `0x${string}` // keccak256 of encoded
}

export function defineMandateType<TValue extends object>(config: {
  fields: readonly Eip712Field[]
  nestedTypes?: Record<string, readonly Eip712Field[]>
}): MandateType<TValue> {
  /* implement rules from docs */
}
```

The helper will:

- Ensure nested struct names start with `Mandate` so EIP‑712 ordering works, per docs. ([Uniswap Docs][1])
- Build `witnessTypestring` in the expected funky format (no closing parenthesis; nested appended).

Consumers:

```ts
const Mandate = defineMandateType<{
  orderId: `0x${string}`
  minOut: bigint
}>({
  fields: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'minOut', type: 'uint256' },
  ],
})

const witnessHash = Mandate.hash({ orderId, minOut })
const witnessTypestring = Mandate.witnessTypestring
```

Builders will accept `MandateType` instances rather than raw strings where possible.

---

## 6. Fluent builders

### 6.1 CompactBuilder

We can expose static constructors:

```ts
// builders/compact.ts
export class CompactBuilder {
  // 1) single
  static single(domain: CompactDomain) {
    return new SingleCompactBuilder(domain)
  }

  // 2) batch
  static batch(domain: CompactDomain) {
    return new BatchCompactBuilder(domain)
  }

  // 3) multichain
  static multichain(domain: CompactDomain) {
    return new MultichainCompactBuilder(domain)
  }
}
```

#### Single compact usage

```ts
const domain = createDomain({
  chainId: 1,
  contractAddress: compactAddress,
})

const Mandate = defineMandateType<{
  orderId: `0x${string}`
  minFill: bigint
}>({
  fields: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'minFill', type: 'uint256' },
  ],
})

const { struct, typedData, hash, sign } = CompactBuilder.single(domain)
  .sponsor(sponsorAddress)
  .arbiter(arbiterAddress)
  .nonce(nonce)
  .expiresIn('15m') // helpers: expiresAt(), expiresIn()
  .lockTag(lockTag)
  .token(underlyingToken)
  .amount(amount)
  .witness(Mandate, { orderId, minFill })
  .build()
```

`build()` returns something like:

```ts
interface BuiltCompact<TMandate extends object | undefined> {
  struct: Compact // strongly typed struct
  mandate?: TMandate // original JS object
  mandateType?: MandateType<TMandate>
  hash: `0x${string}` // EIP-712 digest
  typedData: {
    domain: CompactDomain
    types: Record<string, Eip712Field[]>
    primaryType: 'Compact'
    message: any
  }
  sign(signer: TypedDataSigner): Promise<`0x${string}`>
}
```

Batch & multichain builder shape:

```ts
// Batch
CompactBuilder.batch(domain)
  .sponsor(sponsor)
  .arbiter(arbiter)
  .nonce(nonce)
  .expiresAt(expiry)
  .addLock({
    lockTag,
    token,
    amount,
  })
  .addLock({ ... })
  .witness(Mandate, mandate)
  .build();

// Multichain
CompactBuilder.multichain(domain)
  .sponsor(sponsor)
  .nonce(nonce)
  .expiresAt(expiry)
  .addElement()
    .arbiter(arbiter1)
    .chainId(1n)
    .addCommitment({ lockTag, token, amount })
    .witness(Mandate, data1)
  .addElement()
    .arbiter(arbiter2)
    .chainId(8453n)
    .addCommitment({ ... })
    .witness(Mandate, data2)
  .end()
  .build();
```

The multichain builder must ensure **every element** has a Mandate, per spec. ([Uniswap Docs][1])

We can enforce that at build time (throw if missing).

### 6.2 ClaimBuilder (start with single‑chain first)

We’ll wrap `Claim` + `Component` and the witness hashing:

```ts
// builders/claim.ts
export class ClaimBuilder {
  static single(domain: CompactDomain) {
    return new SingleClaimBuilder(domain)
  }

  // also: batch(), multichain(), multichainBatch()
}
```

Usage for arbiter:

```ts
const claimBuild = ClaimBuilder.single(domain)
  .fromCompact({
    compact, // Compact struct
    signature, // sponsorSignature
  })
  .allocator(allocatorAddress)
  .allocatorData(allocatorDataBytes)
  .allocatedAmount(allocatedAmount)
  .witness(Mandate, { orderId, minFill })
  .addTransfer({
    recipient: filler,
    amount: paidToFiller,
  })
  .addWithdraw({
    recipient: user,
    amount: finalPayout,
  })
  .build()
```

`fromCompact()` can:

- Pre‑fill `sponsor`, `nonce`, `expires`, `lockTag`, `id`, etc.
- Compute `id` from `lockTag + token` if we provide a mapping or ask for it explicitly.

`build()` will:

- Compute `witness = Mandate.hash(mandate)`.
- Set `witnessTypestring = Mandate.witnessTypestring`.
- Build `Component[]` via `buildComponent`.
- Provide `Claim` struct ready for `claim()`.

Return:

```ts
interface BuiltClaim<TMandate> {
  struct: Claim
  hash: `0x${string}` // claimHash (if we include hashing helper)
}
```

We can add helpers:

- `.claimHash()` to compute the hash consistent with the Solidity logic (we may need to mirror onchain hashing from repo). We also need `Claim`, `BatchClaim`, `MultichainClaim`, `BatchMultichainClaim` builders and exposed lower‑level helpers.

---

## 7. Client layer (RPC + signer integration)

We’ll lean on **viem** style, but keep interfaces generic.

```ts
// client/coreClient.ts
export interface CompactClientConfig {
  chainId: number
  address?: `0x${string}` // default from deployments
  publicClient: PublicClientLike
  walletClient?: WalletClientLike
}

export interface PublicClientLike {
  readContract(args: any): Promise<any>
  // viem-compatible shape
}

export interface WalletClientLike extends PublicClientLike {
  writeContract(args: any): Promise<`0x${string}`>
  signTypedData?(args: any): Promise<`0x${string}`>
}

export interface CompactClient {
  sponsor: SponsorClient
  arbiter: ArbiterClient
  relayer: RelayerClient
  allocator: AllocatorClient
  view: ViewClient
}

export function createCompactClient(config: CompactClientConfig): CompactClient {
  /* ... */
}
```

### 7.1 SponsorClient (depositor / compact creator)

Wraps:

- Deposits (`depositNative`, `depositERC20`, `batchDeposit`, Permit2 variants). ([Uniswap Docs][2])
- Combined deposit+register helpers.
- Registration functions (register, registerMultiple, registerFor, etc.). ([Uniswap Docs][2])
- Emissary assignment & forced withdrawal management. ([Uniswap Docs][2])

Sketch:

```ts
export interface SponsorClient {
  // 1) Resource locks
  createLock(): LockDepositBuilder
  depositNative(args: {
    lockTag: `0x${string}`
    recipient: `0x${string}`
    value: bigint
  }): Promise<{ txHash: `0x${string}`; id: bigint }>

  depositERC20(args: {
    token: `0x${string}`
    lockTag: `0x${string}`
    amount: bigint
    recipient: `0x${string}`
  }): Promise<{ txHash: `0x${string}`; id: bigint }>

  // 2) Compacts
  compact(domain?: CompactDomain): typeof CompactBuilder.single
  batchCompact(domain?: CompactDomain): typeof CompactBuilder.batch
  multichainCompact(domain?: CompactDomain): typeof CompactBuilder.multichain

  register(args: { claimHash: `0x${string}`; typehash: `0x${string}` }): Promise<`0x${string}`>
  registerFor(/* as in core interface, but friendlier */): Promise<`0x${string}`>
  // etc.

  // 3) Emissary / forced withdrawal
  assignEmissary(args: { lockTag: `0x${string}`; emissary: `0x${string}` }): Promise<`0x${string}`>
  enableForcedWithdrawal(id: bigint): Promise<{ txHash: `0x${string}`; withdrawableAt: bigint }>
}
```

We can optionally provide a fluent `LockDepositBuilder`:

```ts
const { id } = await compact.sponsor
  .createLock()
  .token(USDC)
  .allocator(allocatorId)
  .scope('Multichain')
  .resetPeriod(ResetPeriod.OneDay)
  .amountDecimal('1000', 6) // or just .amount(valueInWei)
  .forRecipient(sponsor)
  .depositERC20()
```

### 7.2 ArbiterClient

Wraps claim submission:

```ts
export interface ArbiterClient {
  claim(claim: Claim): Promise<{
    txHash: `0x${string}`;
    claimHash: `0x${string}`;
  }>;

  batchClaim(batch: BatchClaim): Promise<...>;

  singleClaimBuilder(domain?: CompactDomain): typeof ClaimBuilder.single;
  // also: batch(), multichain() builders
}
```

Fillers/Relayers can either:

- Use the builder: `compact.arbiter.singleClaimBuilder(domain)…`.
- Or build a `Claim` manually and call `claim()`.

### 7.3 RelayerClient

Focus on **Permit2 integration** that wraps deposit+register flows:

`depositERC20AndRegisterViaPermit2` and `batchDepositAndRegisterViaPermit2` with the required `CompactCategory` and witness string. ([Uniswap Docs][1])

We can expose:

```ts
export interface RelayerClient {
  buildCompactDepositTypedData(args: {
    chainId: number;
    lockTag: `0x${string}`;
    recipient: `0x${string}`;
  }): TypedData;

  buildActivationTypedData(/* Activation(...) */): TypedData;

  depositAndRegisterViaPermit2(/* viem/ethers-style arg bag */): Promise<...>;
}
```

Internally it uses the same `MandateType` infrastructure to construct `witness` strings for the Permit2 witness field.

### 7.4 AllocatorClient

For infrastructure operators:

```ts
export interface AllocatorClient {
  isClaimAuthorized(args: {
    allocator: `0x${string}`
    claimHash: `0x${string}`
    arbiter: `0x${string}`
    sponsor: `0x${string}`
    nonce: bigint
    expires: bigint
    idsAndAmounts: Array<{ id: bigint; amount: bigint }>
    allocatorData: `0x${string}`
  }): Promise<boolean>

  hasConsumedAllocatorNonce(args: { allocator: `0x${string}`; nonce: bigint }): Promise<boolean>
}
```

This lines up with `IAllocator.isClaimAuthorized` and `hasConsumedAllocatorNonce`. ([Uniswap Docs][2])

### 7.5 ViewClient

Thin wrappers over read‑only functions:

```ts
export interface ViewClient {
  getLockDetails(id: bigint): Promise<{
    token: `0x${string}`;
    allocator: `0x${string}`;
    resetPeriod: ResetPeriod;
    scope: Scope;
    lockTag: `0x${string}`;
  }>;

  isRegistered(args: {
    sponsor: `0x${string}`;
    claimHash: `0x${string}`;
    typehash: `0x${string}`;
  }): Promise<boolean>;

  getForcedWithdrawalStatus(/* ... */): Promise<...>;
  getEmissaryStatus(/* ... */): Promise<...>;
}
```

---

## 8. Error handling

We can decode revert data into typed errors based on the published error list: `InvalidToken`, `InvalidLockTag`, `Expired`, `ForcedWithdrawalFailed`, etc. ([Uniswap Docs][2])

```ts
// errors/types.ts
export type CompactErrorKind =
  | 'InvalidToken'
  | 'InvalidLockTag'
  | 'Expired'
  | 'InvalidSignature'
  | 'AllocatedAmountExceeded'
  | 'InvalidScope'
  | 'InvalidAllocation'
  | 'InvalidBatchAllocation'
// ... etc

export interface CompactError extends Error {
  kind: CompactErrorKind
  data?: any // decoded arguments
}

// errors/decode.ts
export function decodeCompactError(revertData: `0x${string}`): CompactError | null
```

All `CompactClient` write calls can catch `CallExecutionError`/`ContractFunctionRevertedError` (viem) or ethers equivalents and run them through the decoder so we get rich errors out of the box.

---

## 9. Example end‑to‑end flows (what integrators would write)

### 9.1 Sponsor UX: deposit + compact signing

```ts
const compact = createCompactClient({
  chainId: 1,
  publicClient,
  walletClient,
})

// 1) Deposit & create lock
const lockTag = encodeLockTag({
  allocatorId,
  scope: Scope.SingleChain,
  resetPeriod: daysToSeconds(1),
})

const { id } = await compact.sponsor.depositERC20({
  token: USDC,
  lockTag,
  amount: 1_000n * 10n ** 6n,
  recipient: sponsor,
})

// 2) Build & sign compact
const domain = createDomain({
  chainId: 1,
  contractAddress: compactAddress,
})

const Mandate = defineMandateType<{ orderId: `0x${string}`; minFill: bigint }>({
  fields: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'minFill', type: 'uint256' },
  ],
})

const built = CompactBuilder.single(domain)
  .sponsor(sponsor)
  .arbiter(arbiter)
  .nonce(nonce)
  .expiresIn('15m')
  .lockTag(lockTag)
  .token(USDC)
  .amount(500n * 10n ** 6n)
  .witness(Mandate, { orderId, minFill })
  .build()

const sponsorSignature = await built.sign(walletClient)
```

Arbiter receives `(compactStruct, sponsorSignature)`.

### 9.2 Arbiter UX: submit claim

```ts
const claimBuilt = ClaimBuilder.single(domain)
  .fromCompact({
    compact: built.struct,
    signature: sponsorSignature,
    id,
  })
  .allocator(allocator)
  .allocatorData(allocatorSig)
  .allocatedAmount(500n * 10n ** 6n)
  .witness(Mandate, { orderId, minFill })
  .addTransfer({
    recipient: filler,
    amount: 490n * 10n ** 6n,
  })
  .addWithdraw({
    recipient: user,
    amount: 10n * 10n ** 6n,
  })
  .build()

const { txHash, claimHash } = await compact.arbiter.claim(claimBuilt.struct)
```

All the low‑level parts (witness hash, witnessTypestring, claimant packing) are internal to the builder.

---

[1]: https://docs.uniswap.org/contracts/the-compact/reference/compacts-eip712 'Compacts & EIP-712 | Uniswap'
[2]: https://docs.uniswap.org/contracts/the-compact/reference/core-interfaces 'Core Interfaces | Uniswap'
[3]: https://docs.uniswap.org/contracts/the-compact/overview 'Overview | Uniswap'
[4]: https://github.com/Uniswap/the-compact 'GitHub - Uniswap/the-compact: The Compact is an ownerless ERC6909 contract that facilitates the formation and mediation of reusable resource locks.'
