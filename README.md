# Harper Load Board 
Powered by Harper Dispatch and Logistics (private prototype)


## Run locally

Use Node.js 20 or later from this folder:

```powershell
npm start
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Do not open the downloaded `file:///` pages when you need shared data; that mode intentionally uses a browser-only fallback.

Local mode binds only to `127.0.0.1` and leaves preview authentication off. Runtime data is stored in `data/alphaway-store.json`, which is intentionally ignored by Git.

## Current host: Railway

The deployed application is https://alphaway-tms-staging-app-production.up.railway.app, from `walter273/Harper-Dispatch-and-Logistics` branch `main` (renamed from `Alphaway-Logistics`; GitHub redirects the old URL). The `alphaway-tms-staging-app` service mounts its 500 MB volume at `/app/data`; use one replica. See [operations readiness](./OPERATIONS-READINESS.md) for persistence, migration, company boundaries and launch limitations. `GODADDY-SETUP.md` is a historical alternative-host guide, not the current deployment configuration.

Account authentication protects private operations. Public pages and the public load catalog remain accessible. Stripe webhooks require a valid signature over the original request body.

## Environment settings

[.env.example](./.env.example) documents the supported variables. Node does not load that file automatically; it is a reference for your local shell or hosting provider.




For a local password test in PowerShell, set the values only in the current shell before running `npm start`:

```powershell
$env:ALPHAWAY_REQUIRE_AUTH = 'true'
$env:ALPHAWAY_PREVIEW_USERNAME = 'preview'
$env:ALPHAWAY_PREVIEW_PASSWORD = 'replace-this-with-a-long-unique-password'
$env:ALPHAWAY_ADMIN_TOKEN = 'replace-this-with-a-separate-long-token'
npm start
```


Run `npm ci` and `npm test`. Stripe uses the pinned official Node SDK. Checkout checks the selected account, configured payment mode, exact USD amounts and weekly or monthly intervals, safe same-origin return URLs, and a retry idempotency key. Webhook verification uses the original body and supports rotated signatures. The event audit retains 500 records, suppresses duplicates within that window across restarts, and rolls back memory state on failed persistence. Billing audit records are withheld from non-admin operations responses.

The integration is sandbox-only. Signed webhook events maintain each linked user's subscription status, the workspace can open Stripe's customer portal, and `ALPHAWAY_REQUIRE_SUBSCRIPTION=true` enforces active or trialing status for non-admin operations access. Enable that flag only after the hosted webhook flow passes end-to-end testing.

## Preview limits and safety

This is a private prototype with shared demo operations and simulated tracking. It includes basic role accounts, subscription gating, and audit events, but it does not provide verified production tenant isolation, real GPS, DAT/123Loadboard/Truckstop access, or ELD integrations. Use non-sensitive demo data. Keep one process with private persistent storage; migrate to a transactional database before production billing.

FMCSA lookup is server-side and requires `ALPHAWAY_FMCSA_QCMOBILE_KEY`; the key is never sent to the browser. The current document endpoint stores files on the configured server volume and is limited to 3 MB, but it is not a replacement for encrypted production document storage, malware scanning, retention rules, or role-based authorization. Before a real public launch, replace the JSON store with an authenticated database, add role-based accounts and audit logs, establish retention and incident procedures, and validate FMCSA usage permissions.

When account auth is enabled, users sign in through the Freight Command Center. Administrators and dispatchers can invite users; administrators can approve, suspend, reassign, or reset accounts through the account API. Company and role scope is applied to operations data, and audit events are retained in the JSON store. Set the initial admin variables before first hosted startup.


Hosting references and the current setup steps are in [GODADDY-SETUP.md](./GODADDY-SETUP.md).

## Owner-operator dispatch packages
## Intake review queue

Admins and dispatchers can open **Intake review** in the navigation. The queue retains original submissions, assigned reviewers, supporting evidence notes, and a complete review history. Only admins can approve, reject, suspend, or reopen a review. Approval requires completed supporting checks and records the decision maker, time, reason, and evidence snapshot. It does not create accounts, activate service, or charge customers. See [INTAKE-REVIEW.md](INTAKE-REVIEW.md) for the workflow, retention and backup limitations, and API details.

## Invite another administrator

Sign in as an admin, open **Admin → Invite a team member**, enter the person's email, and choose **Admin**. The app selects your company for staff invitations. Click **Create invitation**, then **Copy invitation link** and share it directly with that person. The app does not automatically send invitation emails.

The recipient opens the link, enters their name, creates and confirms a password of at least 10 characters, and clicks **Create my account**. They are signed in and sent to Admin. Later they use their own email and password on `/workspace.html`.

