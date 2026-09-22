# Give your local experiment its own OAuth identity (pilot)

*Draft only — not published externally. Written after an actual, timed
end-to-end test; see `STEPS.md` for the full evidence and limitations this
post intentionally doesn't repeat in full.*

If you've ever hacked together a local CLI or loopback app that needs to
talk to a real OAuth API, you've probably hit the same wall: registering a
`client_id` usually means hosting something, and hosting something is more
setup than a quick experiment deserves — so it's tempting to just reuse
someone else's public `client_id`. That's not great for them or for you.

[OAuth Client ID Metadata Documents (CIMD)](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.txt)
fix the underlying problem: your `client_id` can just be a URL to a small
JSON file describing your app. No pre-registration with the authorization
server, no dynamic client registration dance — the AS fetches your
metadata and trusts what it says. You still need to host that one JSON
file, though.

This pilot removes even that step, for the specific case of an
experimental local/loopback app, using only GitHub Issues, Actions, and
Pages — nothing else to run or pay for:

1. Open an issue with your app's name and its `http://127.0.0.1:PORT/...`
   redirect URI.
2. A workflow validates it and publishes a CIMD document to this repo's
   Pages site.
3. You get a `client_id` URL back as a comment, closing the issue —
   **11–13 seconds** in our test run.

Use that URL as your client_id, keep your app and its callback on
loopback, and reuse the same identity for every run of that experiment.

**The honest caveats:** this is a pilot gated to an allow-listed GitHub
account while the abuse/lifecycle model gets worked out — it is not yet
open to the general public. You'll also wait an extra, variable stretch
(tens of seconds to a couple of minutes, in our tests) for GitHub Pages to
actually serve the new file after the workflow finishes. And a GitHub
account is a hard prerequisite. None of this prevents someone from lying
about who they are — it just makes hosting your *own* honest identity as
easy as copying someone else's.
