# Dashboard password

The dashboard and all email read endpoints require a server-validated session. Source code remains public. The GitHub Pages address redirects to the protected Cloudflare address. No password, password hash, or session key is shipped to browsers or committed to this repository.

## Viewer access

Ask Nawvid for the shared password. Enter it at the login screen. Each browser stays signed in for seven days; use **Sign out** on shared devices. An expired or revoked session returns to login on the next refresh. A browser that has already downloaded messages cannot be forced to forget saved copies.

## Change the password

Use the Cloudflare Worker settings to replace the encrypted `DASHBOARD_PASSWORD` secret, or run the following command and enter the value at the hidden prompt:

```sh
pnpm exec wrangler secret put DASHBOARD_PASSWORD
```

Choose a long, unique password. Updating this secret invalidates existing sessions at their next server request. Share the new password privately. This is shared access, so there is no separate per-person revocation.

An independent random `DASHBOARD_SESSION_KEY` must also be set as an encrypted Worker secret. Generate it with a password manager (at least 32 random bytes). It protects session-version markers and network identifiers stored in D1. Rotating this key also invalidates existing sessions.

## Controls and limitations

- Session tokens contain 256 random bits. D1 stores only token hashes, a keyed password-version marker, and expiry times.
- Cookies use the `__Host-` prefix, `Secure`, `HttpOnly`, and `SameSite=Lax`. Login and logout also require an exact Origin match.
- Login requests are limited to ten attempts per network address per ten-minute window, enforced atomically in D1. People on the same network share that limit. Distributed guessing remains possible; rate limits do not make a short password strong.
- All dashboard, login, and API responses use `Cache-Control: no-store`. The app clears displayed messages on logout and when it detects session expiry or a 401 response.
- The receiving webhook is exempt from viewer login but still requires a valid Resend signature. Health checks reveal no email contents.
- Hourly cleanup removes expired session and rate-limit records.

## Deployment

Apply `0002_auth.sql` before deploying the password gate, set both encrypted auth secrets, then run `pnpm test`, `pnpm build`, and `pnpm worker:deploy`. The Worker serves `dist` with `run_worker_first = true`, ensuring authentication happens before assets are served. Do not disable that setting.

The GitHub Actions workflow tests/builds the code and publishes only the redirect in `github-pages`. Actual dashboard changes require deploying the Worker after building. Never roll back to the old unauthenticated Worker; doing so would expose mail again.
