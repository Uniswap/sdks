import { defineConfig } from 'tsup'

const entries = [
  'core',
  'v2',
  'v3',
  'v4',
  'router',
  'universal-router',
  'permit2',
  'uniswapx',
  'smart-wallet',
  'flashtestations',
  'tamperproof',
]

export default defineConfig(
  entries.map((entry) => ({
    entry: { [`${entry}/index`]: `src/${entry}/index.ts` },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false, // Don't clean between entries
    outDir: 'dist',
    splitting: false,
    treeshake: true,
    external: [
      // Peer dependencies - let consumers provide these
      'ethers',
      'viem',
      // External Uniswap contracts
      '@uniswap/v3-core',
      '@uniswap/v3-periphery',
      '@uniswap/v3-staker',
      '@uniswap/v2-core',
      '@uniswap/swap-router-contracts',
      '@uniswap/universal-router',
      '@openzeppelin/contracts',
    ],
  }))
)
