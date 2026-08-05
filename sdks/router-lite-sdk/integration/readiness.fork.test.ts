import { createRouter, type ExecutionRequirement, type Permit2PermitSingle, type Router } from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getAddress, maxUint160, parseEther, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { PERMIT2_TYPES, permit2Domain } from '../src/internal/testing'

import { PERMIT2_ABI } from './abis'
import { forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import { executeSwap, forkManifest, minAmountOut, needsAction, readySwap, sendAsTrader } from './e2e'
import { ADDRESSES, createWorld, type World } from './worldBuilder'

// ---------------------------------------------------------------------------
// The readiness matrix, against the REAL Permit2 at
// 0x000000000022D473030F116dDEE9F6B43aC78BA3.
//
// `checkReadiness` reads three things — the ERC-20 balance, the token's
// allowance to Permit2, and Permit2's own (amount, expiration) allowance to
// the Universal Router — and every one of them is answered here by the actual
// deployed bytecode on the fork, not a stub. The trade itself is deliberately
// boring (one synthetic v2 pool, resolved in wave 0) so the only thing that
// varies between cases is the trader's on-chain spend authority.
//
// A `needs-action` result still carries a transaction: the SDK's claim is that
// the calldata is right and the AUTHORITY is missing, so the first case sends
// it and asserts it reverts — the requirement was real, not defensive noise.
// The last two cases send the same trade once the authority exists and assert
// it executes for exactly the quoted amount — once with the allowance granted
// beforehand, and once with a REAL signed Permit2 `PermitSingle` carried in the
// request, which is the only path where the SDK's calldata grants an allowance
// that OUTLIVES the transaction. That case therefore also asserts what the
// grant left behind: the router's allowance is exactly what the permit said,
// and nobody else got one.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

const AMOUNT_IN = 1_000n * 10n ** 18n

const UNAPPROVED: Address = '0x00000000000000000000000000000000000ead01'
const HALF_APPROVED: Address = '0x00000000000000000000000000000000000ead02'
const EXPIRED: Address = '0x00000000000000000000000000000000000ead03'
const ETH_ONLY: Address = '0x00000000000000000000000000000000000ead04'

/**
 * The permit case needs a trader whose KEY the harness holds — every other trader here is a made-up
 * address reached by impersonation, and an impersonated account cannot produce an ECDSA signature.
 *
 * DELIBERATELY NOT ONE OF ANVIL'S DEV ACCOUNTS. Those addresses are the most famous keypairs in
 * Ethereum, and on mainnet they are not empty: at the pinned fork block, dev account #9
 * (0xa0Ee7A14…9720) carries an EIP-7702 delegation designator (`0xef0100…`), so the fork sees it as
 * an account WITH CODE. Permit2 branches on exactly that — `claimedSigner.code.length == 0` picks
 * ECDSA, anything else is routed to ERC-1271 `isValidSignature` on the delegate — so a perfectly
 * valid signature from that key is never even checked, and `permit` reverts with empty data.
 *
 * This is therefore a throwaway keypair with no mainnet history at all, and `beforeAll` asserts it
 * still has no code on the fork rather than trusting that to stay true across a re-pin.
 */
const PERMIT_TRADER: Address = '0xa103b781A9F51D987Da6714d80b0DD2D858AB4f6'
const PERMIT_TRADER_KEY: Hex = '0x504d17ec4f5b0b6a2c34c3e4bbe6f8a3f2f6a1c9d8e7b6a5949382716253c4d5'

/** An unrelated address, used only to prove the permit granted nothing to anyone but the router. */
const BYSTANDER_SPENDER: Address = '0x000000000000000000000000000000000b7574a9'

// Permit2's EIP-712 domain and `PermitSingle` types now live in `src/internal/testing.ts` (R6).
// They are still RESTATED rather than imported from `@uniswap/permit2-sdk` — the signature this
// test produces must be independent of any Uniswap library, or a wrong typed-data shape would be
// validated against an equally wrong one — but they are no longer UNCHECKED: this literal used to
// sit here, where a wrong field order or a `uint256` in place of Permit2's `uint160`/`uint48` was
// discoverable only by a fork run someone remembered to do. `src/permit2Types.parity.test.ts`
// compares the shared shape against `AllowanceTransfer.getPermitData(...)` on every unit run.
// Note the domain has NO `version` field, which that test also pins.

const kindsOf = (requirements: ExecutionRequirement[]): string[] => requirements.map((r) => r.kind).sort()

describe.skipIf(!RUN)('readiness against the real Permit2 (fork)', () => {
  let anvil: AnvilClient
  let world: World
  let router: Router
  let token: Address
  let out: Address

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8649 })
    world = createWorld(anvil)
    router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })

    token = await world.deployToken('ReadyIn')
    out = await world.deployToken('ReadyOut')
    await world.createV2Pool(token, out, 1_000_000n * 10n ** 18n, 2_000_000n * 10n ** 18n)
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  /** The live `(amount, expiration, nonce)` Permit2 holds for `owner -> spender` on `token`. */
  function permit2Allowance(owner: Address, spender: Address): Promise<readonly [bigint, number, number]> {
    return world.read<readonly [bigint, number, number]>({
      address: ADDRESSES.permit2,
      abi: PERMIT2_ABI,
      functionName: 'allowance',
      args: [owner, token, spender],
    })
  }

  /** Permit2 `approve` from `trader` with an arbitrary (possibly past) expiration. */
  async function permit2Approve(trader: Address, expiration: number): Promise<void> {
    await anvil.rpc('anvil_impersonateAccount', [trader])
    try {
      await world.write({
        address: ADDRESSES.permit2,
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [token, ADDRESSES.universalRouter, maxUint160, expiration],
        from: trader,
      })
    } finally {
      await anvil.rpc('anvil_stopImpersonatingAccount', [trader])
    }
  }

  const swapFor = (trader: Address) =>
    router.getSwap({ tokenIn: token, tokenOut: out, amountIn: AMOUNT_IN, trader })

  it('no approvals at all: needs-action naming both legs of the spend path, and the tx really does revert', async () => {
    await world.fundTrader(UNAPPROVED, { eth: parseEther('10'), tokens: [[token, AMOUNT_IN]] })

    const result = needsAction(await swapFor(UNAPPROVED))
    // Both legs are missing: token -> Permit2 (an ERC-20 approval) and Permit2 -> router.
    expect(kindsOf(result.requirements)).toEqual(['erc20-approval', 'permit2-allowance'])
    const erc20 = result.requirements.find((r) => r.kind === 'erc20-approval')!
    const permit2 = result.requirements.find((r) => r.kind === 'permit2-allowance')!
    if (erc20.kind !== 'erc20-approval' || permit2.kind !== 'permit2-allowance') throw new Error('unreachable')
    expect(getAddress(erc20.spender)).toBe(ADDRESSES.permit2)
    expect(getAddress(permit2.spender)).toBe(ADDRESSES.universalRouter)
    expect(erc20.minimumAmount).toBe(AMOUNT_IN)

    // The transaction is real calldata for a trade the trader is not yet authorized to make.
    const receipt = await sendAsTrader(anvil, UNAPPROVED, result.tx)
    expect(receipt.status).toBe('reverted')
  }, 300_000)

  it('ERC-20 approved but Permit2 not: only the Permit2 leg is still required', async () => {
    await world.fundTrader(HALF_APPROVED, { eth: parseEther('10'), tokens: [[token, AMOUNT_IN]] })
    await world.approvePermit2(HALF_APPROVED, token) // token -> Permit2 only

    const result = needsAction(await swapFor(HALF_APPROVED))
    expect(kindsOf(result.requirements)).toEqual(['permit2-allowance'])
  }, 300_000)

  it('an expired Permit2 allowance counts as no allowance', async () => {
    await world.fundTrader(EXPIRED, { eth: parseEther('10'), tokens: [[token, AMOUNT_IN]] })
    await world.approvePermit2(EXPIRED, token)

    // A generous amount, granted to the right spender — but already past its expiration as of the
    // block the search pins. Time is never warped here: warping would move the fork's clock out
    // from under every other test in this file, so the expiration is simply written in the past.
    const now = (await anvil.publicClient.getBlock()).timestamp
    await permit2Approve(EXPIRED, Number(now) - 60)

    const [amount, expiration] = await permit2Allowance(EXPIRED, ADDRESSES.universalRouter)
    expect(amount).toBe(maxUint160) // the allowance is there...
    expect(BigInt(expiration)).toBeLessThan(now) // ...it is only the expiration that fails

    const result = needsAction(await swapFor(EXPIRED))
    expect(kindsOf(result.requirements)).toEqual(['permit2-allowance'])
  }, 300_000)

  it('a trader holding only ETH cannot fund an ERC-20 swap: insufficient-balance, with the real numbers', async () => {
    await world.fundTrader(ETH_ONLY, { eth: parseEther('100') })

    const result = needsAction(await swapFor(ETH_ONLY))
    expect(kindsOf(result.requirements)).toContain('insufficient-balance')
    const balance = result.requirements.find((r) => r.kind === 'insufficient-balance')!
    if (balance.kind !== 'insufficient-balance') throw new Error('unreachable')
    expect(balance.token).toBe(token)
    expect(balance.required).toBe(AMOUNT_IN)
    expect(balance.available).toBe(0n)
  }, 300_000)

  it('both approvals in place: ready, and the executed trade pays exactly the quote', async () => {
    // Same trader as the half-approved case, now granted the second leg — so the only thing that
    // changed between `needs-action` and `ready` is the Permit2 allowance.
    await world.approvePermit2(HALF_APPROVED, token, { toRouter: true })

    const ready = readySwap(await swapFor(HALF_APPROVED))
    const { receipt, delta } = await executeSwap(anvil, {
      trader: HALF_APPROVED,
      tx: ready.tx,
      currencyOut: out,
    })

    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)

  it('a signed Permit2 permit stands in for the missing allowance — and grants exactly it, to the router alone', async () => {
    // The signer must look like a plain EOA to Permit2 (see PERMIT_TRADER's note): with code at the
    // address, the ECDSA branch is never taken and the signature below would be ignored.
    expect(await anvil.publicClient.getCode({ address: PERMIT_TRADER })).toBeUndefined()

    // Half the spend path only: the token trusts Permit2, but Permit2 has been told nothing about
    // the Universal Router. The permit is what closes that gap, and it closes it INSIDE the swap.
    await world.fundTrader(PERMIT_TRADER, { eth: parseEther('10'), tokens: [[token, AMOUNT_IN]] })
    await world.approvePermit2(PERMIT_TRADER, token)

    const [amountBefore, , nonce] = await permit2Allowance(PERMIT_TRADER, ADDRESSES.universalRouter)
    expect(amountBefore).toBe(0n)

    // Without the permit, this exact trade is not executable — so anything that follows is the
    // permit's doing and not a standing approval left over from somewhere else.
    expect(kindsOf(needsAction(await swapFor(PERMIT_TRADER)).requirements)).toEqual(['permit2-allowance'])

    // A real EIP-712 signature over Permit2's own domain, from the trader's own key. The granted
    // amount is deliberately FINITE and larger than the trade (an infinite `maxUint160` allowance is
    // never decremented by Permit2, so it could not prove the pull went through the permit).
    const now = (await anvil.publicClient.getBlock()).timestamp
    const permitAmount = AMOUNT_IN * 3n
    const expiration = Number(now) + 3_600
    const values = {
      details: { token, amount: permitAmount, expiration, nonce },
      spender: ADDRESSES.universalRouter,
      sigDeadline: now + 3_600n,
    }
    const signature = await privateKeyToAccount(PERMIT_TRADER_KEY).signTypedData({
      domain: permit2Domain(ADDRESSES.permit2, 1),
      types: PERMIT2_TYPES,
      primaryType: 'PermitSingle',
      message: values,
    })
    const permit: Permit2PermitSingle = { ...values, signature }

    const ready = readySwap(
      await router.getSwap({ tokenIn: token, tokenOut: out, amountIn: AMOUNT_IN, trader: PERMIT_TRADER, permit }),
    )
    // The permit is not merely believed, it is carried: the signature is in the calldata that will
    // be broadcast, which is the only way the on-chain allowance below can come to exist.
    expect(ready.tx.data.toLowerCase()).toContain(signature.slice(2).toLowerCase())

    const { receipt, delta } = await executeSwap(anvil, { trader: PERMIT_TRADER, tx: ready.tx, currencyOut: out })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)

    // What the permit LEFT BEHIND. A Permit2 permit is an allowance grant, not a one-shot transfer:
    // after this transaction the router can still spend the unused remainder until `expiration`.
    // That standing authority is the risk this path carries, so it is asserted exactly.
    const [amountAfter, expirationAfter, nonceAfter] = await permit2Allowance(PERMIT_TRADER, ADDRESSES.universalRouter)
    expect(amountAfter).toBe(permitAmount - AMOUNT_IN)
    expect(expirationAfter).toBe(expiration)
    expect(nonceAfter).toBe(nonce + 1) // consumed once; the same signature cannot be replayed

    // ...and left behind for NOBODY ELSE. The encoder rejects a permit naming any other spender, so
    // no unrelated party can be walking away with a lasting allowance over the trader's tokens.
    const [bystanderAmount, bystanderExpiration] = await permit2Allowance(PERMIT_TRADER, BYSTANDER_SPENDER)
    expect(bystanderAmount).toBe(0n)
    expect(bystanderExpiration).toBe(0)
  }, 300_000)
})
