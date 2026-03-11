import { getAddress } from 'viem'

import {
  TribunalIndexerClient,
  createTribunalIndexerClient,
  DEFAULT_TRIBUNAL_INDEXER_ENDPOINT,
} from './tribunalIndexer'

describe('TribunalIndexerClient', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('constructor', () => {
    it('should use default endpoint when no config provided', () => {
      const client = new TribunalIndexerClient()
      expect(client.getEndpoint()).toBe(DEFAULT_TRIBUNAL_INDEXER_ENDPOINT)
    })

    it('should use custom endpoint when provided', () => {
      const customEndpoint = 'https://custom.example.com/'
      const client = new TribunalIndexerClient({ endpoint: customEndpoint })
      expect(client.getEndpoint()).toBe(customEndpoint)
    })
  })

  describe('createTribunalIndexerClient', () => {
    it('should create a client instance', () => {
      const client = createTribunalIndexerClient()
      expect(client).toBeInstanceOf(TribunalIndexerClient)
    })

    it('should pass config to client', () => {
      const customEndpoint = 'https://custom.example.com/'
      const client = createTribunalIndexerClient({ endpoint: customEndpoint })
      expect(client.getEndpoint()).toBe(customEndpoint)
    })
  })

  describe('getAccount', () => {
    it('should fetch and transform account data', async () => {
      const mockRawAccount = {
        address: '0x1234567890123456789012345678901234567890',
        firstSeenAt: '1704067200',
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { account: mockRawAccount } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getAccount(getAddress('0x1234567890123456789012345678901234567890'))

      expect(result).toEqual({
        address: getAddress('0x1234567890123456789012345678901234567890'),
        firstSeenAt: 1704067200n,
      })
    })

    it('should return null when account not found', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { account: null } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getAccount(getAddress('0x1234567890123456789012345678901234567890'))

      expect(result).toBeNull()
    })
  })

  describe('getMandate', () => {
    it('should fetch and transform mandate data', async () => {
      const mockRawMandate = {
        mandateHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        chainId: '1',
        sponsorAddress: '0x1111111111111111111111111111111111111111',
        adjusterAddress: '0x2222222222222222222222222222222222222222',
        arbiterAddress: '0x3333333333333333333333333333333333333333',
        firstSeenAt: '1704067200',
        blockNumber: '12345678',
        transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        totalFills: '5',
        totalCancellations: '1',
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { mandate: mockRawMandate } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getMandate(
        '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        1n
      )

      expect(result).toEqual({
        mandateHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        chainId: 1n,
        sponsorAddress: getAddress('0x1111111111111111111111111111111111111111'),
        adjusterAddress: getAddress('0x2222222222222222222222222222222222222222'),
        arbiterAddress: getAddress('0x3333333333333333333333333333333333333333'),
        firstSeenAt: 1704067200n,
        blockNumber: 12345678n,
        transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        totalFills: 5n,
        totalCancellations: 1n,
      })
    })
  })

  describe('getFill', () => {
    it('should fetch and transform fill data', async () => {
      const mockRawFill = {
        id: '1-0xabc-0',
        claimHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        mandateHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        chainId: '1',
        sponsorAddress: '0x1111111111111111111111111111111111111111',
        fillerAddress: '0x2222222222222222222222222222222222222222',
        claimant: '0x00',
        targetBlock: '12345678',
        originalMinimumFillAmounts: '["1000000"]',
        originalMaximumClaimAmounts: '["2000000"]',
        fillAmounts: '["1100000"]',
        claimAmounts: '["1900000"]',
        fillPriceImprovements: '["100000"]',
        claimPriceImprovements: '["100000"]',
        fillRecipients: '["0x4444444444444444444444444444444444444444"]',
        claimantLockTag: null,
        claimantRecipient: null,
        blockNumber: '12345680',
        timestamp: '1704067200',
        transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        logIndex: 5,
        arbiterAddress: '0x3333333333333333333333333333333333333333',
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { fill: mockRawFill } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getFill('1-0xabc-0')

      expect(result).toBeDefined()
      expect(result?.id).toBe('1-0xabc-0')
      expect(result?.chainId).toBe(1n)
      expect(result?.blockNumber).toBe(12345680n)
      expect(result?.timestamp).toBe(1704067200n)
      expect(result?.logIndex).toBe(5)
      expect(result?.claimantLockTag).toBeUndefined()
      expect(result?.claimantRecipient).toBeUndefined()
    })
  })

  describe('getFills', () => {
    it('should fetch paginated fills', async () => {
      const mockRawFills = {
        items: [
          {
            id: '1-0xabc-0',
            claimHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
            mandateHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
            chainId: '1',
            sponsorAddress: '0x1111111111111111111111111111111111111111',
            fillerAddress: '0x2222222222222222222222222222222222222222',
            claimant: '0x00',
            targetBlock: '12345678',
            originalMinimumFillAmounts: '["1000000"]',
            originalMaximumClaimAmounts: '["2000000"]',
            fillAmounts: '["1100000"]',
            claimAmounts: '["1900000"]',
            fillPriceImprovements: '["100000"]',
            claimPriceImprovements: '["100000"]',
            fillRecipients: '["0x4444444444444444444444444444444444444444"]',
            claimantLockTag: null,
            claimantRecipient: null,
            blockNumber: '12345680',
            timestamp: '1704067200',
            transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
            logIndex: 5,
            arbiterAddress: '0x3333333333333333333333333333333333333333',
          },
        ],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: 'cursor1',
          endCursor: 'cursor2',
        },
        totalCount: 100,
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { fills: mockRawFills } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getFills({
        where: { chainId: 1n },
        orderBy: 'timestamp',
        orderDirection: 'desc',
        limit: 10,
      })

      expect(result.items).toHaveLength(1)
      expect(result.pageInfo.hasNextPage).toBe(true)
      expect(result.pageInfo.hasPreviousPage).toBe(false)
      expect(result.pageInfo.startCursor).toBe('cursor1')
      expect(result.pageInfo.endCursor).toBe('cursor2')
      expect(result.totalCount).toBe(100)
    })

    it('should handle empty results', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              fills: {
                items: [],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: null,
                  endCursor: null,
                },
                totalCount: 0,
              },
            },
          }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getFills()

      expect(result.items).toHaveLength(0)
      expect(result.totalCount).toBe(0)
    })
  })

  describe('getChainStatistics', () => {
    it('should fetch and transform chain statistics', async () => {
      const mockRawStats = {
        chainId: '1',
        totalFills: '1000',
        totalCancellations: '50',
        uniqueFillers: '25',
        uniqueSponsors: '100',
        lastUpdated: '1704067200',
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { chainStatistics: mockRawStats } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getChainStatistics(1n)

      expect(result).toEqual({
        chainId: 1n,
        totalFills: 1000n,
        totalCancellations: 50n,
        uniqueFillers: 25n,
        uniqueSponsors: 100n,
        lastUpdated: 1704067200n,
      })
    })
  })

  describe('getMeta', () => {
    it('should fetch indexer metadata', async () => {
      const mockStatus = { synced: true, latestBlock: 12345678 }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { _meta: { status: mockStatus } } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getMeta()

      expect(result.status).toEqual(mockStatus)
    })
  })

  describe('getCancellation', () => {
    it('should fetch and transform cancellation data', async () => {
      const mockRawCancellation = {
        id: '1-0xabc-0',
        claimHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        mandateHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        chainId: '1',
        sponsorAddress: '0x1111111111111111111111111111111111111111',
        blockNumber: '12345678',
        timestamp: '1704067200',
        transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        logIndex: 3,
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { cancellation: mockRawCancellation } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getCancellation('1-0xabc-0')

      expect(result).toBeDefined()
      expect(result?.id).toBe('1-0xabc-0')
      expect(result?.chainId).toBe(1n)
      expect(result?.mandateHash).toBe('0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab')
    })
  })

  describe('getDispatch', () => {
    it('should fetch and transform dispatch data', async () => {
      const mockRawDispatch = {
        id: '1-0xabc-0',
        claimHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        chainId: '1',
        targetChainId: '10',
        targetAddress: '0x5555555555555555555555555555555555555555',
        claimant: '0x00',
        blockNumber: '12345678',
        timestamp: '1704067200',
        transactionHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        logIndex: 7,
      }
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { dispatch: mockRawDispatch } }),
      })

      const client = createTribunalIndexerClient()
      const result = await client.getDispatch('1-0xabc-0')

      expect(result).toBeDefined()
      expect(result?.id).toBe('1-0xabc-0')
      expect(result?.chainId).toBe(1n)
      expect(result?.targetChainId).toBe(10n)
    })
  })

  describe('filter transformations', () => {
    it('should transform bigint filter values', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              fills: {
                items: [],
                pageInfo: { hasNextPage: false, hasPreviousPage: false },
                totalCount: 0,
              },
            },
          }),
      })

      const client = createTribunalIndexerClient()
      await client.getFills({
        where: {
          chainId: 1n,
          blockNumber_gt: 12345678n,
        },
      })

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      expect(body.variables.where.chainId).toBe('1')
      expect(body.variables.where.blockNumber_gt).toBe('12345678')
    })
  })
})
