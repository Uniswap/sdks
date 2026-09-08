---
"@uniswap/liquidity-launcher-sdk": minor
---

`buildPositionDefinitions`: allow `CUSTOM_RANGE` liquidity percentages to sum to less than 100%.

Under-allocation was rejected with `INVALID_PRICE_RANGE` ("Custom price range liquidity percentages must sum to 100%"), on the assumption that unallocated LP budget had no destination position. It does: `PositionPlanner.resolve` always appends an implicit full-range position carrying whatever the definitions leave unspent, and the planner only reverts when the weights *exceed* `MPS`. A caller allocating 45% across concentrated ranges now gets two definitions summing to 45% of `MPS_TOTAL`, and the remaining 55% of the budget goes to that full-range position on migration.

Over-allocation (`> 100%`) still throws, unchanged. No API surface change.
