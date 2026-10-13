# engTempmail — GitHub Pages website

**This is a website, not a browser extension.** The complete Mint/forest-green frontend is hosted on GitHub Pages. A small Cloudflare Worker calls temp.tf because temp.tf does not return CORS headers permitting direct browser requests from GitHub Pages (tested during development).

## Live deployment

- Website: https://amitsami.github.io/engTempmail/
- Source: https://github.com/amitsami/engTempmail
- API proxy: https://engtempmail-api.haganubbra.workers.dev

The API URL is already configured in `site/config.js`. The setup instructions below are for redeployment or moving the site to another account.

## Architecture

Visitor → your GitHub Pages website → your Cloudflare Worker → temp.tf API.

GitHub Pages hosts every UI asset. The Worker hosts only the email API proxy; it does not host your frontend. No Node server, API key, extension, public third-party CORS relay or browser installation is needed. A Cloudflare account is required for the proxy.

## Step 1 — deploy the API proxy

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Create a Worker named `engtempmail-api` (the dashboard labels may vary), then open its code editor.
3. Replace the starter Worker code with the complete contents of **`worker/worker.js`** and deploy.
4. Under the Worker’s settings, add a text environment variable:
   - Name: `ALLOWED_ORIGIN`
   - Value: `https://amitsami.github.io`
   This must be your actual GitHub Pages **origin**, without the repository path and without a trailing slash. If your username differs, change it. Custom domains must use their custom origin.
5. Deploy/save the updated variable. Copy the Worker’s HTTPS URL, such as `https://engtempmail-api.your-subdomain.workers.dev`.
6. Open **`site/config.js`**, and put your real URL into `apiBase`:

```js
window.ENGTEMPMAIL_CONFIG = {
  apiBase: 'https://engtempmail-api.your-subdomain.workers.dev'
};
```

Do not add `/api` to that URL. This example is a placeholder, not a deployed endpoint. Never paste keys or passwords in config.js; it is public.

Advanced CLI alternative: install Cloudflare’s Wrangler on your own computer, authenticate there, then run `wrangler deploy` from `worker/`. The included `wrangler.toml` supplies the default origin. The dashboard path above needs no CLI.

## Step 2 — host the actual website on GitHub Pages

1. Create a repository called **engTempmail** on your GitHub account.
2. Upload the contents of this project to the repository root: `site/`, `worker/`, `.github/`, README.md, package.json and .gitignore. **Do not upload only the ZIP.** Keep `.github/workflows/pages.yml` intact.
3. Make sure the default branch is **main** (or edit the workflow’s branch name).
4. Repository → **Settings → Pages → Source → GitHub Actions**.
5. Repository → **Actions → Deploy engTempmail to GitHub Pages → Run workflow** (or push a commit). When it finishes, Pages settings shows the website URL.
6. For username `amitsami` and repo `engTempmail`, the normal address is `https://amitsami.github.io/engTempmail/`. This is the expected route, not a site already deployed for you.

The workflow publishes only `site/`, so Worker source and test files are not uploaded into the website artifact. Every asset uses relative paths to work beneath the GitHub repository URL.

**Simpler upload alternative:** upload only the contents of `site/` directly into your repository root, then choose Pages → Deploy from a branch → main → root. Deploy the Worker separately as in Step 1. In this alternative there is no need for the GitHub Actions workflow.

## What works after those two setup steps

- Temporary address generation and copying.
- Dot/Plus syntaxes and documented Gmail/Outlook/Hotmail provider filters. All providers may also return high.edu.pl; no undocumented high.edu.pl filter is invented.
- Recover an address accepted by temp.tf and read its inbox.
- Safe limited HTML/plain-text email display and attachment downloads up to 20 MB.
- Live availability totals including high.edu.pl when returned by the API.
- Clickable email icon (`mailto:amitsami110@gmail.com`) and GitHub icon (`https://github.com/amitsami`). Email opens the visitor’s configured mail client; it does not send a message automatically.
- Mobile-friendly layout with accessible keyboard controls.

## Honest setup state

The live Worker endpoint is set in `site/config.js`. If you remove that URL or copy this project to another account without reconfiguring it, the site shows a setup notice instead of fake live totals.

The engTempmail repository and Cloudflare Worker have been created. GitHub Pages deploys this site from the included workflow.

## Safety and limits

- temp.tf permits developer API use and documents 60 requests/minute/IP: https://temp.tf/document and https://temp.tf/terms.
- Manual refresh only. Stats cache for 60 seconds at the Cloudflare edge. The Worker limits requests per isolate and honours upstream Retry-After. Isolate counters are **not** a distributed rate limit; a busy production site should add Cloudflare rate limiting/abuse protection. Cloudflare’s quotas and billing depend on your plan.
- CORS is restricted to your site origin, but CORS is not authentication and does not stop non-browser clients. Do not use this as an authenticated/private API.
- Never use disposable inboxes for banking, identity, sensitive accounts or permanent account recovery. Service availability depends on temp.tf.
- Browser stores the current address only in sessionStorage. App does not persist inbox bodies. Upstream/hosting services may keep their own logs.
- Email HTML is reduced to safe elements, with scripts, links, images and forms removed, and rendered in a restrictive sandbox. Attachments may still contain unsafe files.

## Checks

Run `node --test worker/worker.test.js` on Node 22+. Tests cover CORS, validation, fixed upstream, large-number precision, backoff and attachment headers. Browser layout/interaction tests and actual temp.tf requests were checked during development. Incoming email delivery is not guaranteed merely by API success.
