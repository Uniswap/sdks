/**
 * Minimal GraphQL fetch wrapper for the Tribunal Indexer
 *
 * Uses native fetch with no external dependencies to minimize bundle size.
 */

/**
 * Error thrown when a GraphQL query fails
 */
export class GraphQLError extends Error {
  constructor(
    message: string,
    public readonly errors: readonly GraphQLErrorDetail[],
    public readonly query: string,
    public readonly variables?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'GraphQLError'
  }
}

/**
 * A single GraphQL error detail
 */
export interface GraphQLErrorDetail {
  message: string
  locations?: readonly { line: number; column: number }[]
  path?: readonly (string | number)[]
  extensions?: Record<string, unknown>
}

/**
 * GraphQL response structure
 */
interface GraphQLResponse<T> {
  data?: T
  errors?: readonly GraphQLErrorDetail[]
}

/**
 * Execute a GraphQL query against an endpoint
 *
 * @param endpoint - The GraphQL endpoint URL
 * @param query - The GraphQL query string
 * @param variables - Optional variables for the query
 * @returns The data from the response
 * @throws {GraphQLError} If the query returns errors
 * @throws {Error} If the network request fails
 *
 * @example
 * ```typescript
 * const result = await graphqlFetch<{ fill: Fill }>(
 *   'https://tribunal-indexer.marble.live/',
 *   `query GetFill($id: String!) { fill(id: $id) { id claimHash } }`,
 *   { id: '0x123...' }
 * )
 * ```
 */
export async function graphqlFetch<T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`)
  }

  const json = (await response.json()) as GraphQLResponse<T>

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join('; ')
    throw new GraphQLError(`GraphQL errors: ${messages}`, json.errors, query, variables)
  }

  if (json.data === undefined) {
    throw new Error('GraphQL response missing data')
  }

  return json.data
}

/**
 * Transform BigInt strings from GraphQL responses to bigint
 *
 * The indexer returns BigInt values as strings. This helper converts them.
 *
 * @param value - String representation of a BigInt
 * @returns The bigint value
 */
export function toBigInt(value: string): bigint {
  return BigInt(value)
}

/**
 * Transform a bigint to a string for GraphQL variables
 *
 * GraphQL BigInt scalar expects string input
 *
 * @param value - The bigint value
 * @returns String representation for GraphQL
 */
export function fromBigInt(value: bigint): string {
  return value.toString()
}
