---
"@uniswap/liquidity-launcher-sdk": minor
---

Add CCA blockfeed sources: pure-reducer `Source` factories that plug a quick-launch auction into `@uniswap/blockfeed-sdk` with zero runtime coupling (blockfeed is a devDependency only; a types-only drift guard keeps the shapes compatible). `ccaAuctionSource` streams the live auction state (clearing price, currency raised, remaining supply, per-tick fill ratios); `ccaBidsSource` watches the `BidSubmitted` log stream with a monotonic cumulative count; and the composite `launchAssetSource` emits one continuous phase-tagged stream (`auction` → `graduated`/`failed`) that carries the graduated-pool price in the same emission as the graduation phase event via a speculative `StateView.getSlot0` read (no gap tick at graduation).
