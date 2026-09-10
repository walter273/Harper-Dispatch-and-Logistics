# Stripe launch review — 2026-09-10

Live collection remains disabled. This is a technical configuration review, not proof of a completed payment or a legal determination of tax obligations.

## Target and verified findings

- Repository: `walter273/Alphaway-Logistics`, branch `main`.
- Railway service: `alphaway-tms-staging-app`, production environment, https://alphaway-tms-staging-app-production.up.railway.app.
- Stripe live account: AlphaWay Logistics (`acct_1UDJTIKqpp58H3DU`).
- Railway has no `STRIPE_SECRET_KEY` or `STRIPE_PORTAL_CONFIGURATION_ID` as of the review.
- Stripe lists zero portal configurations. The connected Stripe app denied the `PostBillingPortalConfigurations` operation because its API key lacks permission. API-key creation is not exposed by the connector. No browser-control runtime is available in this session.
- Stripe Tax settings are active with a Denver, Colorado head office. The owner confirmed the address is current and the business has no sales-tax registrations. Stripe lists no registrations.
- All six active products have `tax_code: null`; their seven active prices (including a legacy Carrier price) have `tax_behavior: unspecified`. The account default is `txcd_10000000` (General - Electronically Supplied Services) and `inferred_by_currency`.
- Current Checkout code does not enable automatic tax. Stripe account activation, payout eligibility, and a real payment/portal cancellation remain unverified without a working server key.

## Changes prepared and applied to the app

`STRIPE_LIVE_PAYMENTS_ENABLED` defaults to false. A live key alone cannot create a live Checkout. Enabling live collection also requires a portal configuration ID; the account must report `charges_enabled: true` before Checkout creation. The switch does not disable signed webhooks or existing customers' portal access.

`npm run stripe:configure-portal` is ready to run inside an environment with authorized Stripe credentials. It creates or updates only the app-owned configuration for the configured origin, with:

- Invoice history and payment-method updates.
- Customer name, email, billing-address and tax-ID updates.
- Cancellation at the end of the paid billing period, without prorations.
- Cancellation reasons; no automatic retention coupon.
- Plan and truck-quantity changes disabled, pending dispatch review.
- Return to the app workspace; no public portal login page.

The command prints the resulting `bpc_...` ID for `STRIPE_PORTAL_CONFIGURATION_ID`. It never writes credentials to source, creates subscriptions, changes customer prices, or adds tax registrations. Default `npm run stripe:review` is read-only. It deliberately reports the payment/cancellation test as unverified.

## Secure credential installation

1. In the AlphaWay Logistics live Stripe account, create a server-side key. Prefer a restricted key with the needed resource permissions; never use a publishable key or expose any server key in chat or client code.
2. Enter the key directly in Railway service variables as `STRIPE_SECRET_KEY`. Keep `STRIPE_MODE=live`, the existing live account and prices, and `STRIPE_LIVE_PAYMENTS_ENABLED=false`.
3. Runtime API calls are account retrieval, price retrieval, Checkout Session creation, and Billing Portal Session creation. The setup/review command additionally needs Billing Portal configuration list/create/update and Tax settings/registrations read access. A temporary setup key can be revoked after provisioning, while a narrower runtime key remains installed.
4. Run the setup command on the trusted server, install its returned portal configuration ID, and rerun the read-only review. Confirm account charges and payouts are enabled and resolve any Stripe requirements shown.
5. Use separate sandbox credentials, prices, webhook secret, portal configuration, and isolated application data for the acceptance test. Never substitute test prices into the live service or use real payment details for a test.

## Tax review and decisions still needed

The current default describes digital services with minimal human involvement, so it should not be accepted blindly for dispatcher-led packages. Stripe's canonical list includes these candidates for review, not automatic assignment:

| Offering | Candidate | Decision required |
| --- | --- | --- |
| Dispatcher-led Basic, Standard, Premium and fleet onboarding | `txcd_20030000`, General - Services | Confirm whether a more specific service category and any bundled software treatment apply. |
| Shipper/Broker workspace, if sold as software access to businesses | `txcd_10103001`, Software as a service (SaaS) - business use | Confirm the actual offering is software access rather than a managed logistics service. |

[Stripe's product tax-code reference](https://docs.stripe.com/tax/tax-codes) confirms the categories. Product codes and price tax behavior must be decided for the actual offerings; no products have been marked exempt and no registrations have been invented.

Colorado generally does not tax services, but its guide excludes separately administered home-rule jurisdictions and discusses mixed transactions. Denver's software guidance can tax software used in Denver and certain mandatory related charges. An accountant should review the dispatch/app bundle, standalone workspace plans, onboarding, customer locations and applicable registration obligations. A Denver head office alone does not establish that all nationwide sales are exempt. Sources: [Colorado Sales Tax Guide, October 2025](https://tax.colorado.gov/sites/tax/files/documents/Sales_Tax_Guide_Oct_2025.pdf), [Denver Tax Guide — Software](https://www.denvergov.org/files/assets/public/v/1/finance/documents/treasury/tax-guides/tax-update-2025/taxguidetopic18_software.pdf).

Record only jurisdictions where the business has actually registered. Stripe calculates tax only in jurisdictions with active registrations; zero tax is not proof of exemption. Once the classification/registration review is resolved, configure product tax codes and price treatment, implement automatic tax when applicable, and test customer location and tax results. [Stripe Tax setup](https://docs.stripe.com/tax/set-up), [Stripe tax registration guidance](https://docs.stripe.com/tax/registering).

## End-to-end acceptance evidence still required

Local automated tests exercise request validation, signed webhook handling, tenant boundaries, persistence, and portal parameters. They use simulated Stripe responses and do not replace this real sandbox test:

Verification on this change: the build and diff checks passed. All 31 tests passed across the main run and targeted reruns. The main run had one local server-start timeout; that retry/persistence case passed with `ALPHAWAY_TEST_STARTUP_TIMEOUT_MS=120000` on the memory-constrained Windows host. The expanded cancellation test verifies retained access while cancellation is scheduled, revoked access after the final event, persisted canceled status, and rejection of a late active event.

| Step | Required evidence | Status |
| --- | --- | --- |
| App creates Checkout for one Basic truck | Stripe-hosted session: $300 weekly plus $150 once, before any applicable tax | Pending credentials |
| Complete Checkout with Stripe test payment details | Paid first invoice, correct customer and subscription, successful return to the app | Pending |
| Stripe delivers signed events | Delivery succeeds at the test app; correct company gains the subscription and onboarding ledger entry | Pending |
| Restart the test app | Same subscription and company linkage survive | Pending |
| Repeat/retry checkout | No duplicate subscription or duplicated onboarding fee | Pending |
| Open the portal from the app | Correct customer only; invoices and payment-method management work | Pending |
| Cancel in the portal | `cancel_at_period_end=true` reflected in the app; access retained through the paid period | Pending |
| End the period using a sandbox test clock where supported | Cancellation event delivered; subscription ends and paid entitlement stops | Pending |
| Failed payment and invalid/mismatched events | No paid entitlement; no cross-company changes | Pending |
| Applicable tax | Confirm the jurisdiction, tax code, rate and taxability reason; distinguish exemption from not collecting | Pending legal review/setup |

Only after these checks pass should `STRIPE_LIVE_PAYMENTS_ENABLED=true` be installed. Subscription enforcement is a separate setting and should be enabled only after company/user access is verified.
