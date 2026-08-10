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

/** Every SGR escape this module ever emits — the only shape `visibleWidth`/`padEndVisible`
 * need to strip, since `paint` is the sole producer. */
const ANSI_RE = /\x1b\[[0-9;]*m/g

/**
 * The width a styled string actually occupies on screen — `paint`'s escape codes cost bytes but no
 * columns, so `.length` over-counts a colored string by exactly the width of its open/close codes.
 * The runners-up delta table pads columns to their widest CELL, and column widths computed from raw
 * `.length` would drift between a colored run and a `--json`/test run of the identical data — this
 * is what keeps the two aligned the same way.
 */
export function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, '').length
}

/** Right-pads `s` with spaces to `width` VISIBLE columns — see {@link visibleWidth}. A no-op if `s`
 * is already at or past `width`. */
export function padEndVisible(s: string, width: number): string {
  const pad = width - visibleWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

