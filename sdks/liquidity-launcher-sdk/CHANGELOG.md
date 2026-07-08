# @uniswap/liquidity-launcher-sdk

## 0.2.0

### Minor Changes

- 437605c: Add Avalanche (43114), XLayer (196), and Robinhood Chain (4663) to the supported launch chains, all carrying the canonical uERC20 factory. Robinhood is intentionally omitted from `BLOCK_TIME_SECONDS_BY_CHAIN` — like Arbitrum, its contract-visible `block.number` tracks Ethereum L1 (~12s).

## 0.1.0

### Minor Changes

- a021251: Add `@uniswap/liquidity-launcher-sdk`: a framework-agnostic toolkit for the Uniswap Liquidity Launcher (CCA + LBP) stack — per-chain addresses, ABIs, struct types, calldata encoders, deterministic-address prediction, auction-configuration math, on-chain read descriptors, fee-tier availability (`getFeeTierAvailability`), a pure transaction assembler (`buildLaunchTransactions`), and liquidity-lock recipients (`buildLockRecipient`: timelock / fees-forwarder / buyback-burn).
