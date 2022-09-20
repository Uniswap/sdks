
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./gouda-sdk.cjs.production.min.js')
} else {
  module.exports = require('./gouda-sdk.cjs.development.js')
}
