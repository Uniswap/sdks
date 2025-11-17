# Client Layer Improvement Plan

## Current State Assessment

### Missing Functionality

#### ArbiterClient (`src/client/arbiter.ts`)
- ❌ No `multichainClaim()` method
- ❌ No `batchMultichainClaim()` method
- ❌ No `multichainClaimBuilder()` factory
- ❌ No `batchMultichainClaimBuilder()` factory
- ⚠️ Claim hash computation stubbed (returns zeros)
- ⚠️ No actual hash computation from claim data

#### SponsorClient (`src/client/sponsor.ts`)
- ✅ Has basic deposit methods
- ✅ Has builder factories (single, batch, multichain)
- ⚠️ `enableForcedWithdrawal()` has placeholder withdrawableAt calculation
- ❌ Missing `disableForcedWithdrawal()` method
- ❌ Missing `forcedWithdrawal()` method

#### ViewClient (`src/client/view.ts`)
- ✅ Has basic query methods
- ❌ Missing `hasConsumedAllocatorNonce()` query
- ❌ Missing `getRegisteredNonce()` query
- ❌ Missing `getForcedWithdrawalStatus()` query
- ❌ Missing batch query methods

### Documentation Gaps

All client files have:
- ❌ No comprehensive TSDoc on class level
- ❌ Minimal parameter documentation
- ❌ No return value documentation details
- ❌ No error documentation
- ❌ No usage examples

### Test Coverage

- ❌ **Zero test coverage** for entire client layer
- ❌ No unit tests
- ❌ No integration tests
- ❌ No mock/example tests

## Implementation Plan

### Phase 1: Complete ArbiterClient Functionality

#### 1.1 Add Multichain Claim Methods
```typescript
/**
 * Submit a multichain claim
 * @param claim - Multichain claim struct
 * @returns Transaction hash and claim hash
 */
async multichainClaim(claim: MultichainClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }>

/**
 * Submit a batch multichain claim
 * @param claim - Batch multichain claim struct
 * @returns Transaction hash and claim hash
 */
async batchMultichainClaim(claim: BatchMultichainClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }>
```

#### 1.2 Add Multichain Builder Factories
```typescript
/**
 * Get a multichain claim builder for this chain
 * @returns MultichainClaimBuilder instance
 */
multichainClaimBuilder(): MultichainClaimBuilder

/**
 * Get a batch multichain claim builder for this chain
 * @returns BatchMultichainClaimBuilder instance
 */
batchMultichainClaimBuilder(): BatchMultichainClaimBuilder
```

#### 1.3 Fix Claim Hash Computation
Replace stubbed claim hash with actual computation using:
- Import `claimHash`, `batchClaimHash` from `../encoding/hashes`
- Use the appropriate hash function for each claim type
- Consider also returning the EIP-712 hash from builder if available

### Phase 2: Complete SponsorClient Functionality

#### 2.1 Add Missing Withdrawal Methods
```typescript
/**
 * Disable a previously enabled forced withdrawal
 * @param id - Lock ID to disable forced withdrawal for
 * @returns Transaction hash
 */
async disableForcedWithdrawal(id: bigint): Promise<`0x${string}`>

/**
 * Execute a forced withdrawal after the waiting period
 * @param id - Lock ID to withdraw
 * @param recipient - Address to receive withdrawn tokens
 * @returns Transaction hash and withdrawn amount
 */
async forcedWithdrawal(id: bigint, recipient: `0x${string}`): Promise<{ txHash: `0x${string}`; amount: bigint }>
```

#### 2.2 Fix enableForcedWithdrawal
Compute actual `withdrawableAt` timestamp:
- Query contract for withdrawal delay
- Add delay to current block timestamp
- Return accurate withdrawable time

### Phase 3: Expand ViewClient

#### 3.1 Add Missing Query Methods
```typescript
/**
 * Check if a specific nonce has been consumed by an allocator
 */
async hasConsumedAllocatorNonce(params: { allocator: `0x${string}`; nonce: bigint }): Promise<boolean>

/**
 * Get the current registered nonce for a sponsor/claimHash/typehash combination
 */
async getRegisteredNonce(params: {
  sponsor: `0x${string}`
  claimHash: `0x${string}`
  typehash: `0x${string}`
}): Promise<bigint>

/**
 * Get forced withdrawal status for a lock
 */
async getForcedWithdrawalStatus(id: bigint): Promise<{
  enabled: boolean
  withdrawableAt: bigint
}>
```

#### 3.2 Add Batch Query Methods
```typescript
/**
 * Get balances for multiple accounts and IDs
 */
async balanceOfBatch(params: {
  accounts: `0x${string}`[]
  ids: bigint[]
}): Promise<bigint[]>
```

### Phase 4: Comprehensive TSDoc

#### 4.1 Class-Level Documentation
Add comprehensive class-level JSDoc to each client with:
- Purpose and role
- Usage examples
- Related clients
- Common patterns

