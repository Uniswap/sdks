---
'@uniswap/liquidity-launcher-sdk': minor
---

Add the autocompound position recipient accessors for auction / crowd launches with creator fees off: `getAutocompoundPositionRecipient` / `AUTOCOMPOUND_POSITION_RECIPIENTS` resolve the fees-off FeeSplitter to use as a launch's position recipient, and `isAutocompoundPositionRecipient` recognizes it classifier-side (any generation) — symmetric with the creator-fees pair. Also corrects the docs for the 2026-08-03 product reversal: fees-off CCA/crowd launches now autocompound through the fees-off FeeSplitter (the earlier "auto-compounding was rejected for quick launch" decision is reversed; buyback-&-burn remains for launches created before the change), and the `isCreatorFeesPositionRecipient` DECISION note now explains the fees-off exclusion exists purely to avoid misclassifying such launches as carrying creator fees. No behavior changes to existing exports.
