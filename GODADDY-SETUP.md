> Historical alternative-host guide. The active app uses Railway; see README.md and OPERATIONS-READINESS.md. Old example Price IDs require replacement with prices matching the current carrier terms.

# GoDaddy setup for Harper Dispatch and Logistics

This repository is prepared for GoDaddy Node.js Hosting. Keep the first deployment private while Stripe remains in sandbox mode.

## 1. Import the application

In GoDaddy Node.js Hosting, import the GitHub repository or upload `harper-tms-godaddy.zip`. The application meets GoDaddy's Node requirements:

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
| `HARPER_REQUIRE_AUTH` | `true` |
| `HARPER_PREVIEW_USERNAME` | private preview username |
| `HARPER_PREVIEW_PASSWORD` | long unique secret |
| `HARPER_PRIVATE_NETWORK` | `true` |
| `HARPER_NETWORK_INVITE_CODE` | separate long unique secret |
| `HARPER_ACCOUNT_AUTH` | `true` |
| `HARPER_ACCOUNT_SESSION_SECRET` | separate random secret |
| `HARPER_ADMIN_EMAIL` | initial administrator email |
| `HARPER_ADMIN_PASSWORD` | separate long unique secret |
| `HARPER_ADMIN_TOKEN` | separate intake-review token |
| `HARPER_REQUIRE_SUBSCRIPTION` | `false` during sandbox acceptance testing; change to `true` only after successful webhook testing |
| `STRIPE_SECRET_KEY` | sandbox secret or restricted key from account `acct_1UDJTIKqpp58H3DU` |
| `STRIPE_ACCOUNT_ID` | `acct_1UDJTIKqpp58H3DU` |
| `STRIPE_WEBHOOK_SECRET` | signing secret created for the exact hosted webhook endpoint |
| `STRIPE_PORTAL_CONFIGURATION_ID` | sandbox portal configuration ID beginning with `bpc_` |
| `STRIPE_PRICE_CARRIER` | `price_1UDWf7Kqpp58H3DU1oRYxBT0` |
| `STRIPE_PRICE_SHIPPER` | `price_1UDWfCKqpp58H3DU1xjnfinA` |
| `STRIPE_PRICE_BROKER` | `price_1UDWfGKqpp58H3DUgiOa6GtG` |
| `STRIPE_PUBLIC_BASE_URL` | `https://app.alphawaylogistics.com` |

Leave `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` blank unless you need custom same-origin destinations. The server derives safe defaults from `STRIPE_PUBLIC_BASE_URL`.

## 3. Configure private data storage

The current application uses a JSON store and uploaded-document directory under `HARPER_DATA_FILE`. GoDaddy documents `/public/assets/` as persistent between Node.js deployments, but that path is web-facing and must not contain account records, tokens, billing identifiers, audit logs, or customer documents.

Use a private persistent database or a private persistent filesystem path supplied by your GoDaddy product. If the Node.js Hosting plan offers no private persistent storage, use the deployment only for sandbox demonstration and migrate the store to a database before real customer data or billing. Do not set `HARPER_DATA_FILE` inside `/public`.

## 4. Publish a protected preview

Preview the imported app before assigning the final domain. Confirm:

1. `/api/health` returns `{ "ok": true }`.
2. The root page requests the preview username and password.
3. The load board requires the private-network invitation code.
4. The workspace requires a valid account sign-in.
5. A plan button opens Stripe sandbox Checkout at `checkout.stripe.com`.

Do not switch Stripe to live mode. The server intentionally rejects live keys, live prices, and live events.

## 5. Create the Stripe sandbox webhook

After GoDaddy provides the final preview or domain origin, create one webhook endpoint in the same Stripe sandbox account:

```text
https://YOUR-EXACT-HOST/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the endpoint's signing secret directly into GoDaddy's `STRIPE_WEBHOOK_SECRET` setting. Do not put it in this repository or send it in chat. Send test events, complete one sandbox Checkout, and verify that the workspace shows the plan and subscription status. Then test â€œManage billingâ€ and cancellation through Stripe's customer portal.

The selected sandbox currently has no active customer-portal configuration. In the Stripe Dashboard's sandbox mode, open **Billing â†’ Customer portal**, enable payment-method updates, invoice-history access, and subscription cancellation, then save the configuration. Review the cancellation policy before using it with customers.

## 6. Assign the GoDaddy subdomain

The root domain `https://alphawaylogistics.com` already serves the public Harper Dispatch and Logistics LLC site through GoDaddy Website Builder. Keep that site in place and attach the Node.js application to `https://app.alphawaylogistics.com` unless the owner explicitly decides to replace the public site.

Use the Node.js Hosting domain settings to attach `app.alphawaylogistics.com`. Set `STRIPE_PUBLIC_BASE_URL=https://app.alphawaylogistics.com` and redeploy. If GoDaddy asks for a DNS record, use only the target value GoDaddy shows for this Node.js application; do not guess an IP address or copy the root Website Builder records.

The Stripe sandbox webhook URL for this configuration is `https://app.alphawaylogistics.com/api/stripe/webhook`. If the hostname changes, update the webhook, replace `STRIPE_WEBHOOK_SECRET` with the new endpoint's secret if Stripe issues one, and repeat the signed-event tests.

## 7. Acceptance checklist

- Hosted startup succeeds with all three access controls enabled.
- No secrets appear in repository files, browser source, deployment ZIP, or DNS.
- The three Price IDs resolve to active, licensed, monthly USD sandbox prices for $500 per truck, $799, and $299, plus a one-time $150 fleet onboarding price.
- A repeated Checkout click with the same request ID does not create duplicate sessions.
- Invalid webhook signatures return HTTP 400.
- Valid events are deduplicated and update the linked user's subscription.
- Carrier, shipper, and broker users can open the customer portal after Checkout.
- `HARPER_REQUIRE_SUBSCRIPTION=true` blocks unpaid non-admin operations access and preserves admin/dispatcher access.
- Data and uploaded files remain private and survive a GoDaddy redeployment before any real use.
- Replace the placeholder `support@harper-tms.invalid` contact with an authorized business support address before inviting users.
