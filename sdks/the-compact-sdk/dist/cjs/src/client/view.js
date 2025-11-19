"use strict";
/**
 * View client for read-only operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewClient = exports.ForcedWithdrawalStatusEnum = void 0;
const tslib_1 = require("tslib");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const theCompact_1 = require("../abi/theCompact");
/**
 * Forced withdrawal status enum values
 */
var ForcedWithdrawalStatusEnum;
(function (ForcedWithdrawalStatusEnum) {
    ForcedWithdrawalStatusEnum[ForcedWithdrawalStatusEnum["Disabled"] = 0] = "Disabled";
    ForcedWithdrawalStatusEnum[ForcedWithdrawalStatusEnum["Pending"] = 1] = "Pending";
    ForcedWithdrawalStatusEnum[ForcedWithdrawalStatusEnum["Enabled"] = 2] = "Enabled";
})(ForcedWithdrawalStatusEnum || (exports.ForcedWithdrawalStatusEnum = ForcedWithdrawalStatusEnum = {}));
/**
 * Client for view operations (read-only queries)
 *
 * The view client provides read-only access to The Compact protocol state.
 * All methods are gas-free queries that don't modify blockchain state.
 *
 * Key capabilities:
 * - Query lock details and balances
 * - Check claim registration status
 * - Query forced withdrawal status
 * - Check allocator nonce consumption
 * - Retrieve domain separator for EIP-712 signing
 *
 * @example
 * ```typescript
 * // Query lock details
 * const details = await client.view.getLockDetails(lockId)
 * console.log('Token:', details.token)
 * console.log('Allocator:', details.allocator)
 *
 * // Check balance
 * const balance = await client.view.balanceOf({
 *   account: userAddress,
 *   id: lockId
 * })
 * console.log('Balance:', balance)
 *
 * // Check if claim is registered
 * const isRegistered = await client.view.isRegistered({
 *   sponsor: sponsorAddress,
 *   claimHash: hash,
 *   typehash: typeHash
 * })
 * ```
 *
 * @see SponsorClient for deposit and compact creation operations
 * @see ArbiterClient for claim submission operations
 */
