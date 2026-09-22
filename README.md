# cimd-pages-e2e

A small, honestly-scoped **pilot** of "CIMD as a service on GitHub Pages":
you open a GitHub Issue naming your experimental local/loopback app and its
redirect URI, and a GitHub Actions workflow publishes an
[OAuth Client ID Metadata Document](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)
(CIMD) for it on this repo's Pages site. You get back a stable `client_id`
URL for your app — no fork, no cloning, no editing JSON, no enabling Pages
yourself.

**Who this is for:** developers running an experimental CLI/local app against
a real OAuth authorization server, who currently have no easy way to host
their own client identity and end up copy-pasting someone else's public
`client_id`. This gives *your* app its own identity in about the time it
takes to open an issue. It is **not** for hosted/production agents or
services — if you can host a web app, you can host your own `client.json`
directly; this pilot exists specifically to lower the bar for loopback-only
experiments. It does not, and cannot, prevent impersonation — PKCE and CIMD
both assume a client identifies itself honestly. The goal is to make doing
the right thing easier than copying someone else's identity, not to police
who claims what.

## Using it (pilot)

1. Have a GitHub account (no write access to this repo needed).
2. Open a new issue using the **"CIMD client request (pilot)"** template,
   filling in an app name and a loopback redirect URI
   (`http://127.0.0.1:PORT/...`, `http://localhost:PORT/...`, or
   `http://[::1]:PORT/...`).
3. A workflow validates the input, commits a metadata document under
   `clients/`, comments the resulting `client_id` URL on your issue, and
   closes it. This typically takes under a minute once GitHub Pages has
   picked up the change (see `STEPS.md` for measured latency).
4. Use that URL as your OAuth client's `client_id`. Reuse the same URL for
   every run of that experiment — you don't provision a new one per user or
   per session, only per distinct experimental app.

**Pilot limits, stated plainly:**
- Provisioning is currently restricted to an allow-listed GitHub actor
  (see `.github/workflows/cimd-provision.yml`). It is not open to arbitrary
  members of the public yet; the workflow is written so that limit is a
  single line to widen, not a redesign.
- Only loopback redirect URIs are accepted.
- There is no PR review step — publishing goes straight to `main` so Pages
  serves the document immediately.
- This proves a GitHub-only, no-extra-infrastructure pattern (Issues +
  Actions + Pages). It is a pilot/proof, not a hardened public multi-tenant
  service.

## What's in this repo

- `.github/ISSUE_TEMPLATE/cimd-request.yml` — the request form.
- `.github/workflows/cimd-provision.yml` — validates the issue and publishes
  the metadata document.
- `scripts/provision.js` — the (data-only, non-executing) parser/validator.
- `clients/` — published Client ID Metadata Documents, one per request.
- `flow-test/` — a real, executable end-to-end OAuth test: PKCE S256,
  loopback callback, and [`oidc-provider`](https://github.com/panva/node-oidc-provider)
  (a maintained OAuth/OIDC authorization server library with **native
  support for draft-ietf-oauth-client-id-metadata-document-02**) fetching a
  real, live client document from this repo's Pages site. See
  `flow-test/README.md`.
- `STEPS.md` — a concise, timestamped log of what was actually run and
  observed while building and testing this.

## Limitations / non-goals

- This is a hosted-metadata convenience, not an identity or trust system.
  A URL-based `client_id` proves you control that URL; it proves nothing
  about who the app "is" or what it will do with tokens.
- CIMD does not replace real authorization-server trust decisions
  (consent screens, scoping, redirect allow-listing) — it only removes the
  need for out-of-band client pre-registration.
