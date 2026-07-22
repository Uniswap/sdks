import type { CallResult, ContractCall } from '../types'

/** Stable string identity for a call, for cross-source batch dedupe. */
function callFingerprint(callDescriptor: ContractCall): string {
  const args = JSON.stringify(callDescriptor.args, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
  return `${callDescriptor.address.toLowerCase()}::${callDescriptor.functionName}::${args}`
}

/**
 * Plan one tick's shared call batch across every requesting source. Identical calls (same fingerprint)
 * from different sources collapse into ONE keyed slot, so the shared multicall issues each distinct
 * read once. A shared slot tolerates failure only if EVERY requester tolerates it (AND-merge): one
 * strict requester makes the slot strict, so a revert fails the whole tick.
 *
 * Returns the deduped `keyed` map to hand to the tick reader, plus `distribute`, which fans a keyed
 * result map back to per-requester result maps under each requester's OWN un-namespaced call keys.
 * Every requester passed in gets an entry in the returned map (empty when it requested no calls).
 */
export function planCallBatch<R>(
  requests: Array<{ requester: R; sourceKey: string; calls: Record<string, ContractCall> }>
): {
  keyed: Record<string, ContractCall>
  distribute(results: Record<string, CallResult>): Map<R, Record<string, CallResult>>
} {
  const keyed: Record<string, ContractCall> = {}
  const fingerprintToSlot = new Map<string, string>()
  const slotRequesters = new Map<string, Array<{ requester: R; callKey: string }>>()

  for (const { requester, sourceKey, calls } of requests) {
    for (const [callKey, descriptor] of Object.entries(calls)) {
      const fingerprint = callFingerprint(descriptor)
      let slotKey = fingerprintToSlot.get(fingerprint)
      if (slotKey === undefined) {
        slotKey = `${sourceKey}:${callKey}`
        fingerprintToSlot.set(fingerprint, slotKey)
        keyed[slotKey] = {
          address: descriptor.address,
          abi: descriptor.abi,
          functionName: descriptor.functionName,
          args: descriptor.args,
          allowFailure: descriptor.allowFailure === true,
        }
        slotRequesters.set(slotKey, [])
      } else {
        // Shared slot tolerates failure only if EVERY requester tolerates it (AND).
        const slot = keyed[slotKey] as ContractCall
        slot.allowFailure = slot.allowFailure === true && descriptor.allowFailure === true
      }
      slotRequesters.get(slotKey)!.push({ requester, callKey })
    }
  }

  return {
    keyed,
    distribute(results: Record<string, CallResult>): Map<R, Record<string, CallResult>> {
      // Seed every requester (even zero-call ones) so each source derives against its own results map.
      const byRequester = new Map<R, Record<string, CallResult>>()
      for (const { requester } of requests) {
        if (!byRequester.has(requester)) byRequester.set(requester, {})
      }
      // Map each deduped slot result back to every requester's own un-namespaced call key.
      for (const [slotKey, requesters] of slotRequesters) {
        const res = results[slotKey]
        if (res === undefined) continue
        for (const { requester, callKey } of requesters) byRequester.get(requester)![callKey] = res
      }
      return byRequester
    },
  }
}
