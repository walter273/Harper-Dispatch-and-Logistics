# Persistence and account boundaries

This service is a single-process Node application with an atomic JSON store. Keep one Railway replica and mount the service volume at `/app/data`. Set `ALPHAWAY_DATA_FILE=/app/data/alphaway-store.json`. Uploaded document files use the sibling `documents` directory.

The store refuses to start on unreadable or invalid existing data. Writes use a flushed temporary file and atomic rename. Failed persistence restores the last committed in-memory state and returns 503. A previous valid JSON snapshot is retained in `.backup`, refreshed at most hourly. This backup is on the same volume and does not protect against volume loss. Configure a separately stored encrypted backup before launch.

For the first migration only, `ALPHAWAY_MIGRATION_JSON` holds the exact old store and `ALPHAWAY_MIGRATION_SHA256` verifies it. An absent destination is bootstrapped once and an immutable `.migration-backup` is retained. Existing stores are never overwritten by migration variables. Remove both temporary variables after migration verification. Never commit a runtime store or migration variables.

Recovery: stop the service before restoring. Preserve the damaged file, validate the chosen backup, restore to the configured path, then restart. Never start multiple writers on one JSON file. A relational database is required before horizontal scaling.

Admins and dispatchers are internal staff. Other roles see only records belonging to their company; driver assignments require exact user ID and company match. Drivers see documents only for assigned loads and cannot read company invoices. Company messages, bookings and saved searches are segregated in snapshots and SSE. Legacy unscoped activity is retained for staff only. Dispatchers cannot invite staff or users in other companies.

Checkout completion records linkage with pending status only. Subscription created/updated/deleted events determine access. Persisted event timestamps reject older lifecycle events, terminal cancellation wins, and same-second conflicts resolve conservatively. Checkout cannot overwrite lifecycle state. Automatic reconciliation of conflicting events remains a future enhancement; manually reconcile against Stripe before changing ambiguous entitlements.

Stripe defaults to test mode. Set STRIPE_MODE=live only with matching live account, prices, key and webhook secret. Subscription enforcement remains off until a hosted checkout/webhook/cancellation test passes. The configured Railway account currently permits 512 MB volumes but no managed volume backups; same-volume backup files do not protect against volume deletion.

Carrier Network pricing is USD 500 per truck per month, with USD 150 onboarding once per fleet. Truck count is limited to 1–100 per checkout. The additional 3% of gross revenue is disclosed in Checkout and must be invoiced separately from reviewed revenue; no automatic revenue assessment or collection is implemented. Paid Checkout webhooks record the fleet onboarding ledger. Pending checkout identity is persisted before calling Stripe so retries reuse the same session.
