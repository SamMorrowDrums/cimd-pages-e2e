# linear-interop-test

A real, executable, **interactive** OAuth PKCE flow against
[Linear's](https://linear.app) live, publicly-operated remote MCP server
(`https://mcp.linear.app/mcp`), using this repo's live GitHub Pages
`client.json` as the CIMD `client_id`.

Unlike `flow-test/` (which runs a local `oidc-provider` instance for a
fully scripted, non-interactive proof), this test talks to a **real,
independently-operated, production authorization server run by a third
party**. It requires a human to actually log into their own Linear
account and click Approve/Deny in a browser — this script never sees
their credentials, and stops if declined.

## What was verified (2026-09-22)

Discovery (fetched live, not assumed):

- `GET https://mcp.linear.app/mcp` → `401` with
  `www-authenticate: Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"`
- `GET https://mcp.linear.app/.well-known/oauth-protected-resource/mcp` →
  `authorization_servers: ["https://mcp.linear.app"]`
- `GET https://mcp.linear.app/.well-known/oauth-authorization-server` →
  `authorization_endpoint=https://mcp.linear.app/authorize`,
  `token_endpoint=https://mcp.linear.app/token`,
  **`client_id_metadata_document_supported: true`**,
  `code_challenge_methods_supported: ["S256"]`.

Flow executed and confirmed real:

1. Script fetched this repo's live `/client.json` and confirmed it
   self-matches and lists the loopback redirect used.
2. Started a loopback HTTP receiver on `127.0.0.1:8765` only.
3. Built the real authorization URL (`client_id` = this repo's Pages URL,
   PKCE S256, random `state`) and a human opened it, logged into their own
   Linear account, and saw Linear's real consent screen showing this
   client's name and the exact loopback redirect — i.e. **Linear's
   production authorization server fetched and rendered the hosted CIMD
   document**.
4. Human clicked Approve. Real redirect landed on the loopback receiver
   with a matching `state` and a real authorization code.
5. Real token exchange at `https://mcp.linear.app/token` returned
   `200` with a real `access_token` (`token_type: bearer`, `scope: read`).
6. A real authenticated MCP `initialize` request to
   `https://mcp.linear.app/mcp` returned `200` with a genuine MCP server
   response identifying itself (`serverInfo.name: "Linear MCP"`,
   `version: "1.0.0"`).

## Running it yourself

```sh
node run-linear-interop.mjs
```

Requires a real Linear account to approve the consent screen. Prints the
authorization URL to open, waits for the loopback redirect, exchanges the
code, and makes one MCP `initialize` call. No secrets are written to disk;
tokens/codes are redacted in stdout.

## Scope note

This demonstrates a **named, real, external authorization server**
(`mcp.linear.app`, operated by Linear) performing a genuine CIMD fetch and
completing a full OAuth PKCE + MCP handshake against this repo's hosted
`client.json`. It is one real interoperability data point with one real
implementation — not a claim that all/most authorization servers support
CIMD, and not an endorsement of or affiliation with Linear.
