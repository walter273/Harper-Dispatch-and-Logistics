# Intake review

Open `/intake-review.html` from the staff navigation or the Admin page. All queue, detail, history, and export APIs require an active admin or dispatcher account, including local configurations without preview Basic authentication. Customer roles cannot read or change these records.

1. Find a request by company, contact, email, MC/DOT number, or record ID. Filter by status, category, or assigned reviewer. All matching records are available through pagination.
2. Assign an active staff reviewer. Set the request to **In review** or **Needs information** with a reason.
3. Review supporting checks. Record the source, secure document reference, and what was verified. **Received** does not count as verified. **Not applicable** requires an explanation. Expiration dates are optional; expired evidence prevents a new approval.
4. An admin records **Approve intake** or **Reject intake** and a reason. Approval requires an active assignee and all required checks verified or marked not applicable with evidence.
5. Staff can append notes at any time. Admins can suspend an approved review or reopen a closed review with a reason. Reopening allows checklist changes; previous decision snapshots remain in the history.

The default categories cover carrier onboarding, broker intake, account access, and general inquiries. Staff may reclassify a request (including as a shipper). Reclassification starts a fresh checklist and retains the prior checks in history.

## What is recorded

- Original submission fields, submission ID, and received time.
- Current category, review status, assigned reviewer, and checklist evidence.
- Each change's actor ID, name, role, timestamp, revision, and before/after values.
- Each approval or rejection's reason and snapshot of the reviewer and supporting checks.
- Complete history, including decisions preceding suspension or reopening.

**Download record** exports the original submission, current review, and all history to JSON. Export is staff-only. The application has no intake record or review-event delete endpoint.

Carrier requests also retain their **ELD/GPS provider**, other-provider name, optional pilot truck number, and optional one-truck pilot contact request. Provider and pilot requests appear on queue cards; search accepts provider names and truck numbers. A pilot request does not authorize tracking or activate an integration. Record confirmed authorization references in review notes and follow [GPS-PILOT.md](GPS-PILOT.md) before connecting a carrier's provider.

New submissions and history have no rolling count limit. Startup migrates existing saved submissions into the queue without rewriting their fields; the migration event is explicitly labeled and is not represented as a past approval. Records discarded by an older release cannot be recovered by this migration.

The queue uses the configured `ALPHAWAY_DATA_FILE` and its atomic persistence/rollback mechanism. On Railway this must remain on the persistent volume with a single app process. Same-volume backups help with some write failures, but are not independent disaster recovery. Indefinite retention still requires volume capacity management and an independently stored, regularly tested backup. The JSON store is not a tamper-proof ledger or a multi-process database.

## Boundaries

Approval is an internal review decision, not an electronic signature, an FMCSA certification, a payment, an account invitation, or service activation. Checks are performed and recorded by staff. This release records document references and notes; it does not upload or validate source documents, send messages, or connect additional providers. Sensitive documents should remain in an approved secure repository.

Account access and billing remain separate. Intake suspension records the review state; it does not suspend an existing account or cancel an existing subscription. Recheck expiring documents through the staff process; no background expiry automation is installed.

## API and concurrency

- `GET /api/intakes`: paginated queue (`q`, `status`, `category`, `assignee`, `page`, `pageSize`; max 50 per page).
- `GET /api/intakes/meta`: category/check definitions and active staff choices.
- `GET /api/intakes/:id`: original record and current review.
- `GET /api/intakes/:id/history?page=1`: newest-first history, 25 events per page.
- `GET /api/intakes/:id/export`: complete record and history.
- `POST /api/intakes/:id/review`: staff mutation with `action`, expected `version`, and unique `requestId`.

Actions: `assign`, `classify`, `status`, `check`, `note`, `approve`, `reject`, `suspend`, `reopen`. The server supplies actor identity and timestamps. A stale version returns 409; retrying an identical request ID and payload by the same actor returns the saved result without duplicating its event. A failed disk write returns 503 and rolls back memory, so retry remains possible. All mutations require same-origin JSON.

Validation: `npm run build`, `npm test`; the intake tests cover authorization, evidence requirements, expiry, immutable decision snapshots, concurrency, replay, retention, restart, and failed-write recovery.
