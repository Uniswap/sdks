import { graphqlFetch, GraphQLError, toBigInt, fromBigInt } from './fetch'

describe('graphqlFetch', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('should successfully fetch data', async () => {
    const mockData = { user: { id: '1', name: 'Test' } }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockData }),
    })

    const result = await graphqlFetch<typeof mockData>(
      'https://api.example.com/graphql',
      'query { user { id name } }'
    )

    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: 'query { user { id name } }',
        variables: undefined,
      }),
    })
  })

  it('should pass variables to the query', async () => {
    const mockData = { user: { id: '1' } }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockData }),
    })

    await graphqlFetch<typeof mockData>(
      'https://api.example.com/graphql',
      'query GetUser($id: ID!) { user(id: $id) { id } }',
      { id: '1' }
    )

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: { id: '1' },
      }),
    })
  })

  it('should throw on network error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(graphqlFetch('https://api.example.com/graphql', 'query { test }')).rejects.toThrow(
      'GraphQL request failed: 500 Internal Server Error'
    )
  })

  it('should throw GraphQLError on GraphQL errors', async () => {
    const errors = [{ message: 'Field not found' }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ errors }),
    })

    try {
      await graphqlFetch('https://api.example.com/graphql', 'query { invalid }')
      fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError)
      expect((error as GraphQLError).message).toBe('GraphQL errors: Field not found')
      expect((error as GraphQLError).errors).toEqual(errors)
      expect((error as GraphQLError).query).toBe('query { invalid }')
    }
  })

  it('should throw on missing data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    await expect(graphqlFetch('https://api.example.com/graphql', 'query { test }')).rejects.toThrow(
      'GraphQL response missing data'
    )
  })
})

describe('toBigInt', () => {
  it('should convert string to bigint', () => {
    expect(toBigInt('12345678901234567890')).toBe(12345678901234567890n)
    expect(toBigInt('0')).toBe(0n)
    expect(toBigInt('1')).toBe(1n)
  })
})

describe('fromBigInt', () => {
  it('should convert bigint to string', () => {
    expect(fromBigInt(12345678901234567890n)).toBe('12345678901234567890')
    expect(fromBigInt(0n)).toBe('0')
    expect(fromBigInt(1n)).toBe('1')
  })
})
