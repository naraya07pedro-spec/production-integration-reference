# Evidence register

| Item | Classification | Status |
| --- | --- | --- |
| Source, tests, SQL and GitHub CI run records | VERIFIED when the linked run passes | Inspect repository Actions; local tests are synthetic |
| n8n workflow JSON | VERIFIED as a credential-free, inactive authored demo | Structural checks only; no n8n runtime validation |
| Existing accessible n8n instance/session | UNKNOWN | MANUAL_REQUIRED: access to a suitable non-production instance |
| Workflow canvas / successful execution screenshot | UNKNOWN | WAITING_FOR_EVIDENCE |
| Genuine failed n8n execution screenshot | UNKNOWN | NO_REAL_FAILURE_SCREENSHOT_AVAILABLE |
| Production metrics / client impact | UNKNOWN | WAITING_FOR_EVIDENCE; no historical values supplied |
| Historical daily-state bug | VERIFIED public code/log changes; impact limited to those records | See ../debugging-case.md |

Discovery checked local n8n installation/configuration, port 5678, environment variable names,
available browser sessions and the public repositories. No accessible n8n runtime was found.
This is not proof that no remote/private instance exists.

## Collect future n8n evidence

1. Use a non-production instance; import the inactive workflow and bind credentials privately.
2. Run only the included synthetic fixture against the reference/demo services.
3. Capture the real canvas and real execution details after removing URLs, credential names,
   identifiers, payload data and environment details that should not be public.
4. Record instance version, UTC time, workflow commit and actual result alongside screenshots.
5. Prefer synthetic data at source. Never publish raw confidential workflow exports or execution logs.
6. Use an existing genuine failed run only if safe. Do not break a live workflow to obtain one.
   A separate local reproduction must say **CONTROLLED FAILURE REPRODUCTION — NOT PRODUCTION INCIDENT**.

No screenshots or execution history have been fabricated.
