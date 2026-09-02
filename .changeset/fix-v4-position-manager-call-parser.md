---
"@uniswap/universal-router-sdk": patch
---

Fix `CommandParser` throwing on `V4_POSITION_MANAGER_CALL` (command `0x14`). Its real on-chain calldata is a full `modifyLiquidities(bytes,uint256)` function call (selector-prefixed), not the raw `(bytes actions, bytes[] params)` tuple `V4_SWAP` uses, so decoding it via the V4 actions parser threw an overflow error. It's now parsed opaquely, matching `V3_POSITION_MANAGER_CALL`.

Also fixes a related bug in the opaque command parser (`Parser.V3Actions`): it returned every command's raw input for each opaque command in a route instead of just its own.
