# Persistence and account boundaries

This service is a single-process Node application with an atomic JSON store. Keep one Railway replica and mount the service volume at `/app/data`. Set `HARPER_DATA_FILE=/app/data/harper-store.json`. Uploaded document files use the sibling `documents` directory.

The store refuses to start on unreadable or invalid existing data. Writes use a flushed temporary file and atomic rename. Failed persistence restores the last committed in-memory state and returns 503. A previous valid JSON snapshot is retained in `.backup`, refreshed at most hourly. This backup is on the same volume and does not protect against volume loss. Configure a separately stored encrypted backup before launch.

For the first migration only, `HARPER_MIGRATION_JSON` holds the exact old store and `HARPER_MIGRATION_SHA256` verifies it. An absent destination is bootstrapped once and an immutable `.migration-backup` is retained. Existing stores are never overwritten by migration variables. Remove both temporary variables after migration verification. Never commit a runtime store or migration variables.

Recovery: stop the service before restoring. Preserve the damaged file, validate the chosen backup, restore to the configured path, then restart. Never start multiple writers on one JSON file. A relational database is required before horizontal scaling.

Admins and dispatchers are internal staff. Other roles see only records belonging to their company; driver assignments require exact user ID and company match. Drivers see documents only for assigned loads and cannot read company invoices. Company messages, bookings and saved searches are segregated in snapshots and SSE. Legacy unscoped activity is retained for staff only. Dispatchers cannot invite staff or users in other companies.

Checkout completion records linkage with pending status only. Subscription created/updated/deleted events determine access. Persisted event timestamps reject older lifecycle events, terminal cancellation wins, and same-second conflicts resolve conservatively. Checkout cannot overwrite lifecycle state. Automatic reconciliation of conflicting events remains a future enhancement; manually reconcile against Stripe before changing ambiguous entitlements.

Stripe defaults to test mode. Set STRIPE_MODE=live only with matching live account, prices, key and webhook secret. Subscription enforcement remains off until a hosted checkout/webhook/cancellation test passes. The configured Railway account currently permits 512 MB volumes but no managed volume backups; same-volume backup files do not protect against volume deletion.

New live Checkout also requires `STRIPE_LIVE_PAYMENTS_ENABLED=true`, a configured customer portal, and an account enabled for charges. Keep the live-payment switch false until the real sandbox acceptance test and tax review are complete. The switch leaves existing customer portal access and webhook handling available. See STRIPE-LAUNCH-REVIEW.md for the account review and the server-side portal setup command.

Carrier Dispatch is billed as a percentage of collected line-haul revenue: 5%, excluding fuel surcharges, detention, TONU, lumper fees and other reimbursements. There is no weekly fee and no tiered selection; `dispatch-plans.js` defines a single plan (`dispatch-basic`) with `weeklyCents: 0` and `percent: 5`. Fleet onboarding is USD 150 once per fleet. Broker Desk and Shipper Control are recurring monthly plans.

Percentage selections persist as pending_review requests, scoped to the authenticated company and visible to staff. They do not activate a contract or create a payment. Staff must confirm a signed agreement and service capacity, reconcile collected revenue, issue invoices, and record onboarding payment before activating percentage service. Automated revenue import and percentage collection remain unimplemented. Public intake requests preserve the package, billing method and terms version and are visible in Admin. Square is the only payment provider; the legacy Stripe path has been removed.

Weekly checkout persists its retry identity before contacting Stripe. A paid checkout records the existing fleet onboarding ledger. Keep subscription enforcement off until hosted payment and cancellation testing succeeds and percentage-contract entitlements are implemented.

Railway attachment was verified on September 10, 2026: volume `1b46b34a-7cbc-44f3-8570-2fb8cbf9727b`, 500 MB, mounted at `/app/data`. Deployment `74df8bb4-198c-4026-a89f-f02d9b6059c0` verified the migration checksum. Deployment `2012d273-86e3-4809-9e6d-a32b32abbc8d` reused the same volume and existing store without bootstrapping again.
