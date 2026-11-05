# Muzify — Known Issues and Technical Debt

## Purpose

Maintain a record of known bugs, incomplete features, architectural limitations, and technical debt.

Do not assume an issue is still present without verification.

## Issue Template

### Issue ID

Unique identifier.

### Title

Short issue description.

### Status

- Open
- Investigating
- In Progress
- Resolved
- Deferred

### Priority

- Critical
- High
- Medium
- Low

### Description

Explain the problem.

### Affected Files

List relevant files.

### Root Cause

Document the confirmed cause.

If not confirmed, explicitly state that it is still under investigation.

### Proposed Solution

Describe the proposed fix.

### Verification

Explain how the fix should be tested.

---

## Current Investigation Notes

Previously identified areas requiring implementation verification:

1. Actual audio playback versus simulated playback state. — Real `expo-audio` playback is wired for library and artist queues. Standalone player screens (`src/players/`) still simulate progress and are not on the live route tree.
2. Real music library queue versus fallback demo tracks. — Library and artist play use SQLite `file_uri`. Demo `TRACKS` remain a visual fallback only.
3. Playlist listing implementation.
4. Native audio metadata reading and writing.
5. Android permissions and storage compatibility.
6. EAS build queue and account-specific behavior.

These are investigation topics, not automatically confirmed bugs.

Claude must verify their current status before treating them as open issues.