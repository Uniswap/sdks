---
"@uniswap/universal-router-sdk": patch
---

fix: mask ALLOW_REVERT_FLAG bit in GenericCommandParser.getCommands before casting to CommandType, matching on-chain Dispatcher.sol dispatch semantics. Previously any calldata containing a flagged command (e.g. a sub-plan) threw a TypeError instead of parsing.
