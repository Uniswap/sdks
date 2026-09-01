---
'@uniswap/router-sdk': patch
---

Fix midPrice inverting pool price across native/wrapped currency boundaries in mixed routes by deriving it from the route's resolved path. Handle the same boundaries at encode time: partitionMixedRouteByProtocol now ends a section at a native/wrapped boundary (so the encoder's wrap/unwrap between sections applies) and getOutputOfPools bridges wrapped equivalents instead of throwing.
