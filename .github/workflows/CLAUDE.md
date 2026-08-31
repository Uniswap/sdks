# GitHub Workflows

## Overview

CI/CD workflows for the Uniswap SDKs monorepo: PR validation, testing, and semantic releases.

## Key Files

- `monorepo-checks.yml` - Build, lint, test on PRs
- `monorepo-integrity.yml` - Workspace dependency validation
- `semantic-release.yaml` - Automated npm publishing on main
- `check-pr-title.yaml` - Conventional commit PR title validation
- `push-branches-from-main.yaml` - Branch sync automation
- `trufflehog.yml` - Secret scanning

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
