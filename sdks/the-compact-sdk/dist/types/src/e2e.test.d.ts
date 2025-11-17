/**
 * End-to-end integration tests against Supersim forked chains
 *
 * This test suite validates the entire SDK stack against live forked chains:
 * - OP Mainnet fork: http://localhost:8545
 * - Base Mainnet fork: http://localhost:9545
 * - Unichain fork: http://localhost:10545
 *
 * Prerequisites:
 * - Supersim must be running
 * - The Compact contract must be deployed on each chain
 *
 * Run with: npm test -- --testPathPattern=e2e
 */
export {};
