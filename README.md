# engTempmail

A responsive Mint/forest-green temporary-email **website**, hosted on GitHub Pages. Not a browser extension.

- Website: https://amitsami.github.io/engTempmail/
- API gateway: https://engtempmail-api.haganubbra.workers.dev
- Developer: [Email](mailto:amitsami110@gmail.com) · [GitHub](https://github.com/amitsami)

## Architecture

Browser → GitHub Pages frontend → Cloudflare API gateway → external email provider.

The email integration is retained. Its upstream URL is configured in the gateway runtime, not embedded in the public repository. GitHub Pages serves the frontend only; the Cloudflare Worker handles API requests and CORS.

## Features

- Create, copy and recover temporary addresses; provider and syntax controls.
- Full-width inbox, rich HTML emails with clickable buttons, safe links and attachments.
- Opt-in 30-second auto refresh, paused when the tab is hidden; provider backoff respected.
- Live availability counts and a **service-wide** received count, not a personal inbox count.
- Lightweight press ripples, hover feedback, loading indicators, copy confirmation and non-layout-shifting notifications. Reduced-motion preferences disable decorative animation.
- Responsive mobile layout and keyboard-visible focus.

## Deploy the API gateway

Use Node 22+ and Cloudflare Wrangler:

```sh
npm install --global wrangler
wrangler login
wrangler deploy --config worker/wrangler.toml
```

Before serving provider requests, configure these Worker runtime variables in Cloudflare **Settings → Variables and Secrets**:

| Variable | Value |
| --- | --- |
| `ALLOWED_ORIGIN` | Your frontend origin, e.g. `https://amitsami.github.io` (no repository path or trailing slash). |
| `EMAIL_PROVIDER_BASE` | The existing provider's HTTPS API base URL. Keep the current deployment value when updating. |

The provider base must be HTTPS, without credentials, query parameters or a fragment. The gateway fails closed with HTTP 503 if the runtime value is absent or invalid. Set it before replacing a working deployment. Never commit private API credentials.

For CLI deployments, supply the provider variable explicitly, or configure Wrangler to preserve existing dashboard variables. This repository deliberately does not hardcode it.

Set the deployed gateway origin in `site/config.js`:

```js
window.ENGTEMPMAIL_CONFIG = {
  apiBase: 'https://engtempmail-api.your-subdomain.workers.dev'
};
```

Do not add `/api` to `apiBase`.

## Deploy the website

1. Push this repository to GitHub.
2. Open **Settings → Pages → Source → GitHub Actions**.
3. The included `.github/workflows/pages.yml` publishes `site/` on pushes to `main`.
4. The workflow's deployment URL is your website URL. All asset paths are repository-relative.

## API contract

The gateway uses the existing provider contract: account and stats GET endpoints, a check POST endpoint accepting `{ "email": "..." }`, and attachment downloads. Inbox responses contain `data` arrays; rich messages use `bodyContentType: "html"` and `body`.

Only supported routes and parameters are forwarded. It is not an open proxy. The gateway validates addresses, restricts browser origins, limits requests conservatively per runtime isolate, and forwards upstream retry instructions. CORS is not authentication or a global abuse-prevention system.

## Safety and limitations

- No frontend mail-count cap is imposed, but **unlimited delivery, storage or availability is not guaranteed**. Provider quotas, expiry and fair-use policies apply.
- HTML is sanitized with bundled DOMPurify before rendering in an isolated sandbox. Email scripts, forms, event handlers and unsafe URL schemes are blocked. Safe links open separately.
- Remote images are blocked until requested because they can track readers. Safe raster inline/CID images are supported.
- Disposable inboxes are not private, permanent mailboxes. Avoid banking, sensitive accounts and permanent account recovery.
- Generated addresses and API success do not guarantee that a sender will deliver an email.

## Tests

```sh
npm test
```

Worker tests cover CORS, route/input validation, runtime provider configuration, large-number precision, backoff and attachment headers. Browser QA should also cover mobile overflow, clipboard feedback, keyboard focus, reduced motion and real email-button rendering after deployment.

## Third-party license

DOMPurify's license is retained at `site/vendor/DOMPurify-LICENSE.txt`. Do not remove third-party software notices.
