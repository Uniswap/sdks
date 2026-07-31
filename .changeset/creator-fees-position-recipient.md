---
'@uniswap/liquidity-launcher-sdk': minor
---

Add creator-fees position recipient helper and fee-splitter custody mode for auction launches: `getCreatorFeesPositionRecipient` / `CREATOR_FEES_POSITION_RECIPIENTS` resolve the fees-enabled FeeSplitter to use as a launch's position recipient, `isCreatorFeesPositionRecipient` recognizes it classifier-side, and the quick-launch model gains a structurally permanent `creatorFees` lock mode that `isQuickLaunch` and `isPermanentTimelock` accept.
