---
'@uniswap/liquidity-launcher-sdk': minor
---

Add CCA auction-instance interaction helpers: `buildSweepUnsoldTokensTx` / `buildMigrateTx` transaction builders (with `encodeSweepUnsoldTokens` / `encodeMigrate` and a minimal `CCA_ABI`, plus `migrate` on `LBP_STRATEGY_ABI`), auction state read descriptors (`isGraduatedCall`, `sweepUnsoldTokensBlockCall`, `sweepCurrencyBlockCall`, `currencyRaisedCall`, `remainingSupplyCall`, `tokensRecipientCall`, `auctionEndBlockCall`, `auctionClaimBlockCall`), and a pure `deriveAuctionOutcome` helper. Creators of a failed (non-graduated) auction can now construct the `sweepUnsoldTokens()` withdrawal transaction, and anyone can construct the success-path `LBPStrategy.migrate()` transaction.
