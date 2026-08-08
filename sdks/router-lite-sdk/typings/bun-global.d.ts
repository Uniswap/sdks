/**
 * Minimal ambient declaration of the parts of the `Bun` global this package's tests use — today only
 * `src/browser.certification.test.ts`, which bundles the package for browser/edge targets with
 * `Bun.build` and measures the result.
 *
 * Written by hand for the same reason `bun-test.d.ts` beside it is: pulling in `bun-types`/
 * `@types/bun` hoists them into the root `node_modules`, where sibling packages still compiling with
 * TypeScript 4.x auto-include every hoisted `@types/*` and cannot parse modern `bun-types` syntax.
 * The surface here is exactly what is used and no more — the suite runs under `bun test`, which
 * needs no types at all; this exists so `tsconfig.test.json` can typecheck the file.
 */

interface BunBuildLog {
  level: 'error' | 'warning' | 'info' | 'debug' | 'verbose'
  message: string
}

interface BunBuildArtifact {
  text(): Promise<string>
}

interface BunBuildOutput {
  success: boolean
  logs: BunBuildLog[]
  outputs: BunBuildArtifact[]
}

interface BunBuildConfig {
  entrypoints: string[]
  target?: 'browser' | 'bun' | 'node'
  format?: 'esm' | 'cjs' | 'iife'
  minify?: boolean
  /** Extra package.json export conditions (`worker`, `workerd`, `edge-light`, …). */
  conditions?: string[]
}

interface BunFile {
  delete(): Promise<void>
}

declare const Bun: {
  build(config: BunBuildConfig): Promise<BunBuildOutput>
  write(path: string, data: string): Promise<number>
  gzipSync(data: Uint8Array): Uint8Array
  file(path: string): BunFile
}
