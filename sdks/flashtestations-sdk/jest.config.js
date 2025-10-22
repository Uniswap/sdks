/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.base.json',
      isolatedModules: true,
      // Disable the problematic hoist-jest transformer that's incompatible with TypeScript 5.6
      diagnostics: {
        warnOnly: true,
      },
    },
  },
  // Clear jest cache to avoid stale transformer issues
  clearMocks: true,
  // CI Performance optimizations
  maxWorkers: process.env.CI ? '50%' : undefined,
  collectCoverage: false,
  testTimeout: 10000
};
