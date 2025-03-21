/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.base.json',
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/permit2/'],
}
