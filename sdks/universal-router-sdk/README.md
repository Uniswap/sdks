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

## Per-Hop Slippage Protection

Universal Router v2.1.1 adds granular slippage protection for multi-hop swaps across all protocol versions (V2, V3, V4, and mixed routes). In addition to the overall trade-level slippage check, the contract can verify that each individual pool hop doesn't exceed a maximum price limit.

### How It Works

Per-hop slippage bounds live on each swap's route data (via `RouterTrade`). The `maxHopSlippage` array on each route maps 1:1 to the route's pools: `maxHopSlippage[i]` constrains `route.pools[i]`.

To enable the V2.1.1 ABI encoding (which includes the `maxHopSlippage` parameter), set `urVersion: URVersion.V2_1_1` on your swap options.

```typescript
import { SwapRouter } from '@uniswap/universal-router-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { URVersion } from '@uniswap/v4-sdk'
import { Percent, TradeType } from '@uniswap/sdk-core'

// 1. Build a trade with per-hop slippage on each route
const trade = new RouterTrade({
  v3Routes: [
    {
      routev3: myV3Route, // e.g. USDC → DAI → WETH
      inputAmount,
      outputAmount,
      maxHopSlippage: [
        // one entry per pool in the route
        BigInt('1010000000000000000'), // Hop 0: USDC→DAI, max price 1.01
        BigInt('2500000000000000000000'), // Hop 1: DAI→WETH, max price 2500
      ],
    },
  ],
  tradeType: TradeType.EXACT_INPUT,
})

// 2. Encode with V2.1.1 ABI
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000), // 0.5% overall slippage
  recipient: '0x...',
  urVersion: URVersion.V2_1_1, // required for per-hop encoding
})
```

### Price Calculation

Slippage is expressed as a **price** with 18 decimals of precision:

- `price = amountIn * 1e18 / amountOut`

If the calculated price for hop `i` exceeds `maxHopSlippage[i]`, the transaction reverts.

### Mixed Routes

For mixed routes that span multiple protocol versions (e.g. V3 pool → V4 pool → V2 pool), the SDK automatically slices the flat `maxHopSlippage` array by section. Each protocol section receives the corresponding slice of hop bounds:

```typescript
const trade = new RouterTrade({
  mixedRoutes: [
    {
      mixedRoute: myMixedRoute, // V3 pool, V3 pool, V2 pool
      inputAmount,
      outputAmount,
      maxHopSlippage: [
        BigInt('1010000000000000000'), // Hop 0 (V3 section)
        BigInt('2500000000000000000000'), // Hop 1 (V3 section)
        BigInt('1005000000000000000'), // Hop 2 (V2 section)
      ],
    },
  ],
  tradeType: TradeType.EXACT_INPUT,
})
```

### Benefits

1. **MEV Protection**: Prevents sandwich attacks on individual pool hops
2. **Route Quality**: Ensures each segment of a multi-hop route meets price expectations
3. **Granular Control**: Different slippage tolerances for different pairs (e.g. tighter bounds on stablecoin hops)

### Backward Compatibility

- If `maxHopSlippage` is omitted or is an empty array, only the overall trade-level slippage is checked
- If `urVersion` is not set (defaults to V2.0), commands use the standard ABI without `maxHopSlippage`

## Signed Routes (Universal Router v2.1)

Universal Router v2.1 supports EIP712-signed route execution, enabling gasless transactions and intent-based trading.

**Important**: The SDK does not perform signing. It provides utilities to prepare EIP712 payloads and encode signed calldata. You sign with your own mechanism (wallet, KMS, hardware, etc.).

### Basic Flow

```typescript
import { SwapRouter, NONCE_SKIP_CHECK } from '@uniswap/universal-router-sdk'
import { Wallet } from '@ethersproject/wallet'

const wallet = new Wallet('0x...')
const chainId = 1
const routerAddress = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'
const deadline = Math.floor(Date.now() / 1000) + 60 * 20

// 1. Generate regular swap calldata
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient: wallet.address,
  deadline,
})

// 2. Get EIP712 payload to sign
const payload = SwapRouter.getExecuteSignedPayload(
  calldata,
  {
    intent: '0x' + '0'.repeat(64), // Application-specific intent
    data: '0x' + '0'.repeat(64), // Application-specific data
    sender: wallet.address, // Or address(0) to skip sender verification
  },
  deadline,
  chainId,
  routerAddress
)

// 3. Sign externally (wallet/KMS/hardware)
const signature = await wallet._signTypedData(payload.domain, payload.types, payload.value)

// 4. Encode for executeSigned()
const { calldata: signedCalldata, value: signedValue } = SwapRouter.encodeExecuteSigned(
  calldata,
  signature,
  {
    intent: payload.value.intent,
    data: payload.value.data,
    sender: payload.value.sender,
    nonce: payload.value.nonce, // Must match what was signed
  },
  deadline,
  BigNumber.from(value)
)

// 5. Submit transaction
await wallet.sendTransaction({
  to: routerAddress,
  data: signedCalldata,
  value: signedValue,
})
```

### Nonce Management

