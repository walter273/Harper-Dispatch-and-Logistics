# Automatic carrier screening

New carrier intakes receive a server-generated screening report. Staff can run
checks on older intakes or refresh them in Intake Review. Reports include the
check time, source, result, and explanation. The queue shows the overall result;
reports older than 24 hours are labeled for refresh. Every refresh is retained
in review history and export. Original submissions and manual evidence survive.

Implemented: test/placeholder detection, contact and package completeness,
MC/USDOT validation, exact legal-name and dual-identifier matching through FMCSA,
operating/out-of-service flags, and missing/expired staff document references.
Passed means only the named comparison passed. It does not establish that the
applicant represents that company or constitute a complete safety determination.

## Required connection

Set `ALPHAWAY_FMCSA_QCMOBILE_KEY` in the app service's Railway Variables to a
WebKey obtained by the owner through https://mobile.fmcsa.dot.gov/QCDevsite/home.
Do not put the key in source, browser fields, evidence notes, or screenshots.
The existing live service does not have this variable configured as of setup.
Without it, registry checks say Needs review / connection not configured.
Timeouts, ambiguous records, missing flags, malformed responses, and errors never
pass. Calls are limited to two per run, eight seconds, four concurrent runs.
Only identifiers go to FMCSA; documents and applicant contact details do not.

Official API and field definitions:
- https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi
- https://mobile.fmcsa.dot.gov/QCDevsite/docs/apiElements

## Document limitation and next integration

The existing operations upload is not linked to intake records. This release
does not send documents to an OCR provider or claim to inspect their contents.
It flags missing evidence references and recorded expiration dates. Authenticity,
policy limits/coverage, W-9 completeness, and signatures still require staff or
an authorized document/insurer/e-signature integration. Implement secure intake
document linkage and select that integration before enabling those checks.

Final approval remains admin-only and requires the existing assigned reviewer
and evidence checklist. Automation never changes checks, decisions, user access,
billing, invitations, or tracking. Staff may record a manual determination using
the existing evidence workflow. No FMCSA credential or paid service is provisioned
by deploying this code.

## Validation

Run `node --test --test-concurrency=1`. Mocked provider tests cover matches,
mismatches, invalid/test IDs, missing flags, outages, expired evidence, and key
redaction. HTTP tests cover persistence, staff permissions, stale versions, and
unchanged billing/approval. Live provider acceptance requires a configured key
and a known carrier record; mock tests are not live verification.
