/**
 * Minimal ambient declaration of the `bun:test` runtime module (same pattern as
 * `../typings/bun-test.d.ts` in the SDK package). It exists so editors can type-check the
 * integration suite WITHOUT depending on `bun-types`/`@types/bun`: hoisting `bun-types` into the
 * root `node_modules` breaks sibling packages that still compile with TypeScript 4.x (their tsc
 * auto-includes every hoisted `@types/*` package and cannot parse modern `bun-types` syntax).
 * The matcher surface is loose on purpose — the suite runs under `bun test`, which needs no types.
 */
declare module 'bun:test' {
  type TestFn = () => void | Promise<void>
  type TestOptions = number | { timeout?: number; retry?: number; repeats?: number }

  interface TestFunction {
    (label: string, fn?: TestFn, options?: TestOptions): void
    skipIf(condition: boolean): TestFunction
    if(condition: boolean): TestFunction
    skip: TestFunction
    only: TestFunction
    todo(label: string, fn?: TestFn): void
  }

  interface DescribeFunction {
    (label: string, fn: () => void): void
    skipIf(condition: boolean): DescribeFunction
    if(condition: boolean): DescribeFunction
    skip: DescribeFunction
    only: DescribeFunction
  }

  export const describe: DescribeFunction
  export const it: TestFunction
  export const test: TestFunction
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
