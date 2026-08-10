---
'@uniswap/universal-router-sdk': patch
---

Encode the ACROSS_V4_DEPOSIT_V3 command input as a single offset-prefixed tuple, matching ChainedActions.sol's `abi.decode(input, (AcrossV4DepositV3Params))`. The previous flat 13-value encoding reverted with empty data at the dispatcher's decode, so every payload built via `addAcrossBridge` / `swapCallParameters` `bridgeOptions` was unexecutable.
