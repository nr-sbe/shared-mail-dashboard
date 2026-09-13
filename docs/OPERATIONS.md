# Operations and troubleshooting

## Normal behavior

- The browser refreshes every minute while visible, when reopened, and when Refresh is clicked.
- Search, source selection, and the open message survive refreshes. Expired messages disappear even if the next refresh fails.
- Opening a message does not mark it read for other viewers. There are no shared mutations from the public site.
- Messages are shown as text. Images, tracking pixels, scripts, forms, and attachments do not load.
- Resend stores incoming email independently; the application fetches body data but does not download attachments. Provider retention is separate from the rolling 72-hour dashboard.

## Missing message

Check in this order:

1. Owner's Gmail: matching filter, verified destination, no spam classification, and any organization forwarding restrictions.
2. Resend Receiving: whether the message actually arrived at the correct assigned address.
3. Source configuration: active status and activation time. Only messages received after activation can publish.
4. Resend webhook attempts: success response or retryable error.
5. Cloudflare logs: error identifiers (email bodies and credentials are never deliberately logged).

For a temporary retrieval/database error, the Worker returns 503 so Resend can retry. After fixing the cause, replay the failed event in Resend. Replays are idempotent: they do not duplicate the same provider message/source pair. Replays cannot restore expired messages or deliberately removed messages.

The backend deliberately excludes Gmail forwarding confirmations. Messages with bodies over one million characters are rejected with a recorded error rather than silently truncated. These may need manual handling.

## Remove an accidentally published email

Copy its `id` from `/api/messages` in your administrator browser. It looks like `provider-uuid:source-id`.

```sh
pnpm message:remove provider-uuid:source-id --remote
```

This removes every source copy for that provider ID and adds a temporary tombstone so webhook replays cannot restore it. Already-open browsers update on their next refresh. If separate forwards have different provider IDs, remove each one. This does not delete Gmail originals or recall copies saved by viewers.

## Pause a source

```sh
pnpm source:add deactivate operations
```

Upload the changed `SOURCES_JSON` secret. Its existing messages stop appearing in the API, and future webhook events are ignored. Ask its Gmail owner to remove the forwarding filter too. To resume, activate it and upload the secret again; the new activation time excludes messages collected while paused.

## Free-plan limits

Keep all services on free plans. View usage in their normal dashboards; do not enable paid upgrades or top-ups. Cloudflare Free has enforced request/database limits. If these are reached, the dashboard may stop refreshing until limits reset. Check Resend's current receiving limits as well. This small workload is the design assumption, not an unlimited-capacity promise.

## Updates and recovery

- Frontend: a push to `main` builds and publishes via GitHub Actions. Changing `VITE_API_BASE_URL` requires rerunning that workflow.
- Backend: run `pnpm test`, `pnpm build`, `pnpm worker:check`, then `pnpm worker:deploy` using the administrator's Cloudflare session.
- Database changes: add a numbered migration, test locally, then run `pnpm db:remote` before deploying dependent code.
- Keep ignored `sources.local.json` in a private administrator backup. Keep account recovery information and secret recovery in your normal password manager.
- To roll back frontend code, revert the relevant commit. For the backend, use Cloudflare's deployment rollback after checking database compatibility.

## Live validation remains separate

Local automated tests verify processing and interface behavior with fictional data. They cannot prove that the owners' actual Gmail accounts permit forwarding or that live service delivery meets the time target. Record those results only after testing the connected accounts.
