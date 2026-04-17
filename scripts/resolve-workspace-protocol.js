#!/usr/bin/env node
/**
 * Resolves workspace:* references in package.json files before publishing.
 *
 * changeset publish calls npm publish internally, which does not understand
 * the workspace:* protocol. This script replaces workspace:* with the actual
 * version of the referenced workspace package so that npm publish ships
 * correct dependency versions to the registry.
 *
 * Usage: node scripts/resolve-workspace-protocol.js
 */
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

// Build a map of workspace package names to their current versions
const workspaceVersions = new Map()
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const workspacePatterns = rootPkg.workspaces || []

for (const pattern of workspacePatterns) {
  const dir = path.join(rootDir, pattern.replace('/*', ''))
  if (!fs.existsSync(dir)) continue

  const entries = pattern.includes('/*')
    ? fs.readdirSync(dir).map((e) => path.join(dir, e))
    : [dir]

  for (const entry of entries) {
    const pkgPath = path.join(entry, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (pkg.name && pkg.version) {
      workspaceVersions.set(pkg.name, pkg.version)
    }
  }
}

// Resolve workspace:* in all workspace package.json files
let resolved = 0
for (const pattern of workspacePatterns) {
  const dir = path.join(rootDir, pattern.replace('/*', ''))
  if (!fs.existsSync(dir)) continue

  const entries = pattern.includes('/*')
    ? fs.readdirSync(dir).map((e) => path.join(dir, e))
    : [dir]

  for (const entry of entries) {
    const pkgPath = path.join(entry, 'package.json')
    if (!fs.existsSync(pkgPath)) continue

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    let changed = false

    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pkg[depField]
      if (!deps) continue
      for (const [dep, range] of Object.entries(deps)) {
        if (typeof range === 'string' && range.startsWith('workspace:')) {
          const wsVersion = workspaceVersions.get(dep)
          if (wsVersion) {
            if (range === 'workspace:*' || range === 'workspace:^') {
              deps[dep] = `^${wsVersion}`
            } else if (range === 'workspace:~') {
              deps[dep] = `~${wsVersion}`
            } else {
              deps[dep] = range.replace('workspace:', '')
            }
            changed = true
            resolved++
          } else {
            console.warn(`Warning: workspace dependency ${dep} not found in workspace`)
          }
        }
      }
    }

    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      console.log(`Resolved workspace references in ${pkg.name}`)
    }
  }
}

console.log(`Done: resolved ${resolved} workspace:* references`)
