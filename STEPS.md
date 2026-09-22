# STEPS.md — evidence log

Real commands run against this repo's live GitHub Pages site and the
executable `flow-test/` on **2026-09-22**, after simplifying the repo to a
single self-hosted `client.json` (no provisioning service). All output
below is copied verbatim except secrets/tokens (there are none — the AS
issues them in-memory to a loopback test client, and no output here
contains them).

## 1. Publish and verify the live document

```sh
git push origin HEAD:main
```
→ pushed commit `75e6460` to `main` (no `.github/workflows` remain in this
repo, so a normal HTTPS push worked — no `ssh://` workaround needed this
time).

```sh
curl -is https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
```

- First 2 polls (`09:31:51Z`, `09:32:07Z`): `HTTP/2 404` — Pages still
  serving the previous build.
- Poll 3 (`09:32:22Z`, ~35s after push): `HTTP/2 200`,
  `content-type: application/json; charset=utf-8`, body:

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

  `client_id` in the body is byte-for-byte identical to the URL fetched —
  the CIMD self-match requirement holds.

## 2. Verify the negative-case fixture is live too

```sh
curl -is https://sammorrowdrums.github.io/cimd-pages-e2e/test-fixtures/mismatch-client.json
```
→ `HTTP/2 200`, `content-type: application/json; charset=utf-8`, body's
`client_id` field points at `.../test-fixtures/does-not-exist.json` —
deliberately not the fetch URL, for the mismatch negative test.

## 3. Confirm old provisioning-era URLs are gone

```sh
curl -s -o /dev/null -w "status=%{http_code}\n" \
  https://sammorrowdrums.github.io/cimd-pages-e2e/clients/1-cimd-flow-test-alpha.json
```
→ `status=404` (expected — `clients/` was removed from `main` in this
refactor).

## 4. Run the real end-to-end OAuth test

Environment: Node `v22.23.2`, `oidc-provider@9.12.2` (native
`draft-ietf-oauth-client-id-metadata-document-02` support), local test-only
authorization server (`flow-test/server.mjs`), real loopback HTTP callback
server (`flow-test/loopback.mjs`).

```sh
cd flow-test && npm install && node run-flow-test.mjs
```

Real output:

```
[2026-09-22T09:32:37.322Z] fetching real hosted CIMD document: https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
PASS — CIMD fetch: 200 + client_id self-match (status=200 content-type=application/json; charset=utf-8)
local test AS (oidc-provider) issuer: http://127.0.0.1:34013
PASS — Positive: authorization redirected to registered loopback with a code
PASS — Positive: token exchange with correct PKCE verifier succeeds (status=200)
PASS — Positive: protected resource request with access token succeeds (status=200)
PASS — Negative: client_id / hosted-document mismatch is rejected (status=400)
PASS — Negative: unregistered redirect_uri is rejected (no redirect issued) (status=400)
PASS — Negative: wrong PKCE verifier is rejected (no token issued) (status=400 error=invalid_grant)

7/7 checks passed.
```

(`oidc-provider` also prints its standard startup WARNING/NOTICE lines
about the in-memory dev adapter, dev signing keys, and default TTL/error
functions — expected and harmless for a local test AS, omitted here for
brevity; see the tool's own docs if reproducing.)

## Result

- Live metadata URL: `https://sammorrowdrums.github.io/cimd-pages-e2e/client.json`
  — direct HTTP 200, `application/json`, exact `client_id` self-match.
- Real AS (`oidc-provider` v9.12.2, native CIMD support) fetched it and
  completed authorization code + PKCE (S256) + loopback callback + token
  exchange + protected resource request, all genuinely executed, not
  mocked.
- All 3 negative cases correctly rejected: mismatched `client_id`,
  unregistered redirect, wrong PKCE verifier. No tokens or codes leaked in
  any rejection path.
- 7/7 checks passed.

## Known limitation (still true)

GitHub Pages defaults to Jekyll processing, which silently drops any
file/directory starting with `_` from the published site (found while
testing the earlier provisioning-era mismatch fixture, which lived at
`clients/_test-mismatch.json` and 404'd even after a successful Pages
build). Fix: an empty `.nojekyll` file at the repo root. Still present and
still needed in this repo, independent of the provisioning-service
removal.

## 5. Real interactive interop test against a named third-party AS (Linear)

Everything above uses a local `oidc-provider` instance driven
non-interactively. This section is a separate, additional test against a
**real, independently-operated, production authorization server**:
Linear's public remote MCP server at `https://mcp.linear.app`.

Discovery, fetched live on **2026-09-22** (not assumed):

```
GET https://mcp.linear.app/mcp
→ 401, www-authenticate: Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"

GET https://mcp.linear.app/.well-known/oauth-protected-resource/mcp
→ authorization_servers: ["https://mcp.linear.app"]

GET https://mcp.linear.app/.well-known/oauth-authorization-server
→ authorization_endpoint=https://mcp.linear.app/authorize
  token_endpoint=https://mcp.linear.app/token
  client_id_metadata_document_supported=true
  code_challenge_methods_supported=["S256"]
```

Real run (`linear-interop-test/run-linear-interop.mjs`), a genuine human
approval required at step 3:

1. Script confirmed the live `/client.json` self-matches and lists the
   loopback redirect used (`http://127.0.0.1:8765/callback`).
2. Started a loopback-only HTTP receiver on `127.0.0.1:8765`.
3. Printed a real authorization URL (PKCE S256, random `state`,
   `client_id` = this repo's Pages URL). A human opened it, logged into
   their own Linear account, and **saw Linear's real consent screen
   showing this client's name and exact redirect URI** — i.e. Linear's
   production AS fetched and rendered the hosted CIMD document. They
   clicked Approve.
4. Real redirect landed on the loopback receiver:
   `received authorization code (b896e7…redacted, len=86) with matching state`.
5. Real token exchange: `token endpoint status=200`,
   `access_token=b896e7…redacted, len=86 token_type=bearer scope=read`.
6. Real authenticated MCP request: `initialize status=200`, body began
   `{"result":{"protocolVersion":"2024-11-05", ...,
   "serverInfo":{"name":"Linear MCP","version":"1.0.0", ...}}}`.

One benign hiccup during the run: a manual `curl` diagnostic against the
loopback port (checking it was listening) accidentally consumed the
one-shot callback receiver with no `code`/`state`, correctly triggering
the script's state-mismatch abort with **no token exchange attempted**
(fail-safe behavior worked as intended). The transaction was restarted
fresh (new PKCE pair, new state) and completed as recorded above without
further interference.

**Scope of this result**: one real, named, external authorization server
(Linear, `mcp.linear.app`) performing a genuine CIMD fetch + full OAuth
PKCE + MCP handshake against this repo's live hosted `client.json`. This
is a real interoperability data point with one real implementation — not
a claim that all/most authorization servers support CIMD, and not an
endorsement of or affiliation with Linear. No tokens, codes, or secrets
were committed to git or written to disk.
