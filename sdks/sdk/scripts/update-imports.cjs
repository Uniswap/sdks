#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'src')

// Mapping from old package names to new directory names
const packageMappings = {
  '@uniswap/sdk-core': 'core',
  '@uniswap/v2-sdk': 'v2',
  '@uniswap/v3-sdk': 'v3',
  '@uniswap/v4-sdk': 'v4',
  '@uniswap/router-sdk': 'router',
  '@uniswap/permit2-sdk': 'permit2',
  '@uniswap/universal-router-sdk': 'universal-router',
  '@uniswap/uniswapx-sdk': 'uniswapx',
  '@uniswap/smart-wallet-sdk': 'smart-wallet',
}

function getRelativePath(fromFile, toDir) {
  const fromDir = path.dirname(fromFile)
  const relativeFromSrc = path.relative(srcDir, fromDir)
  const depth = relativeFromSrc.split(path.sep).length

  // Calculate how many levels up we need to go to reach src/
  const upLevels = '../'.repeat(depth)
  return upLevels + toDir
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false

  for (const [oldPkg, newDir] of Object.entries(packageMappings)) {
    // Match both single and double quotes
    const regex = new RegExp(`from ['"]${oldPkg.replace('/', '\\/')}['"]`, 'g')

    if (regex.test(content)) {
      const relativePath = getRelativePath(filePath, newDir)
      content = content.replace(regex, `from '${relativePath}'`)
      modified = true
    }

    // Also handle import() calls
    const importRegex = new RegExp(`import\\(['"]${oldPkg.replace('/', '\\/')}['"]\\)`, 'g')
    if (importRegex.test(content)) {
      const relativePath = getRelativePath(filePath, newDir)
      content = content.replace(importRegex, `import('${relativePath}')`)
      modified = true
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content)
    console.log(`Updated: ${path.relative(srcDir, filePath)}`)
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      walkDir(filePath)
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      processFile(filePath)
    }
  }
}

console.log('Updating imports in unified SDK...')
walkDir(srcDir)
console.log('Done!')
