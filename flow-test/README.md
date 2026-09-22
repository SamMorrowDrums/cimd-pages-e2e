# flow-test

A real, executable end-to-end test: authorization code + PKCE (S256) against
a locally-run [`oidc-provider`](https://www.npmjs.com/package/oidc-provider)
authorization server (v9.12.2), which has **native support for
[draft-ietf-oauth-client-id-metadata-document-02](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)**
(`features.clientIdMetadataDocument`). The AS fetches the client's identity
from a real, live `client_id` URL hosted on this repo's GitHub Pages site —
not a local fixture — so the CIMD fetch step is genuine.

This is **not** a claim of third-party interoperability between two vendors;
it is one maintained open-source AS implementation exercising the spec
against real hosted metadata. The AS is run locally with a test-only
auto-approving login/consent handler (no real user, no production
credentials) — see `server.mjs`. Nothing here contacts a third-party
production auth service.

## What it proves

1. **Positive path**: fetch a real, live CIMD document over HTTPS from
   GitHub Pages; start an authorization code + PKCE (S256) flow with that
   URL as `client_id`; complete a loopback (127.0.0.1) redirect; exchange
   the code for tokens at the AS's token endpoint; call a trivial protected
   resource (the AS's `/me` userinfo-style endpoint) with the access token.
2. **Negative — client_id / document mismatch**: request authorization using
   one hosted document's URL while pointing at a *different* hosted
   document's bytes (the document's internal `client_id` field doesn't match
   the URL it was fetched from). Expect the AS to reject it.
3. **Negative — unregistered redirect**: use a valid, real hosted client but
   present a redirect URI that isn't in its `redirect_uris`. Expect
   rejection before any code is issued.
4. **Negative — wrong PKCE verifier**: complete a real authorization request
   and obtain a real code, then exchange it with an incorrect
   `code_verifier`. Expect the token endpoint to reject it with no token
   issued.

## Running

```sh
npm install
CLIENT_ID_A=https://sammorrowdrums.github.io/cimd-pages-e2e/clients/<file-a>.json \
CLIENT_ID_B=https://sammorrowdrums.github.io/cimd-pages-e2e/clients/<file-b>.json \
npm test
```

`CLIENT_ID_A` and `CLIENT_ID_B` must be two *different* real, already-published
documents (see `STEPS.md` in the repo root for the actual values used).
Results (pass/fail per case, HTTP statuses, no secrets) are printed to
stdout and were copied — redacted — into `STEPS.md`.
