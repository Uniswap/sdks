// Manual mock for viem module
export const mockCreatePublicClient = jest.fn();
export const mockParseEventLogs = jest.fn();
export const mockHttp = jest.fn();

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
