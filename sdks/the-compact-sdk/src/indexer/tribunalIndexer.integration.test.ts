/**
 * Integration tests for the Tribunal Indexer Client
 *
 * These tests run against the live indexer endpoint.
 * They are skipped by default to avoid network dependencies in CI.
 * Run with: INTEGRATION_TEST=1 npm test
 */

import { createTribunalIndexerClient, DEFAULT_TRIBUNAL_INDEXER_ENDPOINT } from '../client/tribunalIndexer'

const RUN_INTEGRATION = process.env.INTEGRATION_TEST === '1'

const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip

describeOrSkip('TribunalIndexer Integration', () => {
  const client = createTribunalIndexerClient()

  describe('endpoint', () => {
    it('should use default endpoint', () => {
      expect(client.getEndpoint()).toBe(DEFAULT_TRIBUNAL_INDEXER_ENDPOINT)
    })
  })

  describe('getMeta', () => {
    it('should fetch indexer metadata', async () => {
      const meta = await client.getMeta()
      expect(meta).toBeDefined()
      expect(meta.status).toBeDefined()
    })
  })

  describe('getAllChainStatistics', () => {
    it('should fetch chain statistics', async () => {
      const stats = await client.getAllChainStatistics({ limit: 10 })
      expect(stats).toBeDefined()
      expect(stats.items).toBeInstanceOf(Array)
      expect(stats.pageInfo).toBeDefined()
      expect(typeof stats.totalCount).toBe('number')

      // If there are any stats, verify the structure
      if (stats.items.length > 0) {
        const firstStat = stats.items[0]
        expect(typeof firstStat.chainId).toBe('bigint')
        expect(typeof firstStat.totalFills).toBe('bigint')
        expect(typeof firstStat.totalCancellations).toBe('bigint')
        expect(typeof firstStat.uniqueFillers).toBe('bigint')
        expect(typeof firstStat.uniqueSponsors).toBe('bigint')
        expect(typeof firstStat.lastUpdated).toBe('bigint')
      }
    })
  })

  describe('getFills', () => {
    it('should fetch paginated fills', async () => {
      const fills = await client.getFills({
        orderBy: 'timestamp',
        orderDirection: 'desc',
        limit: 5,
      })

      expect(fills).toBeDefined()
      expect(fills.items).toBeInstanceOf(Array)
      expect(fills.pageInfo).toBeDefined()
      expect(typeof fills.totalCount).toBe('number')

      // If there are any fills, verify the structure
      if (fills.items.length > 0) {
        const firstFill = fills.items[0]
        expect(typeof firstFill.id).toBe('string')
        expect(typeof firstFill.claimHash).toBe('string')
        expect(typeof firstFill.mandateHash).toBe('string')
        expect(typeof firstFill.chainId).toBe('bigint')
        expect(typeof firstFill.sponsorAddress).toBe('string')
        expect(typeof firstFill.fillerAddress).toBe('string')
        expect(typeof firstFill.blockNumber).toBe('bigint')
        expect(typeof firstFill.timestamp).toBe('bigint')
        expect(typeof firstFill.transactionHash).toBe('string')
        expect(typeof firstFill.logIndex).toBe('number')
      }
    })

    it('should support pagination with cursors', async () => {
      const firstPage = await client.getFills({
        orderBy: 'timestamp',
        orderDirection: 'desc',
        limit: 2,
      })

      if (firstPage.pageInfo.hasNextPage && firstPage.pageInfo.endCursor) {
        const secondPage = await client.getFills({
          orderBy: 'timestamp',
          orderDirection: 'desc',
          limit: 2,
          after: firstPage.pageInfo.endCursor,
        })

        expect(secondPage).toBeDefined()
        expect(secondPage.items).toBeInstanceOf(Array)

        // Second page should have different items
        if (secondPage.items.length > 0 && firstPage.items.length > 0) {
          expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id)
        }
      }
    })
  })

  describe('getMandates', () => {
    it('should fetch paginated mandates', async () => {
      const mandates = await client.getMandates({
        orderBy: 'firstSeenAt',
        orderDirection: 'desc',
        limit: 5,
      })

      expect(mandates).toBeDefined()
      expect(mandates.items).toBeInstanceOf(Array)

      // If there are any mandates, verify the structure
      if (mandates.items.length > 0) {
        const firstMandate = mandates.items[0]
        expect(typeof firstMandate.mandateHash).toBe('string')
        expect(typeof firstMandate.chainId).toBe('bigint')
        expect(typeof firstMandate.sponsorAddress).toBe('string')
        expect(typeof firstMandate.adjusterAddress).toBe('string')
        expect(typeof firstMandate.arbiterAddress).toBe('string')
        expect(typeof firstMandate.firstSeenAt).toBe('bigint')
        expect(typeof firstMandate.blockNumber).toBe('bigint')
        expect(typeof firstMandate.transactionHash).toBe('string')
        expect(typeof firstMandate.totalFills).toBe('bigint')
        expect(typeof firstMandate.totalCancellations).toBe('bigint')
      }
    })
  })

  describe('getAccounts', () => {
    it('should fetch paginated accounts', async () => {
      const accounts = await client.getAccounts({
        orderBy: 'firstSeenAt',
        orderDirection: 'desc',
        limit: 5,
      })

      expect(accounts).toBeDefined()
      expect(accounts.items).toBeInstanceOf(Array)

      // If there are any accounts, verify the structure
      if (accounts.items.length > 0) {
        const firstAccount = accounts.items[0]
        expect(typeof firstAccount.address).toBe('string')
        expect(typeof firstAccount.firstSeenAt).toBe('bigint')
      }
    })
  })

  describe('getCancellations', () => {
    it('should fetch paginated cancellations', async () => {
      const cancellations = await client.getCancellations({
        orderBy: 'timestamp',
        orderDirection: 'desc',
        limit: 5,
      })

      expect(cancellations).toBeDefined()
      expect(cancellations.items).toBeInstanceOf(Array)

      // If there are any cancellations, verify the structure
      if (cancellations.items.length > 0) {
        const firstCancellation = cancellations.items[0]
        expect(typeof firstCancellation.id).toBe('string')
        expect(typeof firstCancellation.claimHash).toBe('string')
        expect(typeof firstCancellation.chainId).toBe('bigint')
        expect(typeof firstCancellation.sponsorAddress).toBe('string')
        expect(typeof firstCancellation.blockNumber).toBe('bigint')
        expect(typeof firstCancellation.timestamp).toBe('bigint')
        expect(typeof firstCancellation.transactionHash).toBe('string')
        expect(typeof firstCancellation.logIndex).toBe('number')
      }
    })
  })

  describe('getDispatches', () => {
    it('should fetch paginated dispatches', async () => {
      const dispatches = await client.getDispatches({
        orderBy: 'timestamp',
        orderDirection: 'desc',
        limit: 5,
      })

      expect(dispatches).toBeDefined()
      expect(dispatches.items).toBeInstanceOf(Array)

      // If there are any dispatches, verify the structure
      if (dispatches.items.length > 0) {
        const firstDispatch = dispatches.items[0]
        expect(typeof firstDispatch.id).toBe('string')
        expect(typeof firstDispatch.claimHash).toBe('string')
        expect(typeof firstDispatch.chainId).toBe('bigint')
        expect(typeof firstDispatch.targetChainId).toBe('bigint')
        expect(typeof firstDispatch.targetAddress).toBe('string')
        expect(typeof firstDispatch.blockNumber).toBe('bigint')
        expect(typeof firstDispatch.timestamp).toBe('bigint')
        expect(typeof firstDispatch.transactionHash).toBe('string')
        expect(typeof firstDispatch.logIndex).toBe('number')
      }
    })
  })
})
