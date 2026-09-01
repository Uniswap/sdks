---
'@uniswap/sdk-core': patch
---

Fixed `sqrt()`'s float fast path (values below `Number.MAX_SAFE_INTEGER`) returning a result one too high for inputs exactly one less than a perfect square, e.g. `sqrt(4503599761588224)` previously returned `67108865` instead of the correct `67108864`. `Math.sqrt` is correctly-rounded to the nearest double, not to the true integer square root, so for an `n` whose exact mathematical square root is extremely close to an integer from below, the rounded double can land exactly on that integer, and `Math.floor` no longer has any fractional part to floor away.

The existing `'correct for 0-1000'` test asserted `sqrt(i)` equals `Math.floor(Math.sqrt(i))` — the same computation the fast path performs internally, so it was true by construction for any implementation, correct or not, and never exercised this boundary. Added a regression test checking the actual mathematical definition of `floor(sqrt(n))` (`result^2 <= n < (result+1)^2`, via exact JSBI integer arithmetic) against the known failing case plus a spread of `k^2 - 1` inputs across the fast-path range, including its upper edge.

Real-world impact is narrow: the bug requires `n` to land exactly one below a perfect square (roughly 29% of such `k^2-1` values in the affected range hit it, but that shape itself is rare among arbitrary inputs — roughly 1 in 3×10^8 uniformly random values in range). The known consumers, v2-sdk's `getLiquidityMinted`/`getLiquidityValue`, would over-report by 1 wei of liquidity relative to UniswapV2's on-chain `Babylonian.sqrt` (which is exact) only when hit.
