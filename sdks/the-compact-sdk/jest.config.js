/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.js'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.base.json',
      },
    ],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.test.ts', '!**/node_modules/**'],
  coverageReporters: ['text', 'text-summary', 'html'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
}
