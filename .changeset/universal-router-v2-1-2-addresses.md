---
'@uniswap/universal-router-sdk': minor
'@uniswap/v4-sdk': minor
---

Add Universal Router v2.1.2 addresses (#736)

Adds the `UniversalRouterVersion.V2_1_2` enum member (mirrored as `URVersion.V2_1_2` in v4-sdk) and the v2.1.2 Universal Router deployment config — router address and creation block — across the 24 supported chains. Consumers can now resolve v2.1.2 routers via `UNIVERSAL_ROUTER_ADDRESS`/`CHAIN_CONFIGS` and select the version through `SwapOptions.urVersion`; #736 landed the addresses on `main` without a changeset, so this releases them.
