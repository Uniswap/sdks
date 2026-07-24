// Writes per-directory module-type markers into the build output. The package root has no "type"
// field, so without these Node treats every emitted .js as CommonJS — which breaks native ESM
// consumers of dist/esm (and would break dist/cjs if the root ever gained "type": "module").
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

for (const [dir, type] of [
  ['dist/esm', 'module'],
  ['dist/cjs', 'commonjs'],
]) {
  const target = path.join(root, dir)
  if (!fs.existsSync(target)) {
    console.error(`write-module-markers: missing ${dir} — run the build first`)
    process.exit(1)
  }
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ type }) + '\n')
}
