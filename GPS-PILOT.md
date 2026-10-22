# Carrier GPS pilot

## Qualification first; tracking later

The initial carrier application collects company and contact details, MC/USDOT
identifiers, equipment, available units, preferred lanes, availability, and
qualification notes. It does not ask for an ELD/GPS provider, pilot truck, or
tracking-pilot request.

After qualification and approval, staff coordinate tracking setup separately.
The onboarding status page explains this later step. Collect provider details,
truck selection, and required carrier and driver authorizations through the
approved setup process; an application is not tracking authorization.

Previously submitted tracking fields remain available in staff review, search,
and exports. The API continues to accept and validate those optional fields for
compatibility, and applications without tracking fields remain valid. This
change does not activate a tracking integration or schedule automatic tracking.

## Choose the first connection

Use the provider already used by the pilot carrier. Before implementing or
enabling its connector, confirm:

1. Carrier legal name and its app company ID.
2. One truck number and the matching vehicle ID in the provider account.
3. The pilot shipment and start/end window.
4. Carrier authorization and the driver's required notice/consent, including
   who can see location data, why it is collected, and the retention period.
5. Authorized provider access with the minimum vehicle-location read permissions.

Record reviewer, date, and secure authorization-document references in the intake
review notes. Keep passwords and API tokens out of intake forms, notes, exports,
Git, and chat. Store provider credentials only in the approved server secret
configuration. A carrier must authorize its own account access.

Provider references for implementation:

- Samsara: https://developers.samsara.com/docs/tms-gps-tracking
- Motive: https://developer-docs.gomotive.com/docs/use-cases

The first connector is pending the pilot carrier's provider and authorized
access. No live tracking provider is activated by this release.

## One-truck acceptance checks

Run these with the agreed carrier and truck before expanding access:

- Verify the mapped vehicle against the carrier's provider dashboard and truck
  number. Retrieve and display only the authorized vehicle for the pilot.
- Confirm a genuine location and its provider timestamp, then observe a second
  update during the agreed pilot window. Never replace missing locations with
  simulated coordinates or advance a route animation as if it were telemetry.
- Display the age of the last location and a stale/unavailable state during
  loss of signal, provider errors, and revoked access. Do not claim an ETA unless
  an appropriate routing or provider estimate is available.
- Verify authorized dispatcher access and deny anonymous users and other
  carriers. GPS data must not enter the public demo state or shared broadcasts.
- Check persistence/restart behavior, scoped storage, retention, rate limits,
  secret redaction, and stop/revocation handling.
- End the pilot at the agreed time, revoke or stop access, and record the result
  and any gaps in the intake review history.

The existing Demo GPS remains a demonstration until a real, authorized feed is
implemented and these live acceptance checks pass. Public customer tracking links
and automatic alerts are subsequent changes, not part of this intake release.
