import { mock } from 'bun:test';

// Manual mock for viem module
export const mockCreatePublicClient = mock();
export const mockParseEventLogs = mock();
export const mockHttp = mock();

export const createPublicClient = mockCreatePublicClient;
export const parseEventLogs = mockParseEventLogs;
export const http = mockHttp;

// Re-export actual viem types that we need
export type {
  Block,
  TransactionReceipt,
  BlockTag,
  Chain,
  PublicClient,
} from 'viem';
