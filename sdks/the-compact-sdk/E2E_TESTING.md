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

The e2e tests use pre-funded accounts from Supersim:

| Role       | Address                                      | Purpose                             |
| ---------- | -------------------------------------------- | ----------------------------------- |
| Sponsor    | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Creates compacts and deposits funds |
| Arbiter    | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Submits claims                      |
| Allocator  | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Allocator role                      |
| Recipient1 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Claim recipient                     |
| Recipient2 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Claim recipient                     |

All accounts start with 10,000 ETH on each forked chain.

## Test Coverage

### ✅ Implemented Tests

1. **Setup and Contract Discovery** (4 tests)

   - Connect to Supersim mainnet fork
   - Verify funded test accounts
   - Verify The Compact contract exists
   - Query domain separator

2. **Basic Deposit and Withdrawal Flow** (3 tests)

   - Deposit native ETH with lock tag
   - Query balance after deposit
   - Withdraw funds

3. **Compact Creation and Signing** (2 tests)

   - Create and sign a single compact
   - Create and sign a batch compact
   - Verify EIP-712 signatures

4. **Full Compact Lifecycle** (2 tests)

   - Complete sponsor flow: deposit → allocate → compact
   - Query lock details

5. **Claim Builder Tests** (2 tests)

   - Build single claims with transfers
   - Build batch claims with multiple portions

6. **Allocator Operations** (2 tests)

   - Extract allocator address from lock details
   - Decode allocator ID from lock tag

7. **Lock Tag and Lock ID Encoding** (2 tests)

   - Encode/decode lock tags
   - Compute lock IDs

8. **Multichain Operations** (2 tests)

   - Create multichain compacts with multichain scope
   - Create multichain claims with additional chain hashes

9. **Error Handling** (3 tests)
   - Handle expired compacts
   - Handle insufficient balance errors
   - Validate compact builder inputs

**Total: 22 functional e2e tests**

### 🚧 Future Enhancements

1. **Claim Submission to Chain** (requires allocator setup and additional coordination)

   - Submit single claims to contract
   - Submit batch claims to contract
   - Verify fund distribution on-chain

2. **Cross-Chain Coordination** (requires multi-chain synchronization)
   - Coordinate multichain claims across OP, Base, and Unichain
   - Verify synchronized claim processing

## Test Architecture

```typescript
// Test structure
describeE2E('The Compact SDK - End-to-End Tests', () => {
  beforeAll(async () => {
    // Set up accounts and clients
  })

  describe('Setup and Contract Discovery', () => {
    // Verify environment
  })

  describe('Basic Deposit and Withdrawal Flow', () => {
    // Test deposit/withdraw operations
  })

  describe('Compact Creation and Signing', () => {
    // Test compact builders
  })

  describe('Claim Submission', () => {
    // Test claim submission (TODO)
  })
})
```

## Debugging

### View Supersim logs

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
        run: sleep 5
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
