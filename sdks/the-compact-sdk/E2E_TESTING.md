# End-to-End Testing Guide

This document describes how to run the end-to-end (e2e) integration tests for The Compact SDK using Supersim.

## Overview

The e2e test suite validates the entire SDK stack against live forked chains, testing:

- Basic deposits and withdrawals
- Compact creation and signing
- Claim submission
- Multi-chain operations
- Error handling

## Prerequisites

### 1. Install Supersim

```bash
# Install Supersim (https://supersim.pages.dev)
brew tap ethereum-optimism/tap
brew install supersim
```

### 2. Start Supersim

Supersim runs multiple forked chains simultaneously:

```bash
supersim fork --chains=op,base,unichain
```

This will start:

- **Port 8545**: Ethereum Mainnet fork
- **Port 9545**: OP Mainnet fork
- **Port 9546**: Base Mainnet fork
- **Port 9547**: Unichain fork

### 3. Verify The Compact Contract

The e2e tests use The Compact mainnet deployment at:

```
0x00000000000000171ede64904551eeDF3C6C9788
```

This contract should be available on the forked networks.

## Running E2E Tests

### Run all e2e tests

```bash
npm run test:e2e
```

### Run specific test suites

```bash
# Only deposit/withdrawal tests
E2E_TESTS=1 npm test -- --testPathPattern="Deposit and Withdrawal"

# Only compact creation tests
E2E_TESTS=1 npm test -- --testPathPattern="Compact Creation"
```

## Test Accounts

The e2e tests use pre-funded, well-known test accounts from Anvil:

| Role       | Address                                      | Purpose                             |
| ---------- | -------------------------------------------- | ----------------------------------- |
| Sponsor    | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Creates compacts and deposits funds |
| Arbiter    | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Submits claims (would usually be a contract, not an EOA, but this greatly simplifies testing) |
| Allocator  | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Allocator signer (for attestations) |
| Recipient1 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Claim recipient                     |
| Recipient2 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Claim recipient                     |

All accounts start with 10,000 ETH on each forked chain.

Supersim outputs logs for each transaction:

```bash
# In the terminal where Supersim is running
# You'll see logs like:
# [OP] eth_sendRawTransaction
# [Base] eth_getBalance
```

### Inspect transaction results

All test transactions return hashes that can be inspected:

```typescript
const result = await compactClient.sponsor.deposit({ ... })
console.log('Transaction:', result.txHash)
```

### Common Issues

**Error: Connection refused**

- Ensure Supersim is running on the correct ports
- Check `http://localhost:8545` is accessible

**Error: Contract not found**

- Verify the contract address is correct
- Ensure you're on the mainnet fork (port 8545)

**Error: Insufficient funds**

- Supersim accounts should have 10,000 ETH
- Check balance with: `await publicClient.getBalance({ address })`

**Error: Pre-funded account not behaving as expected**

- These are well-known test accounts and sometimes people delegate them to 7702 implementations which might not work as expected. Either undelegagte them in your setup or use fresh keys.

## Environment Variables

| Variable    | Description      | Default                     |
| ----------- | ---------------- | --------------------------- |
| `E2E_TESTS` | Enable e2e tests | `undefined` (tests skipped) |
| `RPC_URL`   | Override RPC URL | `http://localhost:8545`     |

## CI/CD Integration

To run e2e tests in CI:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Supersim
        run: curl -L https://supersim.sh | bash
      - name: Start Supersim
        run: supersim &
      - name: Wait for Supersim
        run: sleep 30
      - name: Run E2E tests
        run: npm run test:e2e
```

## Contributing

When adding new e2e tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Add appropriate timeouts (30s for chain operations)
4. Clean up state between tests when possible
5. Mark incomplete tests with `.skip`

## Resources

- [Supersim Documentation](https://supersim.pages.dev)
- [The Compact Documentation](https://github.com/Uniswap/the-compact)
- [Viem Documentation](https://viem.sh)
