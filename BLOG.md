# Give your loopback OAuth client its own identity in one JSON file

If you've ever built a local CLI tool or desktop app that needs to do an
OAuth authorization code flow, you've probably run into this: public
clients using a loopback redirect (`http://127.0.0.1:<port>/callback`)
usually can't hold a secret, and pre-registering with every authorization
server you might talk to is friction nobody wants. A common shortcut is to
copy a `client_id` from someone else's public example project. That works,
but it means your app is quietly using an identity it doesn't own.

**Client ID Metadata Documents (CIMD)** — currently
[draft-ietf-oauth-client-id-metadata-document-02](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)
— offer a neat alternative: your `client_id` *is* an HTTPS URL, and that
URL resolves directly (no redirects) to a small JSON document describing
your client (name, redirect URIs, grant types, auth method). An
authorization server that supports the draft fetches the document at
authorization time instead of requiring you to pre-register.

The friction this removes only matters if hosting your own document is
actually easy. So: [`cimd-pages-e2e`](https://github.com/SamMorrowDrums/cimd-pages-e2e)
is one JSON file, checked into a repo, published with plain GitHub Pages
(branch deploy, no Actions workflow needed), with a live URL you can curl:

```sh
curl -is https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
```

To back the claim with something more than a curl check, the repo also
includes an executable end-to-end test (`flow-test/`) that runs a real,
maintained authorization server implementation
([`oidc-provider`](https://www.npmjs.com/package/oidc-provider) v9.12.2,
which has native CIMD support) locally, and drives a genuine authorization
code + PKCE (S256) flow, loopback callback, token exchange, and protected
resource call against the live hosted document — plus three negative
cases (mismatched `client_id`, unregistered redirect, wrong PKCE
verifier) to check the rejections actually happen. See `STEPS.md` in the
repo for the real, timestamped run log.

As a further, separate check, the same hosted `client.json` was used in a
real interactive login against [Linear's](https://linear.app) live public
MCP server (`mcp.linear.app`) — a real, independently-operated production
authorization server, not a local test harness. A human logged into their
own Linear account, saw a genuine consent screen naming this client and
its redirect URI (proof Linear's AS actually fetched the hosted document),
approved it, and the flow completed a real token exchange and an
authenticated MCP call. One real external implementation, one real data
point — not a claim that CIMD support is widespread yet.

This doesn't prove who wrote the code calling itself that client — PKCE
and CIMD don't do app attestation. What it does is make hosting *your
own* loopback client identity cheap enough that there's no reason to keep
borrowing someone else's.
