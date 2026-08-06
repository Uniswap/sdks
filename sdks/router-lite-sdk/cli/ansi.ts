// ---------------------------------------------------------------------------
// Hand-rolled ANSI styling — the whole terminal-styling dependency surface of
// this CLI, on purpose.
//
// The repo's dependency tree has no chalk/picocolors/ink and this tool needs
// exactly six escape codes, so it rolls them by hand rather than adding a
// package for what is a dozen lines. Color is on only when stdout is a TTY
// and `NO_COLOR` is unset (https://no-color.org), and every style helper
// funnels through one `paint` seam so tests (and `--json` output paths) can
// force it off deterministically via `setColorEnabled`.
// ---------------------------------------------------------------------------

let colorEnabled: boolean = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined

/** Force color on/off — tests and `--json` paths use this; interactive runs keep the TTY default. */
export function setColorEnabled(on: boolean): void {
  colorEnabled = on
}

function paint(open: string, close: string): (s: string) => string {
  return (s: string) => (colorEnabled ? `[${open}m${s}[${close}m` : s)
}

export const bold = paint('1', '22')
export const dim = paint('2', '22')
export const red = paint('31', '39')
export const green = paint('32', '39')
export const yellow = paint('33', '39')
export const cyan = paint('36', '39')

/**
 * A fixed-width coverage bar: `filled/total` cells of `▰` padded with `▱`.
 * `fraction` outside [0, 1] is clamped rather than thrown on — a rendering
 * helper should never be the thing that kills a report over a rounding edge.
 */
export function bar(fraction: number, width = 10): string {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const filled = Math.round(clamped * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

/** Shortens a hex identifier for display: `0x1234…abcd`. Non-hex/short input passes through. */
export function shortHex(hex: string): string {
  if (!hex.startsWith('0x') || hex.length <= 12) return hex
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`
}
