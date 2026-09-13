# Deployment record

Backend deployed on September 13, 2026.

- Website: https://nr-sbe.github.io/shared-mail-dashboard/
- Backend: https://shared-mail.shared-mail-dashboard.workers.dev
- Database: the existing `shared-mail` D1 database configured in `wrangler.toml`.
- Resend incoming webhook: `/webhooks/resend`, subscribed to `email.received`.
- Retention: a rolling 72 hours, with hourly database cleanup.
- Worker secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `SOURCES_JSON`.

Use the existing resources for updates. Keep the receiving destinations and secret values out of Git. The Free plan applies its built-in CPU limit; do not configure a custom CPU limit, which requires a paid plan.

## Verification

Live checks passed for database health, an empty public feed, permitted browser origin, disabled caching, rejection of unsigned webhooks, and acceptance of a signed event without publishing it for an inactive source.

The three sources remain inactive pending owner setup. Gmail owners perform all changes in their own accounts. Actual Gmail forwarding, delivery time, and simultaneous viewing of real incoming messages have not yet been tested. Local tests and synthetic webhook checks do not substitute for that final check.
