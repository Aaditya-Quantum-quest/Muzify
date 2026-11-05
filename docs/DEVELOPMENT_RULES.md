# Muzify — Development Rules

## 1. General Philosophy

Make the smallest safe change that solves the requested problem.

Preserve existing working functionality.

## 2. Investigation

- Read relevant documentation first.
- Locate the responsible implementation.
- Inspect direct dependencies.
- Avoid reading unrelated files.
- Avoid repeated full-project scans.
- Expand investigation only when necessary.

## 3. Implementation

- Follow existing naming conventions.
- Reuse existing components.
- Reuse existing services.
- Avoid duplicate logic.
- Keep components focused.
- Separate UI from business logic.
- Avoid unnecessary dependencies.

## 4. React Native

- Clean up effects and subscriptions.
- Avoid unnecessary state updates.
- Avoid unnecessary re-renders.
- Keep shared state consistent.
- Handle loading, empty, and error states.
- Respect Android-specific behavior.

## 5. Native Android

- Inspect Kotlin implementation before modification.
- Preserve native module contracts.
- Handle permissions correctly.
- Handle exceptions.
- Avoid blocking the UI thread.
- Verify native build requirements.

## 6. Database

- Preserve existing user data.
- Use safe migrations.
- Avoid destructive resets.
- Preserve relationships.
- Handle failures.

## 7. Performance

- Avoid unnecessary filesystem scans.
- Avoid repeated metadata extraction.
- Avoid expensive operations on the main thread.
- Avoid unnecessary component re-renders.
- Avoid duplicate listeners and timers.
- Use pagination or batching when appropriate.

## 8. Testing

- Run relevant checks.
- Test affected functionality.
- Verify Android-specific behavior.
- Do not claim unexecuted tests passed.
- Report remaining uncertainties.

## 9. Git Safety

- Do not discard user changes.
- Do not run destructive Git commands without explicit authorization.
- Do not reset or overwrite unrelated work.
- Inspect Git status before risky modifications.
- Keep changes focused.

## 10. Documentation

Update only the documentation affected by a significant change.

Do not create unnecessary documentation duplication.

## 11. Communication

Explain important decisions in simple, understandable language.

Clearly distinguish:

- Implemented.
- Partially implemented.
- Not implemented.
- Tested.
- Not tested.
- Verified.
- Assumed or unresolved.

Never present assumptions as confirmed facts.