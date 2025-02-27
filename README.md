# Uniswap SDK's

A repository for many Uniswap SDK's. All SDK's can be found in `sdk/` and have more information in their individual README's.

Install yarn:

```sh
npm install -g corepack
corepack enable
yarn set version stable
yarn install
```


## Development Commands

```markdown
# Clone
git clone --recurse-submodules https://github.com/Uniswap/sdks.git
# Install
yarn
# Build
npx turbo run build
OR
yarn g:build
# Typecheck
yarn g:typecheck
# Lint
yarn g:lint
# Test
yarn g:test
# Run a specific package.json command for an individual SDK
yarn sdk @uniswap/{sdk-name} {command}
```

## Publishing SDK's

Publishing of each SDK is done on merge to main using semantic-release and semantic-release-monorepo. PR titles / commits follow angular conventional commits with custom settings that map as follows:

```markdown
- `fix(SDK name):` will trigger a patch version
- `<type>(public):` will trigger a patch version
- `feat(SDK name):` will trigger a minor version
- `feat(breaking):` will trigger a major version for a breaking change
```

Versions will only be generated based on the changelog of the relevant SDK's folder/files.
