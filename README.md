# cimd-pages-e2e

A small, real, working example of an **OAuth Client ID Metadata Document
(CIMD)** hosted on GitHub Pages, plus an executable end-to-end test that
proves a real authorization server can fetch it and complete a full
authorization code + PKCE flow with it.

CIMD (`draft-ietf-oauth-client-id-metadata-document-02`) lets a public
client's `client_id` **be** an HTTPS URL that resolves directly (no
redirects) to a small JSON document describing the client — instead of the
client needing to pre-register with every authorization server it talks
to. See the [draft spec](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt).

## The idea: host your own, don't reuse someone else's

If you're building a local or loopback OAuth client (a CLI tool, a
desktop/native app, a quick script) and need a `client_id`, **host your own
one-file `client.json` on GitHub Pages** rather than copying a `client_id`
URL from someone else's public example. It costs nothing, takes a couple
of minutes, and means the identity in front of an authorization server is
actually yours.

This repo is not a hosting service, a provisioning API, or an allow-list —
it's just an example you can copy.

## Live example

- **Metadata URL (`client_id`)**: https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
- **Source**: [`client.json`](./client.json)

```json
{
  "client_id": "https://sammorrowdrums.github.io/cimd-pages-e2e/client.json",
  "client_name": "cimd-pages-e2e example client",
  "redirect_uris": ["http://127.0.0.1:8765/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "application_type": "native"
}
```

Per the spec, the `client_id` field **must exactly match** the URL an
authorization server fetches it from (scheme, host, path, everything) —
whatever you host this at, edit `client_id` in the file to match exactly.

## Host your own in ~3 steps

1. **Copy `client.json`** into a repo of your own (this repo, a fork of it,
   or any existing repo/website you already have) and edit it:
   - `client_id`: the exact final HTTPS URL you're about to publish it at
     (no redirects allowed — if unsure, curl it after publishing, see below).
   - `redirect_uris`: your app's real loopback redirect(s), e.g.
     `http://127.0.0.1:<port>/callback`. Use a port your app actually
     listens on.
   - `client_name`: whatever you want your app to be called.
   - `token_endpoint_auth_method: "none"` is correct for a public client
     with no secret (loopback/native apps can't keep secrets).
2. **Publish it.** If you don't already have a website:
   - Push the file to a GitHub repo, then enable Pages: repo **Settings →
     Pages → Deploy from a branch**, pick `main` / root. No Actions
     workflow is required for a static file like this.
   - Add an empty `.nojekyll` file at the repo root (see [Gotcha](#gotcha-nojekyll)
     below) or the file may silently 404.
   - If you already have a website, just add the JSON file there instead —
     any static host that serves exact bytes with a stable URL works.
3. **Verify it's actually correct** before pointing any AS at it:

   ```sh
   curl -is https://<your-host>/client.json | head -20
   ```

   Check for:
   - `HTTP/2 200` (a **direct** 200 — CIMD forbids following redirects)
   - `content-type: application/json` (or similar `+json`)
   - the `client_id` field in the body is **byte-for-byte** the URL you
     just curled

## Gotcha: `.nojekyll`

GitHub Pages runs Jekyll by default, which silently **excludes any file or
directory whose name starts with an underscore** from the published site —
we hit this in testing (see `STEPS.md`). An empty `.nojekyll` file at the
repo root disables that processing and is good practice for any
static-JSON Pages site, underscore-prefixed or not.

## End-to-end proof: `flow-test/`

[`flow-test/`](./flow-test) is a real, executable test — not just a curl
check. It runs [`oidc-provider`](https://www.npmjs.com/package/oidc-provider)
v9.12.2 (a maintained, real authorization server implementation with native
CIMD support) locally, and drives:

- a genuine HTTPS fetch of this repo's live `/client.json` from GitHub
  Pages,
- a full authorization code + PKCE (S256) flow against it, with a real
  127.0.0.1 loopback callback server,
- a real token exchange,
- a real protected-resource request with the resulting access token,
- three negative cases: `client_id`/document mismatch, an unregistered
  redirect URI, and a wrong PKCE verifier — all correctly rejected.

See [`flow-test/README.md`](./flow-test/README.md) to run it yourself, and
[`STEPS.md`](./STEPS.md) for the actual timestamped log and output from the
last real run.

## Real third-party interop: `linear-interop-test/`

[`linear-interop-test/`](./linear-interop-test) goes one step further:
a real, **interactive** authorization code + PKCE flow against
[Linear's](https://linear.app) live, independently-operated production MCP
server (`https://mcp.linear.app`), using this repo's live `/client.json`
as `client_id`. A human logs into their own Linear account and approves a
real consent screen that shows this client's name and redirect URI —
proof that Linear's production authorization server fetched and rendered
the hosted CIMD document — followed by a real token exchange and an
authenticated MCP `initialize` call. See its
[README](./linear-interop-test/README.md) and the dated entry in
[`STEPS.md`](./STEPS.md) for the exact evidence. This is one real,
named interoperability result, not a claim about CIMD support generally.

## Limitations

- `flow-test/`'s authorization server is a real library run locally for
  the test, with a test-only auto-approving login/consent screen — it is
  **not** a claim of interoperability between two independently-operated
  production services. It shows one maintained implementation of the CIMD
  draft working against a real, live, publicly-hosted document.
  `linear-interop-test/` is the separate, real external-AS proof.
- CIMD only authenticates the **document's fetch URL**, not the app
  presenting it. Nothing here (PKCE included) proves who wrote the code
  running on your machine — it only reduces the incentive to reuse
  someone else's public loopback client identity by making hosting your
  own effectively free.
- The draft is still in progress (`-02`, dated July 2026) and some
  authorization servers may not implement it at all, or may restrict
  cross-origin/loopback redirects per §8.1.
