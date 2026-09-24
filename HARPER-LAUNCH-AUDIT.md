# Harper Load Board launch audit

Date: 2026-09-15

## Current production path

- Repository: `walter273/Harper-Dispatch-and-Logistics`
- Production branch: `main`
- Railway project: `Harper Dispatch and Logistics`
- Active app service: `harper-tms-staging-app`
- Public Railway domain: `harper-tms-staging-app-production.up.railway.app`
- Custom domain attached in Railway: `www.harperloadboard.com`
- Persistent volume: 500 MB mounted at `/app/data`
- Latest audited Railway deployment: commit `3dda6aa693d3e355e22ae320c34e28d49f637801`, status SUCCESS

## What is working

- Harper public homepage is responding successfully on `www.harperloadboard.com`.
- Static Harper theme, navigation, homepage demo assets and supplied Harper imagery are being served successfully.
- Account authentication, role-aware workspaces, carrier onboarding, intake review, billing integrations, communications, inbox integration and browser voice code are present in the repository.
- Persistent Railway storage is mounted for runtime state.
- The app exposes `/api/health`, which checks storage availability.
- The repository has a substantial Node test suite covering admin access, invitations, persistence, billing, carrier verification, intake review and other workflows.

## Changes made during this audit

1. Replaced the obsolete GitHub Actions Webpack workflow with a real application verification workflow.
   - Uses Node 20 and 22, matching the application's supported runtime.
   - Uses `npm ci` for reproducible installs.
   - Runs `npm run build`.
   - Runs `npm test`.
2. Recommended Railway health checking against `/api/health` instead of `/` so deployments validate the app and writable persistence layer rather than only the homepage.

## Findings that still need launch decisions

### Domain

Railway currently has `www.harperloadboard.com` attached. The apex domain `harperloadboard.com` is not currently attached to the service. Decide whether the apex should redirect to `www` or be attached directly before considering domain work complete.

### Runtime naming and legacy configuration

The public product has been rebranded to Harper, but the repository, Railway service names, internal storage path, cookie names, event names and many environment variables retain the historical `HARPER_` prefix. These internal identifiers should not be renamed casually because doing so could break persistence, sessions, deployment variables and integrations. Public-facing branding should remain Harper while legacy internal identifiers are migrated only through a planned compatibility change.

### Public-versus-private hosting model

The current Railway runtime reports preview authentication as disabled. That is appropriate for a public marketing site only if every private workflow and API remains protected by account/role authorization. Do not enable the legacy whole-site preview gate on the public Harper domain without reviewing the public/private route split.

### Search-engine basics

Railway HTTP logs show requests for `/robots.txt` and `/favicon.ico` currently returning 404. These are low-risk launch polish items and should be added when the static-file allowlist is updated.

### Production wording

Some internal operations UI still contains legacy words such as `demo` in driver/load catalog labels. The underlying behavior should be preserved, but production-facing text should be changed to neutral operational wording after the relevant pages are reviewed end-to-end.

### Payments

The repository contains both Stripe and Square-related billing code and launch controls. Live payment activation should stay gated until the configured provider has completed its hosted payment, webhook, cancellation/refund and entitlement acceptance tests. Do not enable live payment switches merely because the site is publicly reachable.

### Data architecture

The application still uses a single-process JSON data store on a mounted Railway volume. This is acceptable for the present single-replica launch stage, but it is not suitable for horizontal scaling. Move to a transactional database before adding multiple writers/replicas or materially increasing customer volume.

## Launch gate

Before calling Harper Load Board fully production-ready, verify all of the following:

- GitHub CI passes build and tests on the audit branch and then on `main`.
- Railway healthcheck uses `/api/health` and the resulting deployment succeeds.
- Admin sign-in, carrier sign-in, invitations and role permissions work on `www.harperloadboard.com`.
- A test load can be created, assigned to a test driver, updated, and closed without leaking data across company roles.
- Carrier onboarding and intake review complete end to end.
- The selected billing provider completes sandbox acceptance testing before live payments are enabled.
- Browser calling/email integrations fail safely when credentials or consent are unavailable.
- Apex-domain behavior is decided and configured.
- Public-facing `demo`/legacy branding text is removed where it no longer reflects the live product.
- Backup and restore procedures for `/app/data` are tested.

## Do not change without migration planning

- Existing persistent store location and schema
- Existing cookie/session names used by active users
- Existing legacy `HARPER_` environment variable names
- Billing price IDs or live-payment switches
- Twilio credentials or callback URLs
- Microsoft inbox application/consent configuration

These can all be renamed or modernized later, but they should be migrated with compatibility support rather than changed in place.
