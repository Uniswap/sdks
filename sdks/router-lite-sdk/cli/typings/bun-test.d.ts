/**
 * Minimal ambient declaration of the `bun:test` runtime module (same pattern as
 * `../typings/bun-test.d.ts`, `../integration/typings/bun-test.d.ts`). It exists so `cli/tsconfig.json`
 * can resolve `bun:test` WITHOUT depending on `bun-types`/`@types/bun`: hoisting `bun-types` into the
 * root `node_modules` breaks sibling packages that still compile with TypeScript 4.x. The matcher
 * surface is loose on purpose — the suite runs under `bun test`, which needs no types.
 *
 * The named matchers below are what lets this config run `noUncheckedIndexedAccess` over the CLI's
 * own test files rather than excluding them: an index signature alone resolves every `expect(x).toBe`
 * to `… | undefined` under that flag, which is 154 TS2722s about the shim and nothing about the code.
 * Keep this block identical to `../typings/bun-test.d.ts`'s.
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
  export function beforeAll(fn: TestFn, timeoutMs?: number): void
  export function beforeEach(fn: TestFn, timeoutMs?: number): void
  export function afterAll(fn: TestFn, timeoutMs?: number): void
  export function afterEach(fn: TestFn, timeoutMs?: number): void

  interface Matchers {
    not: Matchers
    resolves: Matchers
    rejects: Matchers
    // Named explicitly (rather than relying solely on the index signature below) so each is a
    // real, always-present method under `noUncheckedIndexedAccess` — that flag adds `| undefined`
    // to every index-signature lookup, and this suite's matcher chains are not optional-chained.
    toBe(expected: unknown): Matchers
    toEqual(expected: unknown): Matchers
    toBeDefined(): Matchers
    toBeUndefined(): Matchers
    toBeNull(): Matchers
    toBeTruthy(): Matchers
    toBeFalsy(): Matchers
    toBeGreaterThan(expected: number | bigint): Matchers
    toBeGreaterThanOrEqual(expected: number | bigint): Matchers
    toBeLessThan(expected: number | bigint): Matchers
    toBeLessThanOrEqual(expected: number | bigint): Matchers
    toBeCloseTo(expected: number, precision?: number): Matchers
    toBeInstanceOf(expected: unknown): Matchers
    toContain(expected: unknown): Matchers
    toContainEqual(expected: unknown): Matchers
    toHaveLength(expected: number): Matchers
    toMatch(expected: string | RegExp): Matchers
    toMatchObject(expected: object): Matchers
    toHaveProperty(key: string, value?: unknown): Matchers
    toThrow(expected?: unknown): Matchers
    // Anything not named above (rarely used matchers) still resolves, but — correctly, per
    // `noUncheckedIndexedAccess` — as possibly `undefined`.
    [matcher: string]: ((...args: unknown[]) => Matchers) | undefined
  }
  export function expect(actual?: unknown, customMessage?: string): Matchers

  export function mock<T extends (...args: never[]) => unknown>(fn?: T): T
  export function spyOn(obj: object, method: string): (...args: never[]) => unknown
}
