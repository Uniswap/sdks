import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@uniswap/sdk/core': path.resolve(__dirname, 'src/core'),
      '@uniswap/sdk/v2': path.resolve(__dirname, 'src/v2'),
      '@uniswap/sdk/v3': path.resolve(__dirname, 'src/v3'),
      '@uniswap/sdk/v4': path.resolve(__dirname, 'src/v4'),
      '@uniswap/sdk/router': path.resolve(__dirname, 'src/router'),
      '@uniswap/sdk/universal-router': path.resolve(__dirname, 'src/universal-router'),
      '@uniswap/sdk/permit2': path.resolve(__dirname, 'src/permit2'),
      '@uniswap/sdk/uniswapx': path.resolve(__dirname, 'src/uniswapx'),
      '@uniswap/sdk/smart-wallet': path.resolve(__dirname, 'src/smart-wallet'),
      '@uniswap/sdk/flashtestations': path.resolve(__dirname, 'src/flashtestations'),
      '@uniswap/sdk/tamperproof': path.resolve(__dirname, 'src/tamperproof'),
    },
  },
})
