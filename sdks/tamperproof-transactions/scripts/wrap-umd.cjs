#!/usr/bin/env node
// Wraps a CJS bundle into a UMD wrapper that exposes a global variable.
// Usage: node scripts/wrap-umd.js <input> <output> <globalName>

const fs = require('fs')
const [, , input, output, globalName] = process.argv
const code = fs.readFileSync(input, 'utf8')

const wrapped = `(function(root, factory) {
  if (typeof define === 'function' && define.amd) { define([], factory); }
  else if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.${globalName} = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function() {
  var module = { exports: {} };
  var exports = module.exports;
${code}
  return module.exports;
});
`

fs.writeFileSync(output, wrapped)
