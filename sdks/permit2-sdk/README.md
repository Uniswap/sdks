# Permit2 SDK

The Permit2 SDK provides utilities for interacting with the Permit2 contract, enabling efficient token approvals and transfers.

## Learn More
- [Introducing Permit2 and Universal Router](https://blog.uniswap.org/permit2-and-universal-router)
- [How to Integrate with Permit2](https://blog.uniswap.org/permit2-integration-guide)
- [Permit2 Documentation](https://docs.uniswap.org/contracts/permit2/overview)

## Installation

```bash
npm install @uniswap/permit2-sdk
```

## Quick Start

Here are basic examples of how to use the Permit2 SDK to generate a signature for a PermitSingle using Ethers v5:

### Frontend (Browser) Example

```typescript
import { ethers } from 'ethers'
import { AllowanceProvider, AllowanceTransfer, PERMIT2_ADDRESS, PermitSingle, MaxAllowanceTransferAmount } from '@uniswap/permit2-sdk'

async function frontendExample() {
  // Setup (using Ethers v5)
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const signer = provider.getSigner()
  const chainId = await provider.getNetwork().then(network => network.chainId)

  // Get the next valid nonce
  const allowanceProvider = new AllowanceProvider(provider, PERMIT2_ADDRESS)
  const { nonce } = await allowanceProvider.getAllowanceData(await signer.getAddress(), tokenAddress, spenderAddress)

  // Construct the PermitSingle object
  const permitSingle: PermitSingle = {
    details: {
      token: tokenAddress,
      amount: MaxAllowanceTransferAmount,
      expiration: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days
      nonce,
    },
    spender: spenderAddress,
    sigDeadline: Math.floor((Date.now() + 30 * 60 * 1000) / 1000), // 30 minutes
  }

  // Get the permit data
  const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingle, PERMIT2_ADDRESS, chainId)

  // Sign the permit
  const signature = await signer._signTypedData(domain, types, values)

  // Now you can use `permitSingle` and `signature` in your contract calls
}
```

### Backend (Node.js) Example

```typescript
async function backendExample() {
  // Setup (using Ethers v5)
  const provider = new ethers.providers.JsonRpcProvider('YOUR_RPC_URL')
  const privateKey = 'YOUR_PRIVATE_KEY'
  const signer = new ethers.Wallet(privateKey, provider)

  // same as Frontend Example...
}
```

Note: These examples use Ethers v5. If you're using a different version, you may need to adjust the code accordingly.

## Key Concepts

- **PermitSingle**: Represents a single token approval.
- **AllowanceProvider**: Helps retrieve current allowance data.
- **AllowanceTransfer**: Provides methods to generate permit data for signing.

## Local Development

### Run Unit Tests
- `yarn test`

### Run Forge tests
- `yarn build`
- `yarn interop`
- `(cd permit2 && forge build)`
- `forge test`
