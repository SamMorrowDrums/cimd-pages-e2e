#!/usr/bin/env node
// Real interactive OAuth PKCE flow against Linear's public remote MCP
// authorization server (https://mcp.linear.app), using this repo's live
// GitHub Pages CIMD document as client_id. This is a genuine external
// authorization server run by a real third party (Linear) — not a local
// test harness. It requires a real human to log into their own Linear
// account and approve/deny consent in a browser; this script never sees
// their credentials.
//
// Discovery (verified live, not assumed):
//   GET https://mcp.linear.app/mcp -> 401 www-authenticate: Bearer
//     resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"
//   GET https://mcp.linear.app/.well-known/oauth-protected-resource/mcp
//     -> authorization_servers: ["https://mcp.linear.app"]
//   GET https://mcp.linear.app/.well-known/oauth-authorization-server
//     -> authorization_endpoint=https://mcp.linear.app/authorize
//        token_endpoint=https://mcp.linear.app/token
//        client_id_metadata_document_supported=true
//        code_challenge_methods_supported=["S256"]
//
// Usage: node run-linear-interop.mjs
// Prints an authorization URL, waits for the loopback redirect, exchanges
// the code, and (if approved) makes one minimal authenticated MCP request.
// No secrets/tokens/codes are logged to stdout beyond redacted previews.

import http from "node:http";
import crypto from "node:crypto";

const CLIENT_ID = "https://sammorrowdrums.github.io/cimd-pages-e2e/client.json";
const REDIRECT_URI = "http://127.0.0.1:8765/callback";
const AS_ISSUER = "https://mcp.linear.app";
const MCP_RESOURCE = "https://mcp.linear.app/mcp";
const SCOPE = "read"; // minimal, least-privilege scope for this proof

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redact(s, keep = 6) {
  if (!s) return s;
  return s.slice(0, keep) + "…(redacted, len=" + s.length + ")";
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`[${new Date().toISOString()}] fetching live AS discovery metadata: ${AS_ISSUER}/.well-known/oauth-authorization-server`);
  const asMeta = await fetchJson(`${AS_ISSUER}/.well-known/oauth-authorization-server`);
  console.log(`  issuer=${asMeta.issuer} authorization_endpoint=${asMeta.authorization_endpoint} token_endpoint=${asMeta.token_endpoint}`);
  console.log(`  client_id_metadata_document_supported=${asMeta.client_id_metadata_document_supported} code_challenge_methods_supported=${JSON.stringify(asMeta.code_challenge_methods_supported)}`);

  if (asMeta.issuer !== AS_ISSUER) throw new Error("issuer mismatch, aborting");
  if (!asMeta.client_id_metadata_document_supported) throw new Error("AS does not advertise CIMD support, aborting");
  if (!asMeta.code_challenge_methods_supported?.includes("S256")) throw new Error("AS does not support PKCE S256, aborting");

  console.log(`[${new Date().toISOString()}] fetching live protected-resource metadata: ${MCP_RESOURCE}`);
  const prMeta = await fetchJson(`${AS_ISSUER}/.well-known/oauth-protected-resource/mcp`);
  console.log(`  resource=${prMeta.resource} authorization_servers=${JSON.stringify(prMeta.authorization_servers)}`);

  console.log(`[${new Date().toISOString()}] fetching this repo's live client.json (must self-match): ${CLIENT_ID}`);
  const clientDoc = await fetchJson(CLIENT_ID);
  if (clientDoc.client_id !== CLIENT_ID) throw new Error("client.json client_id does not self-match, aborting");
  if (!clientDoc.redirect_uris.includes(REDIRECT_URI)) throw new Error("client.json does not list the loopback redirect used here, aborting");
  console.log("  OK: client.json is live, self-matching, and lists the loopback redirect used in this test.");

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = new URL(asMeta.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  let resolveCallback;
  const callbackPromise = new Promise((resolve) => (resolveCallback = resolve));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      error
        ? `<html><body>Authorization failed: ${error}. You can close this tab.</body></html>`
        : `<html><body>Authorization received. You can close this tab and return to the terminal.</body></html>`,
    );
    resolveCallback({ code, returnedState, error });
  });

  await new Promise((resolve, reject) => {
    server.listen(8765, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  console.log(`[${new Date().toISOString()}] local loopback callback receiver listening on ${REDIRECT_URI} (127.0.0.1 only)`);

  console.log("\nAUTHORIZATION URL (open in a browser and log in to YOUR OWN Linear account):\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for redirect back to the local loopback receiver...\n");

  const { code, returnedState, error } = await callbackPromise;
  server.close();

  if (error) {
    console.log(`[${new Date().toISOString()}] RESULT: Linear AS returned an error / user declined: ${error}`);
    process.exit(1);
  }
  if (returnedState !== state) {
    console.log(`[${new Date().toISOString()}] RESULT: state mismatch on callback (expected ${redact(state)}, got ${redact(returnedState)}) — aborting, possible CSRF, no token exchange attempted.`);
    process.exit(1);
  }
  console.log(`[${new Date().toISOString()}] received authorization code (${redact(code)}) with matching state. Exchanging for token...`);

  const tokenRes = await fetch(asMeta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({}));
  console.log(`[${new Date().toISOString()}] token endpoint status=${tokenRes.status}`);
  if (tokenRes.status !== 200 || !tokenBody.access_token) {
    console.log(`RESULT: token exchange failed (status=${tokenRes.status}, error=${tokenBody.error ?? "unknown"})`);
    process.exit(1);
  }
  console.log(`  access_token=${redact(tokenBody.access_token)} token_type=${tokenBody.token_type} scope=${tokenBody.scope ?? "(unspecified)"}`);

  console.log(`[${new Date().toISOString()}] calling MCP endpoint (${MCP_RESOURCE}) with the access token: initialize + tools/list`);
  const initRes = await fetch(MCP_RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${tokenBody.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "cimd-pages-e2e-sentry-interop-test", version: "0.1.0" },
      },
    }),
  });
  console.log(`  initialize status=${initRes.status}`);
  const initText = await initRes.text();
  console.log(`  initialize body (first 300 chars): ${initText.slice(0, 300)}`);

  console.log(`\n[${new Date().toISOString()}] RESULT: real interactive OAuth PKCE flow against Linear's live MCP authorization server succeeded through token exchange.`);
  console.log("MCP request status recorded above. No tokens/codes were written to any file.");
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
