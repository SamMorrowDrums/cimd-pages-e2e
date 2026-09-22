# flow-test

A real, executable end-to-end test: authorization code + PKCE (S256) against
a locally-run [`oidc-provider`](https://www.npmjs.com/package/oidc-provider)
authorization server (v9.12.2), which has **native support for
[draft-ietf-oauth-client-id-metadata-document-02](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)**
(`features.clientIdMetadataDocument`). The AS fetches the client's identity
from `/client.json` at the repo root — a real, live document hosted on this
repo's GitHub Pages site, not a local fixture — so the CIMD fetch step is
genuine.

This is **not** a claim of third-party interoperability between two
vendors; it is one maintained open-source AS implementation exercising the
spec against real hosted metadata. The AS is run locally with a test-only
auto-approving login/consent handler (no real user, no production
credentials) — see `server.mjs`. Nothing here contacts a third-party
production auth service.

## What it proves

1. **Positive path**: fetch the real, live `/client.json` over HTTPS from
   GitHub Pages; start an authorization code + PKCE (S256) flow with that
   URL as `client_id`; complete a loopback (127.0.0.1) redirect; exchange
   the code for tokens at the AS's token endpoint; call a trivial protected
   resource (the AS's `/me` userinfo-style endpoint) with the access token.
2. **Negative — client_id / document mismatch**: request authorization
   using a hosted document (`/test-fixtures/mismatch-client.json`) whose
   internal `client_id` field deliberately does **not** match the URL it
   was fetched from. Expect the AS to reject it.
3. **Negative — unregistered redirect**: use the real client but present a
   redirect URI that isn't in its `redirect_uris`. Expect rejection before
   any code is issued.
4. **Negative — wrong PKCE verifier**: complete a real authorization
   request and obtain a real code, then exchange it with an incorrect
   `code_verifier`. Expect the token endpoint to reject it with no token
   issued.

## Running

```sh
npm install
npm test
```

By default this tests the repo's own published `/client.json`
(`https://sammorrowdrums.github.io/cimd-pages-e2e/client.json`). Set
`CLIENT_ID=<your own published URL>` to test a different one instead.
Results (pass/fail per case, HTTP statuses, no secrets) are printed to
stdout; see `STEPS.md` in the repo root for the actual output from the last
verification run.
