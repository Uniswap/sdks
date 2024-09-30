# universal-router-sdk
This SDK facilitates interactions with the contracts in [Universal Router](https://github.com/Uniswap/universal-router)

## Usage
Install latest version of universal-router-sdk. Then import the corresponding Trade class and Data object for each protocol you'd like to interact with.

### Trading on Uniswap
warning: `swapERC20CallParameters()` to be deprecated in favor of `swapCallParameters()`
```typescript
import { TradeType } from '@uniswap/sdk-core'
import { Trade as V2TradeSDK } from '@uniswap/v2-sdk'
import { Trade as V3TradeSDK } from '@uniswap/v3-sdk'
import { MixedRouteTrade, MixedRouteSDK, Trade as RouterTrade } from '@uniswap/router-sdk'

const options = { slippageTolerance, recipient }
const routerTrade = new RouterTrade({ v2Routes, v3Routes, mixedRoutes, tradeType: TradeType.EXACT_INPUT })
// Use the raw calldata and value returned to call into Universal Swap Router contracts
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, options)
```

## Running this package
Make sure you are running `node v18`
Install dependencies and run typescript unit tests
```bash
yarn install
yarn test:hardhat
```

Run forge integration tests
```bash
forge install
yarn test:forge
```
