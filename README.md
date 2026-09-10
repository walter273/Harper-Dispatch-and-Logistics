# Alphaway Logistics (private prototype)

> The current Railway app has account protection and persistent storage. Customer billing still requires a server-side Stripe key, portal setup, and end-to-end acceptance testing.

# Alphaway Logistics web app

This folder runs a small Node web app for the Alphaway Logistics demo load board, shared dispatch messages, simulated GPS updates, and non-sensitive intake requests. The app stores its demo state in one JSON file so browser sessions connected to the same server see the same data.

## Run locally

Use Node.js 20 or later from this folder:

```powershell
npm start
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Do not open the downloaded `file:///` pages when you need shared data; that mode intentionally uses a browser-only fallback.

Local mode binds only to `127.0.0.1` and leaves preview authentication off. Runtime data is stored in `data/alphaway-store.json`, which is intentionally ignored by Git.

## Current host: Railway

The deployed application is https://alphaway-tms-staging-app-production.up.railway.app, from `walter273/Alphaway-Logistics` branch `main`. The `alphaway-tms-staging-app` service mounts its 500 MB volume at `/app/data`; use one replica. See [operations readiness](./OPERATIONS-READINESS.md) for persistence, migration, company boundaries and launch limitations. `GODADDY-SETUP.md` is a historical alternative-host guide, not the current deployment configuration.

Account authentication protects private operations. Public pages and the public load catalog remain accessible. Stripe webhooks require a valid signature over the original request body.

## Environment settings

[.env.example](./.env.example) documents the supported variables. Node does not load that file automatically; it is a reference for your local shell or hosting provider.

| Variable | Local default | Hosted preview value |
| --- | --- | --- |
| `ALPHAWAY_HOST` | `127.0.0.1` | `0.0.0.0` |
| `ALPHAWAY_DATA_FILE` | `./data/alphaway-store.json` | `/data/alphaway-store.json` |
| `ALPHAWAY_REQUIRE_AUTH` | `false` | `true` |
| `ALPHAWAY_PREVIEW_USERNAME` | blank | secret |
| `ALPHAWAY_PREVIEW_PASSWORD` | blank | secret |
| `ALPHAWAY_ADMIN_TOKEN` | blank | secret used only for intake review |
| `ALPHAWAY_PRIVATE_NETWORK` | `false` | `true` on the hosted preview |
| `ALPHAWAY_NETWORK_INVITE_CODE` | blank | secret shared only with approved carriers |
| `ALPHAWAY_FMCSA_QCMOBILE_KEY` | blank | secret FMCSA QCMobile API key |
| `ALPHAWAY_FMCSA_BASE_URL` | `https://mobile.fmcsa.dot.gov/qc/services` | FMCSA QCMobile service base URL |
| `ALPHAWAY_ACCOUNT_AUTH` | `false` | `true` for hosted account separation |
| `ALPHAWAY_REQUIRE_SUBSCRIPTION` | `false` | `false` during sandbox testing; `true` after webhook acceptance testing |
| `ALPHAWAY_ACCOUNT_SESSION_SECRET` | derived local value | secret session-signing input |
| `ALPHAWAY_ADMIN_EMAIL` | blank | initial administrator email |
| `ALPHAWAY_ADMIN_PASSWORD` | blank | initial administrator password |
| `STRIPE_SECRET_KEY` | blank | Server-only key matching STRIPE_MODE, stored in host variables |
| `STRIPE_MODE` | `test` | `live` only with reviewed live resources |
| `STRIPE_ACCOUNT_ID` | blank | Stripe account matching the configured mode |
| `STRIPE_WEBHOOK_SECRET` | blank | signing secret for `POST /api/stripe/webhook` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | blank | reviewed customer-portal configuration ID matching the configured mode |
| `STRIPE_PRICE_CARRIER` | blank | monthly USD 500 Price ID per truck |
| `STRIPE_PRICE_CARRIER_ONBOARDING` | blank | one-time USD 150 Price ID per fleet |
| `STRIPE_PRICE_SHIPPER` | blank | recurring Stripe Price ID for the $799 Shipper plan |
| `STRIPE_PRICE_BROKER` | blank | recurring Stripe Price ID for the $299 Broker plan |
| `STRIPE_PUBLIC_BASE_URL` | `http://127.0.0.1:4173` | approved HTTPS app origin used for Checkout redirects |

Stripe Checkout is server-side only. Configure all Stripe values in the hosting provider's secret environment UI; never place secret keys in HTML, browser JavaScript, Git, or GoDaddy DNS settings. Use the same Stripe account and mode for the secret key, Price IDs, and webhook endpoint.

For a local password test in PowerShell, set the values only in the current shell before running `npm start`:

```powershell
$env:ALPHAWAY_REQUIRE_AUTH = 'true'
$env:ALPHAWAY_PREVIEW_USERNAME = 'preview'
$env:ALPHAWAY_PREVIEW_PASSWORD = 'replace-this-with-a-long-unique-password'
$env:ALPHAWAY_ADMIN_TOKEN = 'replace-this-with-a-separate-long-token'
npm start
```

## Stripe review and tests

The review checkout enables the staged Stripe credential scanner through `git config core.hooksPath .githooks`. Run that command in each new clone to enable the same pre-commit check. It prints filenames only, never matched credentials, and is an additional safeguard rather than a complete secret audit.

Run `npm ci` and `npm test`. Stripe uses the pinned official Node SDK. Checkout checks the selected account, configured payment mode, exact USD monthly plan amounts, safe same-origin return URLs, and a retry idempotency key. Webhook verification uses the original body and supports rotated signatures. The event audit retains 500 records, suppresses duplicates within that window across restarts, and rolls back memory state on failed persistence. Billing audit records are withheld from non-admin operations responses.

The integration is sandbox-only. Signed webhook events maintain each linked user's subscription status, the workspace can open Stripe's customer portal, and `ALPHAWAY_REQUIRE_SUBSCRIPTION=true` enforces active or trialing status for non-admin operations access. Enable that flag only after the hosted webhook flow passes end-to-end testing.

## Preview limits and safety

This is a private prototype with shared demo operations and simulated tracking. It includes basic role accounts, subscription gating, and audit events, but it does not provide verified production tenant isolation, real GPS, DAT/123Loadboard/Truckstop access, or ELD integrations. Use non-sensitive demo data. Keep one process with private persistent storage; migrate to a transactional database before production billing.

FMCSA lookup is server-side and requires `ALPHAWAY_FMCSA_QCMOBILE_KEY`; the key is never sent to the browser. The current document endpoint stores files on the configured server volume and is limited to 3 MB, but it is not a replacement for encrypted production document storage, malware scanning, retention rules, or role-based authorization. Before a real public launch, replace the JSON store with an authenticated database, add role-based accounts and audit logs, establish retention and incident procedures, and validate FMCSA usage permissions.

When account auth is enabled, users sign in through the Freight Command Center. Administrators and dispatchers can invite users; administrators can approve, suspend, reassign, or reset accounts through the account API. Company and role scope is applied to operations data, and audit events are retained in the JSON store. Set the initial admin variables before first hosted startup.


Hosting references and the current setup steps are in [GODADDY-SETUP.md](./GODADDY-SETUP.md).
