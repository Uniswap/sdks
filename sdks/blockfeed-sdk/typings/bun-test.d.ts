/**
 * Minimal ambient declaration of the `bun:test` runtime module, used ONLY by `tsconfig.typecheck.json`
 * so `tsc` can type-check the test files (the runner itself is Bun, which needs no types). It lives
 * outside `src/` so no build config ever emits it into `dist`, and it is intentionally NOT a dependency
 * on `bun-types`/`@types/bun` (which would dirty the frozen lockfile). The matcher surface is loose on
 * purpose — the point of type-checking tests here is to gate drift in OUR types used at the fixture and
 * assertion argument sites, not to type the assertion library.
 */
declare module 'bun:test' {
  type TestFn = () => void | Promise<void>

  export function describe(label: string, fn: () => void): void
  export function it(label: string, fn?: TestFn): void
  export function test(label: string, fn?: TestFn): void
  export function beforeAll(fn: TestFn): void
  export function beforeEach(fn: TestFn): void
  export function afterAll(fn: TestFn): void
  export function afterEach(fn: TestFn): void

  interface Matchers {
    not: Matchers
    resolves: Matchers
    rejects: Matchers
    [matcher: string]: (...args: unknown[]) => Matchers
  }
  export function expect(actual?: unknown, customMessage?: string): Matchers

  export function mock<T extends (...args: never[]) => unknown>(fn?: T): T
  export function spyOn(obj: object, method: string): (...args: never[]) => unknown
}
