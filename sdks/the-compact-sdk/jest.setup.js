/**
 * Jest setup file to polyfill fetch for test environment
 * Required for viem's HTTP transport to work in tests
 *
 * Uses cross-fetch for fetch API and abortcontroller-polyfill for AbortController
 */

// Load polyfills
require('cross-fetch/polyfill')
require('abortcontroller-polyfill/dist/polyfill-patch-fetch')
