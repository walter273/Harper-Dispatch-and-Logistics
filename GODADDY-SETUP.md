> Historical alternative-host guide. The active app runs on Railway; see README.md and OPERATIONS-READINESS.md. This document is kept for reference only. It describes a host the project does not use. The payment variables were rewritten for Square when the Stripe path was removed; treat the rest as a template, not a current procedure.

# GoDaddy setup for Harper Dispatch and Logistics (historical)

This repository can run on GoDaddy Node.js Hosting. Nothing below reflects the current production deployment.

## 1. Import the application

In GoDaddy Node.js Hosting, import the GitHub repository or upload the packaged ZIP. The application meets GoDaddy's Node requirements:

- `package.json` has `name`, `version`, and `main` fields.
- `npm run build` performs JavaScript syntax checks.
- `npm start` starts the Node HTTP server.
- The server listens on the `PORT` supplied by the host.
- Runtime packages are under `dependencies`; `node_modules` is excluded from the ZIP.

Use Node.js 20 or newer. Set `NODE_ENV=production` and `HARPER_HOST=0.0.0.0`.

## 2. Add hosted settings and secrets

Add these values in GoDaddy's environment or Secrets settings. Generate every password, invitation code, session secret, and token independently. Do not paste their values into source files, HTML, DNS records, Git, support messages, or screenshots.

| Name | Hosted value |
| --- | --- |
| `HARPER_ACCOUNT_AUTH` | `true` |
| `HARPER_ACCOUNT_SESSION_SECRET` | separate random secret (required; startup fails on the default value when `NODE_ENV=production`) |
| `HARPER_ADMIN_EMAIL` | initial administrator email |
| `HARPER_ADMIN_PASSWORD` | separate long unique secret |
| `HARPER_REQUIRE_SUBSCRIPTION` | `false` during sandbox acceptance testing; change to `true` only after successful webhook testing |
| `HARPER_PUBLIC_ORIGIN` | exact public origin, e.g. `https://www.harperloadboard.com` — Square redirect URLs derive from this and reject any path or non-https scheme |
| `HARPER_PRIVATE_NETWORK` | `true` to require an invitation code; requires `HARPER_NETWORK_INVITE_CODE` |
| `HARPER_NETWORK_INVITE_CODE` | separate long unique secret |
| `SQUARE_ENVIRONMENT` | `sandbox` until live acceptance passes; `production` afterwards |
| `SQUARE_SANDBOX_ACCESS_TOKEN` | sandbox access token |
| `SQUARE_SANDBOX_LOCATION_ID` | sandbox location ID |
| `SQUARE_ACCESS_TOKEN` | production access token (leave empty until approved) |
| `SQUARE_LOCATION_ID` | production location ID (leave empty until approved) |
| `SQUARE_LIVE_PAYMENTS_ENABLED` | `false` until the sandbox acceptance test and tax review are complete |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | signature key from the configured webhook, if you create it manually |

The whole-site preview gate (`HARPER_REQUIRE_AUTH`, `HARPER_PREVIEW_USERNAME`, `HARPER_PREVIEW_PASSWORD`, `HARPER_ADMIN_TOKEN`) is a legacy mechanism for private demos. Do not enable it on the public Harper domain without first reviewing the public/private route split — it would put a password prompt in front of the marketing site.

Square is the only payment provider. There is no provider switch and no Stripe fallback in the server.

## 3. Configure private data storage

The current application uses a JSON store and uploaded-document directory under `HARPER_DATA_FILE`. GoDaddy documents `/public/assets/` as persistent between Node.js deployments, but that path is web-facing and must not contain account records, tokens, billing identifiers, audit logs, or customer documents.

Use a private persistent database or a private persistent filesystem path supplied by your GoDaddy product. If the Node.js Hosting plan offers no private persistent storage, use the deployment only for sandbox demonstration and migrate the store to a database before real customer data or billing. Do not set `HARPER_DATA_FILE` inside `/public`.

## 4. Publish a protected preview

Preview the imported app before assigning the final domain. Confirm:

1. `/api/health` returns `{ "ok": true }`.
2. The workspace requires a valid account sign-in.
3. The load board requires the private-network invitation code, if enabled.
4. A plan button opens a Square checkout link at `squareup.com`.
5. Startup logs report the Square connection and environment.

Do not set `SQUARE_ENVIRONMENT=production` on a first deployment. The server verifies the location is `ACTIVE`, `USD` and card-capable before enabling collection, and refuses live collection while `SQUARE_LIVE_PAYMENTS_ENABLED` is not exactly `true`.

## 5. Configure the Square webhook

The app can register its own webhook at startup by setting `SQUARE_CONFIGURE_WEBHOOK=true` once, which stores the subscription in the runtime store. Otherwise create one webhook endpoint in the Square dashboard pointing at:

```text
https://YOUR-EXACT-HOST/api/square/webhook
```

The app subscribes to `payment.created`, `payment.updated`, `refund.updated`, `subscription.created`, `subscription.updated`, `invoice.payment_made` and `invoice.scheduled_charge_failed`. Copy the signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY` if you created the subscription by hand. Do not put it in this repository or send it in chat.

Send test events in sandbox, complete one sandbox checkout, and verify the workspace shows the plan and subscription status. Then test cancellation and confirm access survives through the paid period.

## 6. Assign the subdomain

The apex `harperloadboard.com` and `www.harperloadboard.com` are both attached to the live Railway service. The server issues a `308` redirect from the apex to `www`, so `www` is the canonical hostname. Set `HARPER_PUBLIC_ORIGIN=https://www.harperloadboard.com` to match. Do not point a GoDaddy subdomain at the same public domain without first deciding which host actually serves it.

## 7. Acceptance checklist

- Hosted startup succeeds with account authentication enabled.
- No secrets appear in repository files, browser source, deployment ZIP, or DNS.
- Sandbox checkout completes and the workspace reflects the plan and truck count.
- A repeated checkout click with the same request ID does not create duplicate subscriptions.
- Invalid webhook signatures are rejected.
- Valid events update the linked company's subscription.
- A sandbox payment never grants production entitlement.
- `HARPER_REQUIRE_SUBSCRIPTION=true` blocks unpaid non-admin operations access and preserves admin/dispatcher access.
- Data and uploaded files remain private and survive a redeploy before any real use.
