# Administrator setup

Codex can perform these steps in your accounts. You only need to complete sign-in, verification, and any account terms or permissions that require your participation. Gmail owners need no accounts with Cloudflare, Resend, or GitHub.

## 1. Free accounts

Use GitHub Free, Cloudflare Workers Free, and Resend Free. Do not enable a trial, paid tier, top-up, custom domain purchase, or automatic billing. Confirm the current plan supports inbound email before activating forwarding. At fewer than ten emails per day, storage for three days is small; site traffic also counts toward free backend limits.

## 2. Create the database and backend

In this repository, with Node.js 22 and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create shared-mail
```

Copy the returned database ID into `wrangler.toml`. Set `ALLOWED_ORIGIN` to the GitHub site's origin, e.g. `https://nr-sbe.github.io` (no repository path or trailing slash).

```sh
pnpm db:remote
```

In Resend, create an API key that can retrieve received emails. Store it only as a Worker secret through the prompt:

```sh
pnpm exec wrangler secret put RESEND_API_KEY
```

Do not paste keys into chat, commit them, or put them in frontend environment variables. Only `VITE_API_BASE_URL` is public.

Deploy the Worker initially with no active sources:

```sh
pnpm worker:deploy
```

Record the resulting `https://shared-mail.<account>.workers.dev` URL. The service can return an empty feed until sources are configured. Confirm `/api/health` returns `ok: true`.

## 3. Connect Resend

In Resend's Receiving area, find the supplied `<your-domain>.resend.app` address. No DNS changes or purchased domain are needed.

Create a webhook for `email.received`, with destination:

```text
https://shared-mail.<account>.workers.dev/webhooks/resend
```

Save its signing secret using:

```sh
pnpm exec wrangler secret put RESEND_WEBHOOK_SECRET
```

## 4. Create a receiving address for each Gmail owner

Use friendly source labels rather than exposing private Gmail addresses in the interface. Example:

```sh
pnpm source:add add operations "Operations" your-domain.resend.app
pnpm source:add add projects "Projects" your-domain.resend.app
```

The helper creates random receiving addresses in ignored `sources.local.json`. This file is private backend configuration. Open it locally to give each owner their assigned address.

Upload the complete array as the `SOURCES_JSON` secret. One option is the Cloudflare dashboard: Worker → Settings → Variables and Secrets → add encrypted secret. Paste the JSON there. Alternatively use `pnpm exec wrangler secret put SOURCES_JSON` and paste it at the prompt.

New sources are inactive. The forwarding confirmation can arrive in Resend, but the Worker will not publish it.

## 5. Verify and activate each owner

Give the owner [the Gmail guide](GMAIL-OWNERS.md) and their receiving address. When Gmail sends its confirmation, retrieve the matching verification message privately from Resend. Share the confirmation code directly with that owner so they can enter it in Gmail. Never place the verification code in a repository, public dashboard, or issue.

After verification:

```sh
pnpm source:add activate operations
```

Upload the updated complete `SOURCES_JSON` secret again. Activation records the current time; messages received before that activation are excluded, including old verification attempts. The owner can now enable their keyword filter and test it.

Repeat for all 3–4 sources. Source labels and active status are backend settings; keyword rules remain in each Gmail account.

## 6. Publish on GitHub Pages

Create the public repository `shared-mail-dashboard` in your GitHub account and push this source to `main`. Do not include `.env.local`, `.dev.vars`, `sources.local.json`, or real email fixtures.

In repository Settings → Secrets and variables → Actions → Variables, add:

```text
VITE_API_BASE_URL = https://shared-mail.<account>.workers.dev
```

In Settings → Pages, select **GitHub Actions** as the build source. Run **Publish dashboard** from the Actions tab (or push a code change). The workflow runs tests, builds, and deploys. The public URL will be `https://<username>.github.io/shared-mail-dashboard/`.

The repository variable contains only a public backend URL. No Resend or Cloudflare credentials are required by the Pages workflow. Backend deployment is separately performed by the authenticated administrator.

## 7. Live acceptance check

Open the site in two browsers. For each source, arrange one disposable matching test email and one nonmatching email. Confirm only the matching message appears, with the correct source label and full text. Confirm an attachment is not displayed. Test changing a filter, automatic update within the 5–10 minute target, manual refresh, and search. These are delivery targets, not a guarantee against Gmail/provider delays.

Use the operations guide to test failure recovery and remove disposable test messages after validation. Keep an account owner responsible for the three services and their recovery methods.
