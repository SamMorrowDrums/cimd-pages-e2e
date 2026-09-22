# Host your own OAuth client identity in one JSON file

If you're building a local CLI, script, or desktop app that does an OAuth
authorization code flow (loopback redirect, e.g.
`http://127.0.0.1:PORT/callback`), you need a `client_id`. Here's how to
get one that's actually yours, in four steps.

This uses **Client ID Metadata Documents (CIMD)** — your `client_id` is
just an HTTPS URL that points to a small JSON file describing your client.
No registration forms, no dashboards, no approval queue.

## How you do it

1. **Create a repo.** Any public GitHub repo works. If your agent or app
   already has its own public GitHub repo, **just add `client.json` there
   — you don't need a separate repo.**
2. **Add `client.json` at the repo root:**

   ```json
   {
     "client_id": "https://USERNAME.github.io/REPO/client.json",
     "client_name": "My App",
     "redirect_uris": ["http://127.0.0.1:PORT/callback"],
     "token_endpoint_auth_method": "none",
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"]
   }
   ```

   Set `client_id` to the *exact* URL this file will be published at,
   `client_name` to whatever you want your app called, and
   `redirect_uris` to the loopback address your app actually listens on.
3. **Enable GitHub Pages**: repo **Settings → Pages → Deploy from a
   branch → `main` / root**. No build step, no Actions workflow needed.
   Works from a private repo too if you're on GitHub Pro, Team, or
   Enterprise (not Free) — the published Pages site is fully public
   either way, so your `client.json` is reachable while your source
   stays private.
4. **Use `https://USERNAME.github.io/REPO/client.json` as your OAuth
   `client_id`.**

That's it — no separate hosting, no provisioning service, no waiting.

## Where this is accepted today

CIMD (`client_id_metadata_document_supported: true`) is live and working
right now against these authorization servers:

- **Linear** (`mcp.linear.app`)
- **Cloudflare** (`mcp.cloudflare.com`)
- **Grafana** (`mcp.grafana.com`)
- **Notion** (`mcp.notion.com`)
- **Canva** (`mcp.canva.com`)
- **Sentry** (`mcp.sentry.dev`)

## Live example from this repo

- `client.json` in this repo: [`client.json`](./client.json)
- Published at: https://sammorrowdrums.github.io/cimd-pages-e2e/client.json

```sh
curl -is https://sammorrowdrums.github.io/cimd-pages-e2e/client.json
```

## Further reading in this repo

- [`flow-test/`](./flow-test) — a scripted local test proving the full
  authorization code + PKCE flow, run against a real CIMD-supporting AS
  implementation.
- [`linear-interop-test/`](./linear-interop-test) — a real interactive
  run against Linear's production MCP server.
- [`STEPS.md`](./STEPS.md) — the detailed, timestamped verification log
  behind the claims above.
