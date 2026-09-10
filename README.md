# Alphaway Logistics (private prototype)

> This is a private prototype. Keep the first GoDaddy deployment protected and use non-sensitive sandbox data.

# Alphaway Logistics web app

This folder runs a small Node web app for the Alphaway Logistics demo load board, shared dispatch messages, simulated GPS updates, and non-sensitive intake requests. The app stores its demo state in one JSON file so browser sessions connected to the same server see the same data.

## Run locally

Use Node.js 20 or later from this folder:

```powershell
npm start
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Do not open the downloaded `file:///` pages when you need shared data; that mode intentionally uses a browser-only fallback.

Local mode binds only to `127.0.0.1` and leaves preview authentication off. Runtime data is stored in `data/alphaway-store.json`, which is intentionally ignored by Git.

## Intended private host: GoDaddy

GoDaddy Node.js Hosting is the intended application host and domain provider. See [the GoDaddy setup guide](./GODADDY-SETUP.md) for the verified sandbox Price IDs, required secrets, private-storage requirement, webhook setup, domain steps, and acceptance checks.

The existing public site remains at `https://alphawaylogistics.com`. The prepared private application origin is `https://app.alphawaylogistics.com`.

The server refuses hosted startup unless preview authentication, the private-network gate, and account authentication are enabled. Health is intentionally unauthenticated. Stripe webhooks bypass browser authentication and require a valid raw-body signature. Checkout requires the configured preview, invitation, and account gates.

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
| `STRIPE_SECRET_KEY` | blank | Sandbox restricted/secret key, stored only in sealed host variables |
| `STRIPE_ACCOUNT_ID` | sandbox account ID | `acct_1UDJTIKqpp58H3DU` |
| `STRIPE_WEBHOOK_SECRET` | blank | signing secret for `POST /api/stripe/webhook` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | blank | reviewed sandbox customer-portal configuration ID |
| `STRIPE_PRICE_CARRIER` | blank | recurring Stripe Price ID for the $599 Carrier plan |
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

Run `npm ci` and `npm test`. Stripe uses the pinned official Node SDK. Checkout checks the selected sandbox account, test mode, exact USD monthly plan amounts, safe same-origin return URLs, and a retry idempotency key. Webhook verification uses the original body and supports rotated signatures. The event audit retains 500 records, suppresses duplicates within that window across restarts, and rolls back memory state on failed persistence. Billing audit records are withheld from non-admin operations responses.

The integration is sandbox-only. Signed webhook events maintain each linked user's subscription status, the workspace can open Stripe's customer portal, and `ALPHAWAY_REQUIRE_SUBSCRIPTION=true` enforces active or trialing status for non-admin operations access. Enable that flag only after the hosted webhook flow passes end-to-end testing.

## Preview limits and safety

This is a private prototype with shared demo operations and simulated tracking. It includes basic role accounts, subscription gating, and audit events, but it does not provide verified production tenant isolation, real GPS, DAT/123Loadboard/Truckstop access, or ELD integrations. Use non-sensitive demo data. Keep one process with private persistent storage; migrate to a transactional database before production billing.

FMCSA lookup is server-side and requires `ALPHAWAY_FMCSA_QCMOBILE_KEY`; the key is never sent to the browser. The current document endpoint stores files on the configured server volume and is limited to 3 MB, but it is not a replacement for encrypted production document storage, malware scanning, retention rules, or role-based authorization. Before a real public launch, replace the JSON store with an authenticated database, add role-based accounts and audit logs, establish retention and incident procedures, and validate FMCSA usage permissions.

When account auth is enabled, users sign in through the Freight Command Center. Administrators and dispatchers can invite users; administrators can approve, suspend, reassign, or reset accounts through the account API. Company and role scope is applied to operations data, and audit events are retained in the JSON store. Set the initial admin variables before first hosted startup.


Hosting references and the current setup steps are in [GODADDY-SETUP.md](./GODADDY-SETUP.md).
