# Applicant onboarding

Staff still verify evidence and an administrator makes approval or denial decisions. Check Email this decision and write the applicant message when recording an approval, denial, or needs-information status. Internal review notes are never included. Existing applications are not automatically notified.

Approval creates a separate carrier company and a seven-day, single-use account invitation. An email matching an unrelated existing account is blocked for manual membership review. Needs-information emails include a seven-day private response link; PDF, PNG, and JPEG attachments are limited to 3 MB and remain unverified until staff review them. Documents are available only to staff. Denial creates no account.

Onboarding shows account creation, verified current evidence, dispatcher assignment, and payment readiness. Dispatch access requires all steps. Weekly plans require a matching active subscription; percentage arrangements require a staff-entered agreement/payment reference. Reopening or suspension blocks access immediately and expires unused invitations.

## Private service settings

Set HARPER_APPLICANT_EMAILS_ENABLED=true, HARPER_EMAIL_PROVIDER=twilio, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, HARPER_EMAIL_FROM=dispatch@harperloadboard.com, HARPER_EMAIL_REPLY_TO=info@harperloadboard.com, and HARPER_PUBLIC_ORIGIN=https://www.harperloadboard.com. Preserve the existing private HARPER_SESSION_SECRET (at least 32 characters). The Twilio key needs comms emails Create and emails.operations Read. Authenticate the sending domain. Never commit secrets.

Never configure an @alphawaylogistics.com or @alphawaylogisticsllc.com address or origin. The owner has no access to AlphaWay and no AlphaWay address or domain can be used or recovered. Set these three variables explicitly; a wrong or missing sender means applicant approval and invitation email fails silently.

The persistent outbox sends one job at a time. Request retries do not create duplicate decisions or invitations. Provider acceptance is distinct from confirmed recipient-server delivery; Twilio operation stats are polled once a minute for up to seven days. Opened/read status is not claimed. Rate limits retry with backoff; interrupted or ambiguous sends do not retry automatically. For blocked or uncertain jobs, review Twilio activity and correct configuration before reopening and recording a replacement decision. Reopening cancels queued mail and old invitations. Previously accepted emails cannot be recalled.

Attachments are signature-checked and served as downloads, not malware-scanned. Staff must review them before changing evidence checks. Private response links are bearer links: do not forward them.
