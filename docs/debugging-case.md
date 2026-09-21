# Historical case: scheduled run overwrote daily action state

This is a public-repository state-management case, **not an n8n failure or customer incident**.
No traffic, financial impact, or recurrence count is asserted.

## Context
VAREVANT's scheduled repository automation writes daily observation records.
A record also tracked whether a proactive action had already occurred that day.

## Symptom
The historical verification record states that a later scheduled run replaced
the daily state with NO_ACTION and removed the earlier action record.
The public evidence shows a state-loss defect; it does not establish a duplicate action actually happened.

## Evidence
- [Original implementation immediately before the fix](https://github.com/naraya07pedro-spec/varevant.com/blob/ac57ac546d0173fcec8b801e7070ecb7c21fc5b9%5E/geo/engine.py)
- [Code fix ac57ac5](https://github.com/naraya07pedro-spec/varevant.com/commit/ac57ac546d0173fcec8b801e7070ecb7c21fc5b9)
- [Restored daily record 1cec7ab](https://github.com/naraya07pedro-spec/varevant.com/commit/1cec7ab4228e0f3f6d5e95dad57765642262a59f)
- [Merged PR #4](https://github.com/naraya07pedro-spec/varevant.com/pull/4)

## Investigation
Code inspection shows that the previous writer generated a fresh daily JSON object
without loading and merging the existing record. The restoration commit explicitly
records the overwritten fields and corrective action. This account is reconstructed
from those public artifacts, not a claim to possess private incident notes.

## Root cause
Replacing the full daily object discarded action-state fields that were not included
in the fresh observation. UTC-based filenames also differed from the intended Jakarta
operating date; the patch changed date calculation, but the observed contribution of
that timezone issue to this particular event remains unknown.

## Fix
The patch loads the existing daily record, preserves selected action/proposal fields,
and appends a bounded run history. A separate commit restores the missing action state.
The merged change uses Asia/Jakarta for the daily filename.

## Verification
The historical PR is merged and the public diff implements the described merge.
A local, read-only regression check during this portfolio audit verified that
preserve_daily_state retains the prior action marker while incorporating the fresh observation.
This verifies the function behavior, not end-to-end historical uptime.

## Prevention
Preserve authoritative action state separately from fresh observations and test
same-day repeated writes. Consider atomic file replacement and concurrency protection
before treating the file as a distributed scheduler lock; those guarantees are not
established by this historical patch.

## What remains unknown
Exact runtime sequence beyond the public record, frequency, whether any duplicate
business action happened, customer impact, and production-wide recurrence rate.
