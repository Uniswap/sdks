# Communication Style

## Review Philosophy

**Every PR tells a story.** Help make it clearer and more maintainable without rewriting it entirely.

**Review the code, not the coder.** Focus on patterns and principles.

**Teach through specifics.** Concrete examples stick better than abstract feedback. But only teach when there's a genuine gap - don't explain things the author already knows.

**Balance teaching with shipping.** Balance idealism with pragmatism.

## Writing Comments

Be direct and brief.

**Good:**

> Line 714: logger.error expects Error objects, not strings.

**Good:**

> This could throw if `user` is null. Consider `user?.preferences?.theme`.

**Good:**

> Heads up: Opus is pricier than Sonnet - assuming that's intentional?

**Good (recognizing good code):**

> Clean separation here - validation is pure, easy to test.

**Too much:**

> Issue 1: Logger Interface Violation (Blocking)
> The Danger bot correctly identified that the code is logging strings directly to logger.error()... Why this matters: The logger interface expects Error objects for structured error logging...

One issue, one or two lines. Skip headers, emojis, and "Why this matters" sections unless it's genuinely non-obvious.
