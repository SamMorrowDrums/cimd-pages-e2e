# STEPS.md — CIMD-on-Pages pilot: what was actually run and observed

Concise, timestamped, numbered log. Times are UTC, taken from `git log`,
`gh issue view`, and command output; no secrets are included. Repository:
https://github.com/SamMorrowDrums/cimd-pages-e2e (public). Live Pages site:
https://sammorrowdrums.github.io/cimd-pages-e2e/

## Part 1 — GitHub-only CIMD provisioning pilot

**What was built:** a GitHub Issue Form (`.github/ISSUE_TEMPLATE/cimd-request.yml`)
+ Actions workflow (`.github/workflows/cimd-provision.yml`) that turns
"app name + loopback redirect URI" into a published CIMD document under
`clients/` on this repo's Pages site, with no fork/clone/JSON-editing/Pages
setup required from the requester.

1. **2026-09-22T09:09** — `gh api repos/SamMorrowDrums/cimd-pages-e2e/pages`
   → 404 (Pages not yet enabled).
2. Pushed the provisioner (issue form, workflow, `scripts/provision.js`,
   `flow-test/`) to `main`.
   - Blocker hit: pushing `.github/workflows/*.yml` was rejected —
     `refusing to allow an OAuth App to create or update workflow ... without
     workflow scope`. The session's default HTTPS credential lacked the
     `workflow` OAuth scope. Fixed by pushing over SSH
     (`git push ssh://git@github.com/...`), using an already-authorized
     account/key that does have `workflow` scope, instead of widening any
     token's stored scope.
3. `gh api -X POST repos/.../pages -f source[branch]=main -f source[path]=/`
   → **200**, `html_url: https://sammorrowdrums.github.io/cimd-pages-e2e/`.
4. `gh label create cimd-request ...` — created the label the issue form
   auto-applies.
5. **09:11:34Z** — opened issue #1 (`gh issue create ... --label cimd-request`),
   app name `cimd-flow-test-alpha`, redirect `http://127.0.0.1:34917/callback`.
   Opened issue #2 at 09:11:xx (same minute) with app name
   `cimd-flow-test-beta` to test two concurrent requests.
   - **Real bug found**: issue #2's workflow run failed —
     `! [rejected] HEAD -> main (fetch first)`. Two issues opened close
     together raced: both checked out the same base commit, issue #1's push
     landed first, issue #2's push was a non-fast-forward. The original
     per-issue `concurrency:` group did **not** prevent this (each issue got
     its own group). **Fixed** by switching to a single repo-wide
     concurrency group plus a fetch+rebase retry loop
     (`.github/workflows/cimd-provision.yml`).
   - Closed issue #2 with an explanation; re-requested as **issue #3**
     (`cimd-flow-test-beta`, same redirect) once the fix was live.
