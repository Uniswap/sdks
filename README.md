# Uniswap SDK's

A repository for many Uniswap SDK's. All SDK's can be found in `sdk/` and have more information in their individual README's.

## Development Commands

```markdown
# Clone
git clone --recurse-submodules https://github.com/Uniswap/sdks.git
# Install
yarn
# Build
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

## Making Changes & Publishing

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing, with the `workspace:` protocol for internal dependencies.

### 1. Make your code changes on a branch

Internal dependencies (e.g., `v4-sdk` depending on `sdk-core`) use the `workspace:` protocol, so they resolve to the local workspace during development. This means you can change multiple packages in a single PR — no need for sequential publish-wait-bump cycles.

### 2. Add a changeset

After making your changes, run:

```
yarn changeset
```

This interactive CLI will ask you:
- **Which packages should be bumped?** Select the packages you directly changed (e.g., `@uniswap/sdk-core`).
- **What type of bump?** `patch`, `minor`, or `major`.
- **Summary** A short description of the change (this becomes the changelog entry).

This creates a markdown file in `.changeset/` that looks like:

```md
---
"@uniswap/sdk-core": minor
---

Add support for Soneium chain
```

You **only need to list the packages you directly changed**. Changesets automatically bumps dependents (e.g., bumping `sdk-core` will also bump `v2-sdk`, `v3-sdk`, `v4-sdk`, `router-sdk`, `universal-router-sdk`, etc.).

### 3. (Optional) Version packages locally

If you want your version bumps included in the same PR as your code changes, run:

```
yarn release-prep
```

This runs `yarn changeset` followed by `yarn version-packages` in one step — generating the changeset and immediately applying version bumps, changelog updates, and dependent package bumps.

If you skip this step, version bumps will be handled automatically via a separate PR after merge (see below).

### 4. Open your PR

Commit the changeset file (and version bumps, if you ran `yarn release-prep`) alongside your code changes. Reviewers can see exactly what version bumps are planned.

### 5. What happens on merge to `main`

The CI workflow (`changesets/action`) runs automatically and does one of two things:

- **If there are pending changeset files:** It opens (or updates) a **"Version Packages" PR** that bumps versions in every affected `package.json`, updates changelogs, and removes the consumed changeset files.
- **If versions are already bumped (e.g., via `yarn release-prep`):** It publishes all packages with new versions to npm directly — no extra PR needed.

### Example: Adding a new chain

Previously this required 4 sequential PRs with publish-wait-bump cycles. Now it's a single PR:

```
1. Edit sdk-core (add chain) + universal-router-sdk (use chain)
2. Run `yarn changeset` and select both packages
3. Open PR, merge
4. Merge the auto-generated "Version Packages" PR
5. All affected packages publish to npm
```

### Quick reference

| Command | What it does |
|---|---|
| `yarn changeset` | Create a changeset file (run before opening your PR) |
| `yarn version-packages` | Apply pending changesets to bump versions (CI does this) |
| `yarn release-prep` | Run `changeset` + `version-packages` together (one-PR workflow) |
| `yarn g:release` | Publish all bumped packages to npm (CI does this) |
