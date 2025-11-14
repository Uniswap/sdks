/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.js'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.base.json',
    },
  },
}

