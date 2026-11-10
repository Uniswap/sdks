---
'@uniswap/router-sdk': patch
---

Fix `encodeMixedRouteToPath` resolving the wrong side of a pool at a native/wrapped currency boundary. Both branches now read each hop's currency directly from the route's already-resolved `path` instead of re-deriving it via `pool.token0.equals(currencyIn) ? pool.token1 : pool.token0`, which silently fell through to `pool.token0` whenever neither pool token matched by exact reference (same root cause fixed for `midPrice` in #706).