Example:
```typescript
/**
 * Client for arbiter operations (claim submissions)
 *
 * The arbiter client handles submitting claims against compacts. Claims can be:
 * - Single claims: One resource from one compact
 * - Batch claims: Multiple resources from multiple compacts (same chain)
 * - Multichain claims: Single resource coordinated across chains
 * - Batch multichain claims: Multiple resources coordinated across chains
 *
 * @example
 * ```typescript
 * const claim = client.arbiter.singleClaimBuilder()
 *   .sponsor(sponsorAddress)
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() + 3600000))
 *   .id(lockId)
 *   .allocatedAmount(1000000n)
 *   .lockTag(lockTag)
 *   .addTransfer({ recipient, amount })
 *   .build()
 *
 * const result = await client.arbiter.claim(claim.struct)
 * console.log('Claim submitted:', result.txHash)
 * ```
 *
 * @see SponsorClient for creating compacts
 * @see ViewClient for querying claim status
 */
export class ArbiterClient { ... }
```

#### 4.2 Method-Level Documentation
Enhance each method with:
- Detailed description
- Parameter descriptions with types and constraints
- Return value details
- Throws documentation
- Usage examples
- Related methods

Example:
```typescript
/**
 * Submit a claim against a compact
 *
 * Claims are used by arbiters to process compacts and distribute locked funds
 * to claimants. The claim must be valid according to the compact's allocator rules.
 *
 * @param claim - The claim struct containing all claim parameters
 * @param claim.sponsor - The address that signed the compact
 * @param claim.nonce - Unique nonce for this claim
 * @param claim.expires - Expiration timestamp for the claim
 * @param claim.id - Resource lock ID to claim against
 * @param claim.allocatedAmount - Total amount being allocated
 * @param claim.claimants - Array of recipients and amounts
 *
 * @returns Object containing transaction hash and computed claim hash
 * @returns result.txHash - Transaction hash for the submitted claim
 * @returns result.claimHash - Keccak256 hash of the claim for tracking
 *
 * @throws {Error} If walletClient is not configured
 * @throws {Error} If contract address is not set
 * @throws {CompactError} If the claim is invalid or processing fails
 *
 * @example
 * ```typescript
 * const claim = client.arbiter.singleClaimBuilder()
 *   .sponsor('0x...')
 *   .nonce(1n)
 *   // ... configure claim
 *   .build()
 *
 * const result = await client.arbiter.claim(claim.struct)
 * console.log('Claim hash:', result.claimHash)
 * ```
 *
 * @see {@link singleClaimBuilder} for building claims
 * @see {@link batchClaim} for batch operations
 */
async claim(claim: Claim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }>
```

### Phase 5: Test Coverage

#### 5.1 Unit Tests Structure
```
src/client/
  ├── arbiter.test.ts
  ├── sponsor.test.ts
  ├── view.test.ts
  └── coreClient.test.ts
```

#### 5.2 Test Coverage Goals
- Mock viem clients (PublicClient, WalletClient)
- Test all methods with valid inputs
- Test error conditions
- Test builder factory methods
- Verify contract interactions
- Test event parsing

#### 5.3 Example Test Structure
```typescript
describe('ArbiterClient', () => {
  describe('claim()', () => {
    it('should submit a valid claim')
    it('should compute correct claim hash')
    it('should throw if walletClient missing')
    it('should throw if contract address missing')
    it('should handle contract errors')
  })

  describe('batchClaim()', () => { ... })
  describe('multichainClaim()', () => { ... })
  describe('builders', () => { ... })
})
```

### Phase 6: Integration Tests (Optional)

Create example integration tests that:
- Use mainnet/testnet fork
- Test full deposit -> compact -> claim flow
- Demonstrate real-world usage
- Serve as living documentation

## Priority Order

1. **HIGH**: Complete ArbiterClient multichain support (Phase 1)
2. **HIGH**: Fix claim hash computation (Phase 1.3)
3. **MEDIUM**: Add comprehensive TSDoc (Phase 4)
4. **MEDIUM**: Complete SponsorClient functionality (Phase 2)
5. **MEDIUM**: Add unit tests (Phase 5)
6. **LOW**: Expand ViewClient (Phase 3)
7. **LOW**: Integration tests (Phase 6)

## Estimated Effort

- Phase 1: 2-3 hours
- Phase 2: 1-2 hours
- Phase 3: 1 hour
- Phase 4: 2-3 hours
- Phase 5: 4-5 hours
- Phase 6: 3-4 hours

**Total: 13-18 hours**

## Success Criteria

- [ ] All 4 claim types supported in ArbiterClient
- [ ] Claim hashes computed correctly
- [ ] All builder factories available
- [ ] Comprehensive TSDoc on all public APIs
- [ ] 100% test coverage of client methods
- [ ] All view methods available
- [ ] All sponsor methods available
- [ ] Examples demonstrating usage
