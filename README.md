# Waypoint Freight Operations (private prototype)

> Deployment is paused. This repository is a private prototype and must not be presented as any third-party company or connected to its domain until written authorization is obtained.

# Waypoint Freight web app

This folder runs a small Node web app for the Waypoint demo load board, shared dispatch messages, simulated GPS updates, and non-sensitive intake requests. The app stores its demo state in one JSON file so browser sessions connected to the same server see the same data.

## Run locally

Use Node.js 20 or later from this folder:

```powershell
npm start
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Do not open the downloaded `file:///` pages when you need shared data; that mode intentionally uses a browser-only fallback.

Local mode binds only to `127.0.0.1` and leaves preview authentication off. Runtime data is stored in `data/waypoint-store.json`, which is intentionally ignored by Git.

## Password-protected hosted preview

The project is prepared for a password-protected Render preview through [render.yaml](./render.yaml). It uses Render's free Node service and managed HTTPS. The free configuration stores the demo JSON state at `/tmp`, so shared changes can reset whenever the service restarts or redeploys.

To resume a private deployment only after written authorization and a new hosting decision:

1. Put this folder in a **private** Git repository. Do not commit `data/`, `.env`, passwords, or existing request data.
2. Do not create or activate a public hosting service from this repository while deployment is paused. The included blueprint deliberately has automatic deploys turned off.
3. Set the four prompted secrets in Render's environment-variable UI, using long unique values:
   - `ALPHAWAY_PREVIEW_USERNAME`
   - `ALPHAWAY_PREVIEW_PASSWORD`
   - `ALPHAWAY_ADMIN_TOKEN`
   - `ALPHAWAY_NETWORK_INVITE_CODE`
4. Trigger the initial deploy, wait for the health check at `/api/health`, then share the HTTPS URL and the password through separate channels.

The health route is intentionally public but returns only `{ "ok": true }`. Everything else—including pages, APIs, and live-update connections—requires the shared preview password. The `ALPHAWAY_ADMIN_TOKEN` additionally protects `GET /api/intakes`; the current user interface does not expose intake records.

The hosted preview also enables the private-network gate. Carriers must enter the invitation code before the load board APIs and live updates are available. The code is stored only in Render's secret environment-variable UI and is never sent to the browser.

`render.yaml` selects Render's free service and does not require a payment method. The exact service name may need to be changed if it is already taken in your Render account.

## Environment settings

[.env.example](./.env.example) documents the supported variables. Node does not load that file automatically; it is a reference for your local shell or hosting provider.

| Variable | Local default | Hosted preview value |
| --- | --- | --- |
| `ALPHAWAY_HOST` | `127.0.0.1` | `0.0.0.0` |
| `ALPHAWAY_DATA_FILE` | `./data/waypoint-store.json` | `/tmp/waypoint-store.json` |
| `ALPHAWAY_REQUIRE_AUTH` | `false` | `true` |
| `ALPHAWAY_PREVIEW_USERNAME` | blank | secret |
| `ALPHAWAY_PREVIEW_PASSWORD` | blank | secret |
| `ALPHAWAY_ADMIN_TOKEN` | blank | secret used only for intake review |
| `ALPHAWAY_PRIVATE_NETWORK` | `false` | `true` on the hosted preview |
| `ALPHAWAY_NETWORK_INVITE_CODE` | blank | secret shared only with approved carriers |
| `ALPHAWAY_FMCSA_QCMOBILE_KEY` | blank | secret FMCSA QCMobile API key |
| `ALPHAWAY_FMCSA_BASE_URL` | `https://mobile.fmcsa.dot.gov/qc/services` | FMCSA QCMobile service base URL |
| `ALPHAWAY_ACCOUNT_AUTH` | `false` | `true` for hosted account separation |
| `ALPHAWAY_ACCOUNT_SESSION_SECRET` | derived local value | secret session-signing input |
| `ALPHAWAY_ADMIN_EMAIL` | blank | initial administrator email |
| `ALPHAWAY_ADMIN_PASSWORD` | blank | initial administrator password |
| `STRIPE_SECRET_KEY` | blank | secret Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | blank | Stripe endpoint signing secret |
| `STRIPE_PRICE_CARRIER` | blank | Stripe recurring Price ID for Carrier Network |
| `STRIPE_PRICE_SHIPPER` | blank | Stripe recurring Price ID for Shipper Control |
| `STRIPE_PRICE_BROKER` | blank | Stripe recurring Price ID for Broker Desk |

For a local password test in PowerShell, set the values only in the current shell before running `npm start`:

```powershell
$env:ALPHAWAY_REQUIRE_AUTH = 'true'
$env:ALPHAWAY_PREVIEW_USERNAME = 'preview'
$env:ALPHAWAY_PREVIEW_PASSWORD = 'replace-this-with-a-long-unique-password'
$env:ALPHAWAY_ADMIN_TOKEN = 'replace-this-with-a-separate-long-token'
npm start
```

## Preview limits and safety

This is a shared-editing preview, not a production transportation-management system. Everyone who receives both the preview password and private-network invitation code can view demo messages and simulated tracking and can change shared demo state. The free host can sleep when idle, and its local JSON data can reset after a restart or redeploy. It does not provide individual driver, dispatcher, or administrator accounts, audit trails, real GPS, DAT/123Loadboard/Truckstop access, ELD integrations, or production billing controls.

FMCSA lookup is server-side and requires `ALPHAWAY_FMCSA_QCMOBILE_KEY`; the key is never sent to the browser. The current document endpoint stores files on the configured server volume and is limited to 3 MB, but it is not a replacement for encrypted production document storage, malware scanning, retention rules, or role-based authorization. Before a real public launch, replace the JSON store with an authenticated database, add role-based accounts and audit logs, establish retention and incident procedures, and validate FMCSA usage permissions.

When account auth is enabled, users sign in through the Freight Command Center. Administrators and dispatchers can invite users; administrators can approve, suspend, reassign, or reset accounts through the account API. Company and role scope is applied to operations data, and audit events are retained in the JSON store. Set the initial admin variables before first hosted startup.

Stripe checkout is server-side. Add the secret key, webhook signing secret, and recurring Price IDs in Render; never place Stripe secret values in HTML or client JavaScript. Configure a Stripe webhook endpoint at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Useful hosting references: [Render web services](https://render.com/docs/web-services), [persistent disks](https://render.com/docs/disks), [health checks](https://render.com/docs/health-checks), and [Blueprint configuration](https://render.com/docs/blueprint-spec).
