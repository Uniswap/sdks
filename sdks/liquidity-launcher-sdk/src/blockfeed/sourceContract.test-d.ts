/**
 * Type-drift guard (design §3). The ONLY place `@uniswap/blockfeed-sdk` may be imported — and only as
 * `import type`, against the devDependency. It asserts each CCA factory's return value structurally
 * `satisfies` the real engine `Source<T>`. If either the engine contract or our structural mirror
 * (`./types`) drifts, this file stops compiling under `bun run typecheck` (`tsc`), catching a
 * divergence that structural typing would otherwise only surface in some downstream app's build.
 *
 * This is a compile-time-only artifact: type-only, no `bun:test` import (so `tsc` can check it without
 * bun ambient types), and excluded from the emitted build (`tsconfig.{cjs,esm,types}.json`). It runs
 * no assertions — `tsc` succeeding IS the assertion.
 */
import type { Source as EngineSource } from '@uniswap/blockfeed-sdk'
import { zeroAddress } from 'viem'

import { ccaAuctionSource } from './ccaAuctionSource'
import { ccaBidsSource } from './ccaBidsSource'
import { launchAssetSource } from './launchAssetSource'
import type { CcaAuctionState, CcaBidsState, LaunchAssetState } from './types'

const AUCTION = '0x1234567890abcdef1234567890abcdef12345678'
const LENS = '0x00cca200bf124dbfa848937c553864f4b4ce0632'
const STATE_VIEW = '0xabababababababababababababababababababab'
const TOKEN = '0xcccccccccccccccccccccccccccccccccccccccc'

// Each factory's return type must be assignable to the engine's Source<T>.
ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS }) satisfies EngineSource<CcaAuctionState>

ccaBidsSource({ auction: AUCTION }) satisfies EngineSource<CcaBidsState>

launchAssetSource({
  chainId: 130,
  auction: AUCTION,
  tickDataLens: LENS,
  poolKey: { currency0: zeroAddress, currency1: TOKEN, fee: 2500, tickSpacing: 50, hooks: zeroAddress },
  stateView: STATE_VIEW,
  endBlock: 1000n,
}) satisfies EngineSource<LaunchAssetState>
