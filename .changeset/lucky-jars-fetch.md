---
"@uniswap/universal-router-sdk": minor
---

Export `encodeSwapStep` from the package root so consumers can compose per-step `{commands, inputs}` plans into their own RoutePlanner without the `encodeSwaps` envelope (no Permit2 ingress, fee, or final sweep).