- **Random nonce (default)**: Omit `nonce` parameter - SDK generates random nonce
- **Skip nonce check**: Use `NONCE_SKIP_CHECK` sentinel to allow signature reuse
- **Custom nonce**: Provide your own nonce for ordering

```typescript
import { NONCE_SKIP_CHECK } from '@uniswap/universal-router-sdk'

// Reusable signature (no nonce check)
const payload = SwapRouter.getExecuteSignedPayload(
  calldata,
  {
    intent: '0x...',
    data: '0x...',
    sender: '0x0000000000000000000000000000000000000000', // Skip sender verification too
    nonce: NONCE_SKIP_CHECK, // Allow signature reuse
  },
  deadline,
  chainId,
  routerAddress
)
```

### Sender Verification

- **Verify sender**: Pass the actual sender address (e.g., `wallet.address`)
- **Skip verification**: Pass `'0x0000000000000000000000000000000000000000'`

The SDK automatically sets `verifySender` based on whether sender is address(0).

## Cross-Chain Bridging with Across (Universal Router v2.1)

Universal Router v2.1 integrates with Across Protocol V3 to enable seamless cross-chain bridging after swaps. This allows you to swap tokens on one chain and automatically bridge them to another chain in a single transaction.

### Basic Usage

```typescript
import { SwapRouter } from '@uniswap/universal-router-sdk'
import { BigNumber } from 'ethers'

// 1. Prepare your swap (e.g., USDC → WETH on mainnet)
const { calldata, value } = SwapRouter.swapCallParameters(trade, swapOptions, [
  {
    // Bridge configuration
    depositor: userAddress,
    recipient: userAddress, // Recipient on destination chain
    inputToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH mainnet
    outputToken: '0x4200000000000000000000000000000000000006', // WETH optimism
    inputAmount: BigNumber.from('1000000000000000000'), // 1 WETH
    outputAmount: BigNumber.from('990000000000000000'), // 0.99 WETH (with fees)
    destinationChainId: 10, // Optimism
    exclusiveRelayer: '0x0000000000000000000000000000000000000000',
    quoteTimestamp: Math.floor(Date.now() / 1000),
    fillDeadline: Math.floor(Date.now() / 1000) + 3600,
    exclusivityDeadline: 0,
    message: '0x',
    useNative: false,
  },
])
```

### Swap + Bridge Example

```typescript
// Swap USDC to WETH, then bridge WETH to Optimism
const bridgeParams = {
  depositor: userAddress,
  recipient: userAddress, // Can be different address on destination
  inputToken: WETH_MAINNET,
  outputToken: WETH_OPTIMISM,
  inputAmount: CONTRACT_BALANCE, // Use entire swap output
  outputAmount: expectedOutputAmount,
  destinationChainId: 10,
  exclusiveRelayer: '0x0000000000000000000000000000000000000000',
  quoteTimestamp: Math.floor(Date.now() / 1000),
  fillDeadline: Math.floor(Date.now() / 1000) + 3600,
  exclusivityDeadline: 0,
  message: '0x', // Optional message to execute on destination
  useNative: false, // Set to true to bridge native ETH
}

const { calldata, value } = SwapRouter.swapCallParameters(
  trade,
  swapOptions,
  [bridgeParams] // Array of bridge operations
)
```

### Using CONTRACT_BALANCE

When bridging after a swap, you often don't know the exact output amount. Use `CONTRACT_BALANCE` to bridge the entire contract balance:

```typescript
import { CONTRACT_BALANCE } from '@uniswap/universal-router-sdk'

const bridgeParams = {
  // ... other params
  inputAmount: CONTRACT_BALANCE, // Bridge entire balance after swap
  // ... other params
}
```

### Multiple Bridge Operations

You can perform multiple bridge operations after a swap:

```typescript
const { calldata, value } = SwapRouter.swapCallParameters(trade, swapOptions, [
  {
    // Bridge 50% to Optimism
    inputToken: WETH_MAINNET,
    outputToken: WETH_OPTIMISM,
    inputAmount: BigNumber.from('500000000000000000'),
    destinationChainId: 10,
    // ... other params
  },
  {
    // Bridge remaining USDC to Arbitrum
    inputToken: USDC_MAINNET,
    outputToken: USDC_ARBITRUM,
    inputAmount: CONTRACT_BALANCE,
    destinationChainId: 42161,
    // ... other params
  },
])
```

### Native ETH Bridging

To bridge native ETH instead of WETH:

```typescript
const bridgeParams = {
  inputToken: WETH_ADDRESS, // Must be WETH address
  outputToken: WETH_ON_DESTINATION,
  useNative: true, // Bridge as native ETH
  // ... other params
}
```

### Important Notes

1. **Across Quote**: Bridge parameters (especially `outputAmount`, `quoteTimestamp`, `fillDeadline`) should come from the Across API quote
2. **Recipient Address**: Can be different from the sender, allowing cross-chain transfers to other addresses
3. **Message Passing**: The `message` field allows executing arbitrary calls on the destination chain
4. **Slippage**: The `outputAmount` already accounts for bridge fees and slippage
