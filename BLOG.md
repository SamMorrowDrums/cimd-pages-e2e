# Give your loopback OAuth client its own identity in one JSON file

If you've built a local CLI, script, or desktop app that does an OAuth
authorization code flow, you've hit this before: a loopback redirect
(`http://127.0.0.1:<port>/callback`) can't hold a secret, and copying a
`client_id` from someone else's public example is the common shortcut —
except then your app is using an identity it doesn't own.

**Client ID Metadata Documents (CIMD)** fix this: your `client_id` *is* an
HTTPS URL, pointing to a small JSON file describing your client. Host it
yourself, and it's genuinely yours.

Here's the whole recipe:

1. Create a repo (or reuse your app's existing public one).
2. Add a `client.json` at the root with your `client_id` (the exact URL
   it will be published at), `client_name`, `redirect_uris` (your
   loopback address), and `token_endpoint_auth_method: "none"`.
3. Enable GitHub Pages (Settings → Pages → Deploy from a branch → main /
   root).
4. Use `https://USERNAME.github.io/REPO/client.json` as your OAuth
   `client_id`.

That's it. [`cimd-pages-e2e`](https://github.com/SamMorrowDrums/cimd-pages-e2e)
is exactly this, live:

```sh
curl -is https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
```

It's accepted today by Linear, Cloudflare, Grafana, Notion, Canva, and
Sentry — real authorization servers, verified live. The repo also
includes an executable end-to-end test (`flow-test/`) and a real
interactive run against Linear's production MCP server
(`linear-interop-test/`), both driving a genuine authorization code + PKCE
(S256) flow, loopback callback, and token exchange against the live
hosted document.

Hosting your own identity is now cheap enough that there's no reason to
keep borrowing someone else's.
