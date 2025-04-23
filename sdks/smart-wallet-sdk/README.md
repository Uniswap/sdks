# Smart Wallet SDK

⚒️ An SDK for building applications with smart wallets on Uniswap

This SDK provides utilities for interacting with Uniswap protocols using smart wallets.

## Installation

```bash
npm install @uniswap/smart-wallet-sdk
```

or

```bash
yarn add @uniswap/smart-wallet-sdk
```

## Quick Start

This example demonstrates how to batch multiple calls through a smart wallet:

```typescript
import { ChainId } from '@uniswap/sdk-core'
import { SmartWallet, CallPlanner } from '@uniswap/smart-wallet-sdk'

// 1. Initialize a CallPlanner to batch multiple contract calls
const planner = new CallPlanner()

// 2. Add calls to the planner
// Example: Add a token approval call
planner.add(
  '0x1234567890123456789012345678901234567890', // token contract address
  0n, // no ETH value sent
  '0x095ea7b3000000000000000000000000abcdef0123456789abcdef0123456789abcdef01000000000000000000000000000000000000000000000000000000000000ffff' // encoded approve function call
)

// Example: Add a swap call
planner.add(
  '0xabcdef0123456789abcdef0123456789abcdef01', // router contract address
  0n, // no ETH value sent
  '0x414bf389000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a0' // truncated swap function call
)

// 3. Encode calls using SmartWallet
const methodParameters = SmartWallet.encodeCalls(planner.calls)

// 4. Create the execute call that will be sent to the smart wallet
const executeCall = SmartWallet.createExecute(
  methodParameters,
  ChainId.MAINNET
)

// 5. The executeCall can now be sent as a transaction
console.log(executeCall)
// {
//   to: '0x0000000000000000000000000000000000000000', // smart wallet address
//   data: '0x7a9a1628...', // encoded execute function call
//   value: 0n // total ETH value to send
// }
```

### Alternative: Add Calls Directly

You can also create calls and pass them directly to the SmartWallet class:

```typescript
import { ChainId } from '@uniswap/sdk-core'
import { SmartWallet } from '@uniswap/smart-wallet-sdk'

// Create an array of calls
const calls = [
  {
    to: '0x1234567890123456789012345678901234567890', 
    data: '0x095ea7b3000000000000000000000000abcdef0123456789abcdef0123456789abcdef01000000000000000000000000000000000000000000000000000000000000ffff',
    value: 0n
  },
  {
    to: '0xabcdef0123456789abcdef0123456789abcdef01',
    data: '0x414bf389000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a0',
    value: 0n
  }
]

// Encode calls using SmartWallet
const methodParameters = SmartWallet.encodeCalls(calls)

// Create the execute call
const executeCall = SmartWallet.createExecute(
  methodParameters,
  ChainId.MAINNET
)
```

## Documentation

Coming soon...

## License

MIT