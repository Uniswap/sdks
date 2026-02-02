/**
 * Jest setup file to polyfill fetch for test environment
 * Required for viem's HTTP transport to work in tests
 *
 * Uses cross-fetch for fetch API and abortcontroller-polyfill for AbortController
 */

// Load polyfills
require('cross-fetch/polyfill')
require('abortcontroller-polyfill/dist/polyfill-patch-fetch')

// Jest's default console capture prints callsite context (`at file:line`) for each log.
// For e2e runs this is very noisy; route console methods directly to stdout/stderr instead.
const util = require('util')

function formatArgs(args) {
  return args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { colors: false, depth: 10 }))).join(' ')
}

global.console.log = (...args) => process.stdout.write(formatArgs(args) + '\n')
global.console.info = (...args) => process.stdout.write(formatArgs(args) + '\n')
global.console.warn = (...args) => process.stderr.write(formatArgs(args) + '\n')
global.console.error = (...args) => process.stderr.write(formatArgs(args) + '\n')
