// ---------------------------------------------------------------------------
// Flag parsing — a thin, typed wrapper over `node:util`'s built-in
// `parseArgs`, not a CLI framework and not a hand-rolled tokenizer.
//
// The runtime already ships a parser that handles `--flag value`,
// `--flag=value`, booleans, repeatable flags (`multiple: true` for `--hint`),
// strict unknown-flag rejection, and `--` termination — so the maintenance
// surface here is only (a) the spec shape the commands declare, and (b)
// mapping parse failures to this CLI's `UsageError` so `rl.ts` renders them
// as friendly one-liners with exit code 3 instead of stacks. A full CLI
// framework (commander/oclif/citty) was considered and skipped deliberately:
// this repo publishes SDKs and currently carries no CLI-framework dependency
// anywhere, and the framework would replace only this file while the tool's
// real complexity (report rendering, token/chain resolution, key redaction)
// stays custom either way.
// ---------------------------------------------------------------------------

import { parseArgs as nodeParseArgs } from 'node:util'

export class UsageError extends Error {}

export type FlagSpec = {
  /** `boolean` flags take no value; `string` take one (last wins); `strings` accumulate all. */
  [name: string]: { kind: 'boolean' | 'string' | 'strings'; alias?: string }
}

export type ParsedArgs = {
  positionals: string[]
  booleans: Set<string>
  strings: Map<string, string>
  lists: Map<string, string[]>
}

/**
 * Parses `argv` (already stripped of the runtime and script path) against `spec`. Unknown flags are
 * a {@link UsageError} — a typo'd `--budjet` silently ignored would run an unbounded search the
 * caller thought was capped, which is exactly the failure a testing tool must not have.
 */
export function parseArgs(argv: string[], spec: FlagSpec): ParsedArgs {
  const options: NonNullable<Parameters<typeof nodeParseArgs>[0]>['options'] = {}
  for (const [name, def] of Object.entries(spec)) {
    options[name] = {
      type: def.kind === 'boolean' ? 'boolean' : 'string',
      ...(def.kind === 'strings' ? { multiple: true as const } : {}),
      ...(def.alias ? { short: def.alias } : {}),
    }
  }

  let values: Record<string, unknown>
  let positionals: string[]
  try {
    ;({ values, positionals } = nodeParseArgs({ args: argv, options, allowPositionals: true, strict: true }))
  } catch (err) {
    // Node's own message ("Unknown option '--budjet'", "Option '--budget' requires argument") is
    // already the right prose — just strip the trailing usage hint it sometimes appends.
    const message = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    throw new UsageError(message)
  }

  const out: ParsedArgs = { positionals, booleans: new Set(), strings: new Map(), lists: new Map() }
  for (const [name, def] of Object.entries(spec)) {
    const value = values[name]
    if (value === undefined) continue
    if (def.kind === 'boolean' && value === true) out.booleans.add(name)
    else if (def.kind === 'string' && typeof value === 'string') out.strings.set(name, value)
    else if (def.kind === 'strings' && Array.isArray(value)) out.lists.set(name, value as string[])
  }
  return out
}
