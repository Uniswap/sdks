/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.base.json'
    }
  },
  // CI Performance optimizations
  maxWorkers: process.env.CI ? '50%' : undefined,
  collectCoverage: false,
  testTimeout: 10000
};
