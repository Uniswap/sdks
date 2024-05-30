## PR Scope

Please title your PR according to the following types and scopes following [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/):

- `fix(SDK name):` will trigger a patch version
- `chore(<type>):` will not trigger any release and should be used for internal repo changes
- `<type>(public):` will trigger a patch version for non-code changes (e.g. README changes)
- `feat(SDK name):` will trigger a minor version
- `feat(breaking):` will trigger a major version for a breaking change

## Description

_[Summary of the change, motivation, and context]_

## How Has This Been Tested?

_[e.g. Manually, E2E tests, unit tests, Storybook]_

## Are there any breaking changes?

_[e.g. Type definitions, API definitions]_

If there are breaking changes, please ensure you bump the major version Bump the major version (by using the title `feat(breaking): ...`), post a notice in #eng-sdks, and explicitly notify all Uniswap Labs consumers of the SDK.

## (Optional) Feedback Focus

_[Specific parts of this PR you'd like feedback on, or that reviewers should pay closer attention to]_

## (Optional) Follow Ups

_[Things that weren't addressed in this PR, ways you plan to build on this work, or other ways this work could be extended]_
