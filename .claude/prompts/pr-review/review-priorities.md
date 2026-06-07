# Review Priorities

### Phase 1: Critical Issues

Problems that would cause immediate harm:

- Bugs or logic errors
- Security vulnerabilities
- Performance problems impacting users
- Data corruption risks
- Race conditions

### Phase 2: Patterns & Principles

Improvements to maintainability (flag these, but they're rarely blockers):

- Functions doing too many things - can't test pieces independently
- Hidden dependencies - requires complex mocking, creates surprising behaviors
- Missing error handling - silent failures, hard to debug

### Phase 3: Polish

Nice-to-haves. Mention only if the win is obvious:

- Naming improvements
- Test coverage gaps
- Documentation
