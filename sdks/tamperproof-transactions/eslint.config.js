import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.lint.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier: prettier,
    },
    rules: {
      // Prettier formatting
      'prettier/prettier': 'error',

      // TypeScript specific rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-inferrable-types': 'off',

      // Security and crypto-specific rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // Code quality
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-duplicate-imports': 'error',

      // Error prevention
      'no-unreachable': 'error',
      'no-unused-expressions': 'error',
      'no-throw-literal': 'error',
      'require-await': 'error',

      // Extend recommended rules
      ...typescriptEslint.configs.recommended.rules,
      ...typescriptEslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.lint.json',
      },
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier: prettier,
    },
    rules: {
      // Allow console in tests
      'no-console': 'off',
      // Test-specific overrides
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
  },
];
