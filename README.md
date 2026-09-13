# Shared Mail

A password-protected, searchable view of selected emails from several Gmail accounts. The dashboard keeps the last 72 hours, refreshes every minute, and shows message text without attachments. Gmail owners decide what appears using their own sender/keyword filters.

## Architecture

Gmail filters → Resend receiving address → Cloudflare Worker + D1 → protected dashboard on the same Worker. GitHub Pages redirects existing bookmarks to the protected dashboard.

The repository contains application code only. Live email contents, receiving addresses, API keys, and forwarding-verification messages do not belong in Git.

## Run locally

Use Node.js 22 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev:demo
```

The sample preview is visibly labeled and uses fictional messages. The regular `pnpm dev` and production builds never silently substitute sample messages for live mail.

For local integration, copy `.dev.vars.example` to `.dev.vars`, use fictional local credentials and source data, run `pnpm db:local`, then `pnpm build` and `pnpm worker:dev`. The frontend and API use the same origin. Production credentials never belong in Vite variables or browser storage.

```sh
pnpm test
pnpm build
pnpm worker:check
```

- [Administrator setup](docs/ADMIN.md)
- [Gmail owner instructions](docs/GMAIL-OWNERS.md)
- [Operations and troubleshooting](docs/OPERATIONS.md)

## Cost and access

Use GitHub Free with a public code repository, Resend Free, and Cloudflare Workers Free/D1. Use their supplied addresses and do not enable paid subscriptions or trials. Free-provider quotas and availability can change. If a free limit is reached, service may pause; this design does not authorize paid upgrades.

The site and read API require a shared password. Server-side sessions last seven days and use Secure, HttpOnly cookies. Login attempts are limited to ten per network address per ten-minute window. Changing the password invalidates existing sessions. Anyone who knows the password can share it or copy a message; dashboard expiry cannot recall saved copies. See [password administration](docs/PASSWORD.md).

## Retention

Messages disappear from API responses and the open interface after 72 hours from receipt by Resend. Hourly cleanup removes expired rows from the active D1 database. Gmail originals remain unchanged. Resend's own retention and Cloudflare backups are separate from dashboard retention.