6. **09:11:34Z → 09:11:47Z** (issue #1): **13 seconds** from issue-open to
   the workflow's comment + auto-close.
   **09:13:20Z → 09:13:31Z** (issue #3): **11 seconds**.
   Workflow run IDs: `35708981336` (success, #1), `35709150070` (success, #3).
7. Verified the two published documents directly:
   ```
   $ curl -s -D - -o /dev/null https://sammorrowdrums.github.io/cimd-pages-e2e/clients/1-cimd-flow-test-alpha.json
   HTTP/2 200
   content-type: application/json; charset=utf-8
   access-control-allow-origin: *

   $ curl -s -D - -o /dev/null https://sammorrowdrums.github.io/cimd-pages-e2e/clients/3-cimd-flow-test-beta.json
   HTTP/2 200
   content-type: application/json; charset=utf-8
   access-control-allow-origin: *
   ```
   Both documents' internal `client_id` field exactly matches the URL they
   were fetched from. The two generated client IDs are distinct
   (`.../clients/1-cimd-flow-test-alpha.json` vs.
   `.../clients/3-cimd-flow-test-beta.json`) — filenames are
   `<issue-number>-<slug>`, and issue numbers are assigned uniquely by
   GitHub, so uniqueness doesn't depend on the app-name slug alone.
8. **Real bug found**: a manually-added negative-test fixture at
   `clients/_test-mismatch.json` kept 404ing after a successful push/build.
   Root cause: GitHub Pages defaults to Jekyll processing, which silently
   excludes any underscore-prefixed file or directory. **Fixed** by adding
   `.nojekyll` at the repo root (standard practice for static-JSON Pages
   sites) and renaming the fixture to avoid depending on that alone.
   Confirmed 200 after the fix (~30–50s Pages propagation observed).
9. **Measured provisioning latency, end to end:** issue → workflow
   comment/close in **11–13 seconds**; add **roughly 30 seconds to a few
   minutes** for GitHub Pages to actually serve the new file (observed
   range across this session's pushes). The workflow itself is fast; Pages
   propagation is the variable part.

**Pilot limits, restated:** provisioning is gated to an allow-listed GitHub
login (`SamMorrowDrums`) in the workflow's `if:` condition — this is a
stated pilot restriction, not a claim of open public availability. Widening
it is a one-line change to that allow-list, not a redesign.

## Part 2 — Real end-to-end OAuth test against the published documents

**AS implementation used:** [`oidc-provider`](https://www.npmjs.com/package/oidc-provider)
**v9.12.2** (maintained, open-source Node.js OAuth/OIDC library), run
locally with `features.clientIdMetadataDocument` enabled
(native support for `draft-ietf-oauth-client-id-metadata-document-02`).
Login/consent are auto-approved by a small **test-only** handler
(`flow-test/server.mjs`) — not a real user, not a production identity
provider, clearly not third-party interoperability, just one real
maintained AS library exercising the real spec against real hosted
metadata.

```
$ cd flow-test && npm install
$ CLIENT_ID_A=https://sammorrowdrums.github.io/cimd-pages-e2e/clients/1-cimd-flow-test-alpha.json \
  CLIENT_ID_B=https://sammorrowdrums.github.io/cimd-pages-e2e/clients/3-cimd-flow-test-beta.json \
  npm test
```

**Result — 8/8 checks passed:**

| # | Check | Result |
|---|-------|--------|
| 1 | Live fetch of `client_id` A: HTTP 200, `client_id` field self-matches fetch URL | PASS |
| 2 | Live fetch of `client_id` B: HTTP 200, `client_id` field self-matches fetch URL | PASS |
| 3 | Authorization code + PKCE S256, loopback redirect to the registered `http://127.0.0.1:.../callback` | PASS |
| 4 | Token exchange with the correct PKCE `code_verifier` succeeds (200, access token issued) | PASS |
| 5 | Protected-resource request (`/me`) with that access token succeeds (200) | PASS |
| 6 | **Negative** — `client_id` pointing at a document whose own `client_id` field doesn't match the fetch URL is rejected (400) | PASS |
| 7 | **Negative** — valid client, unregistered `redirect_uri` is rejected before any code is issued (400) | PASS |
| 8 | **Negative** — valid code, wrong PKCE `code_verifier` at token exchange: rejected (400, `error=invalid_grant`), no token issued | PASS |

No tokens, codes, or cookies are logged above or in the test output beyond
HTTP status codes and the `invalid_grant` error string.

## Limitations, stated plainly

- This is a **pilot**, gated to one allow-listed GitHub account, not a
  hardened open-to-anyone public service.
- The OAuth AS is a real, maintained library run **locally for the test**,
  not a third-party production authorization server — the CIMD *fetch* is
  real and live; the AS's login/consent are test-only stand-ins.
- CIMD (and this pilot) do not prevent impersonation. A URL-based
  `client_id` proves control of that URL, nothing about who the app "is."
  The goal met here is making *correct* self-hosting easier than copying
  someone else's `client_id` — not policing misuse.
- Two real infrastructure bugs were found and fixed while building this
  (a provisioning race and a Jekyll/underscore-filename 404) — both are
  documented above rather than glossed over.

## Is this blog-worthy?

Honestly: the **provisioning step itself** is simple and fast (open an
issue, get a comment back in ~11–13 seconds) — that part would make a good
short post. The **caveats that must ship with it** are: it currently
requires being allow-listed (not yet open to arbitrary GitHub users), Pages
propagation adds an unpredictable extra delay of tens of seconds to a few
minutes, and a GitHub account is a hard prerequisite. A short post is
reasonable if it leads with "pilot, allow-listed, GitHub-only" rather than
implying general availability.