class ViewClient {
    constructor(config) {
        this.config = config;
    }
    /**
     * Get lock details for a given lock ID
     *
     * Retrieves comprehensive information about a resource lock, including the underlying
     * token, allocator address, reset period, scope, and lock tag.
     *
     * @param id - The lock ID to query
     * @returns Lock details including token, allocator, reset period, scope, and lock tag
     *
     * @throws {Error} If contract address is not set
     * @throws {Error} If the lock ID doesn't exist
     *
     * @example
     * ```typescript
     * const details = await client.view.getLockDetails(lockId)
     *
     * console.log('Underlying token:', details.token)
     * console.log('Allocator:', details.allocator)
     * console.log('Reset period:', details.resetPeriod) // 0 = None, 1 = TenMinutes, etc.
     * console.log('Scope:', details.scope) // 0 = Multichain, 1 = ChainSpecific
     * console.log('Lock tag:', details.lockTag)
     * ```
     */
    async getLockDetails(id) {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'getLockDetails',
            args: [id],
        });
        // Viem returns a tuple matching the contract's return values
        const [token, allocator, resetPeriod, scope] = result;
        // Compute lockTag from id (upper 96 bits)
        const lockTag = (id >> 160n).toString(16).padStart(24, '0');
        return {
            token,
            allocator,
            resetPeriod,
            scope,
            lockTag: `0x${lockTag}`,
        };
    }
    /**
     * Check if a claim is registered for a sponsor
     *
     * Verifies whether a specific claim hash has been registered by a sponsor,
     * allowing it to be used with the sponsor's nonce for claim submission.
     *
     * @param params - Registration query parameters
     * @param params.sponsor - The sponsor address that registered the claim
     * @param params.claimHash - Hash of the claim to check
     * @param params.typehash - EIP-712 typehash of the claim structure
     * @returns True if the claim is registered, false otherwise
     *
     * @throws {Error} If contract address is not set
     *
     * @example
     * ```typescript
     * const claim = client.arbiter.singleClaimBuilder()
     *   .sponsor(sponsorAddress)
     *   // ... build claim
     *   .build()
     *
     * const isRegistered = await client.view.isRegistered({
     *   sponsor: sponsorAddress,
     *   claimHash: claim.hash,
     *   typehash: getClaimTypehash()
     * })
     *
     * if (isRegistered) {
     *   console.log('Claim is pre-registered, can use sponsor nonce')
     * }
     * ```
     */
    async isRegistered(params) {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'isRegistered',
            args: [params.sponsor, params.claimHash, params.typehash],
        });
        return result;
    }
    /**
     * Get the balance of an account for a specific lock ID
     *
     * Returns the ERC6909 token balance (locked resource amount) for a given
     * account and lock ID.
     *
     * @param params - Balance query parameters
     * @param params.account - The account address to check
     * @param params.id - The lock ID to query
     * @returns The account's balance for the specified lock
     *
     * @throws {Error} If contract address is not set
     *
     * @example
     * ```typescript
     * const balance = await client.view.balanceOf({
     *   account: sponsorAddress,
     *   id: lockId
     * })
     *
     * console.log('Locked amount:', balance)
     * ```
     */
    async balanceOf(params) {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'balanceOf',
            args: [params.account, params.id],
        });
        return result;
    }
    /**
     * Check if a specific nonce has been consumed by an allocator
     *
     * Allocators use nonces to prevent replay attacks on claims. This method checks
     * whether a specific nonce has already been consumed.
     *
     * @param params - Nonce query parameters
     * @param params.nonce - The nonce value to check
     * @param params.allocator - The allocator address to check
     * @returns True if the nonce has been consumed, false otherwise
     *
     * @throws {Error} If contract address is not set
     *
     * @example
     * ```typescript
     * const consumed = await client.view.hasConsumedAllocatorNonce({
     *   nonce: 42n,
     *   allocator: allocatorAddress
     * })
     *
     * if (consumed) {
     *   console.log('Nonce already used, cannot reuse')
     * } else {
     *   console.log('Nonce available for use')
     * }
     * ```
     */
    async hasConsumedAllocatorNonce(params) {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'hasConsumedAllocatorNonce',
            args: [params.nonce, params.allocator],
        });
        return result;
    }
    /**
     * Get forced withdrawal status for a resource lock
     *
     * Returns the forced withdrawal status and when it becomes withdrawable.
     * Forced withdrawals are safety mechanisms allowing lock holders to reclaim
     * funds if allocators become unresponsive.
     *
     * @param account - The account address to check
     * @param id - The lock ID to query
     * @returns Object containing status enum (Disabled/Pending/Enabled) and withdrawableAt timestamp
     *
     * @throws {Error} If contract address is not set
     *
     * @example
     * ```typescript
     * const status = await client.view.getForcedWithdrawalStatus(accountAddress, lockId)
     *
     * if (status.status === ForcedWithdrawalStatusEnum.Enabled) {
     *   const now = BigInt(Math.floor(Date.now() / 1000))
     *   if (now >= status.withdrawableAt) {
     *     console.log('Can withdraw now!')
     *   } else {
     *     const remainingSeconds = status.withdrawableAt - now
     *     console.log(`Can withdraw in ${remainingSeconds} seconds`)
     *   }
     * } else if (status.status === ForcedWithdrawalStatusEnum.Pending) {
     *   console.log('Forced withdrawal pending')
     * } else {
     *   console.log('Forced withdrawal disabled')
     * }
     * ```
     */
    async getForcedWithdrawalStatus(account, id) {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'getForcedWithdrawalStatus',
            args: [account, id],
        });
        // Viem returns a tuple matching the contract's return values [status enum, withdrawableAt]
        const [status, withdrawableAt] = result;
        return {
            status,
            withdrawableAt,
        };
    }
    /**
     * Get the EIP-712 domain separator from the contract
     *
     * Returns the domain separator used for EIP-712 structured data signing.
     * This value is used to bind signatures to this specific contract and chain.
     *
     * @returns The 32-byte domain separator hash
     *
     * @throws {Error} If contract address is not set
     *
     * @example
     * ```typescript
     * const domainSeparator = await client.view.getDomainSeparator()
     * console.log('Domain separator:', domainSeparator)
     *
     * // Can be used to verify signatures match this contract
     * ```
     */
    async getDomainSeparator() {
        (0, tiny_invariant_1.default)(this.config.address, 'contract address is required');
        const result = await this.config.publicClient.readContract({
            address: this.config.address,
            abi: theCompact_1.theCompactAbi,
            functionName: 'DOMAIN_SEPARATOR',
        });
        return result;
    }
}
exports.ViewClient = ViewClient;
//# sourceMappingURL=view.js.map