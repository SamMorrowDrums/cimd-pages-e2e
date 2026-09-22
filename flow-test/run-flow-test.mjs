// Executable end-to-end CIMD test: real oidc-provider AS, real PKCE S256,
// real loopback callback, real fetch of live GitHub-Pages-hosted client
// metadata documents. See README.md for what each case proves.
import crypto from "node:crypto";
import { startAuthorizationServer } from "./server.mjs";
import { startLoopbackCallback } from "./loopback.mjs";

const CLIENT_ID =
  process.env.CLIENT_ID ||
  "https://sammorrowdrums.github.io/cimd-pages-e2e/client.json";
const MISMATCH_CLIENT_ID =
  process.env.MISMATCH_CLIENT_ID ||
  "https://sammorrowdrums.github.io/cimd-pages-e2e/test-fixtures/mismatch-client.json";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function fetchDoc(url) {
  const res = await fetch(url);
  const status = res.status;
  const contentType = res.headers.get("content-type");
  let json = null;
  if (status === 200) json = await res.json();
  return { url, status, contentType, json };
}

/**
 * Drives an authorization request through our auto-approving interaction
 * handler purely by following redirects + cookies (no headless browser
 * needed since login/consent complete on GET, per server.mjs).
 */
async function runAuthorization({ authorizationEndpoint, params, loopbackPrefix }) {
  let cookies = new Map();
  function cookieHeader() {
    return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  function absorb(res) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const idx = pair.indexOf("=");
      cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }

  let url = `${authorizationEndpoint}?${new URLSearchParams(params).toString()}`;
  for (let hop = 0; hop < 15; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { cookie: cookieHeader() } });
    absorb(res);
    if (res.status >= 300 && res.status < 400) {
      const location = new URL(res.headers.get("location"), url).toString();
      if (location.startsWith(loopbackPrefix)) {
        return { finalUrl: location };
      }
      url = location;
      continue;
    }
    // Terminal, non-redirect response (e.g. a rejected request rendered as
    // an error page/JSON instead of a redirect).
    const body = await res.text().catch(() => "");
    return { status: res.status, body: body.slice(0, 500) };
  }
  throw new Error("too many redirects while driving authorization request");
}

async function main() {
  console.log(`[${new Date().toISOString()}] fetching real hosted CIMD document: ${CLIENT_ID}`);
  const doc = await fetchDoc(CLIENT_ID);

  record(
    "CIMD fetch: 200 + client_id self-match",
    doc.status === 200 && doc.json?.client_id === CLIENT_ID,
    `status=${doc.status} content-type=${doc.contentType}`,
  );

  const redirectUriA = doc.json.redirect_uris[0];
  const loopback = await startLoopbackCallback(new URL(redirectUriA).port);

  const as = await startAuthorizationServer();
  console.log(`local test AS (oidc-provider) issuer: ${as.issuer}`);

  try {
    // --- Positive path -----------------------------------------------
    const pkce1 = pkcePair();
    const state1 = crypto.randomUUID();
    const auth1 = await runAuthorization({
      authorizationEndpoint: as.authorizationEndpoint,
      loopbackPrefix: redirectUriA,
      params: {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: redirectUriA,
        scope: "openid",
        state: state1,
        code_challenge: pkce1.challenge,
        code_challenge_method: "S256",
      },
    });
    let positiveCode = null;
    if (auth1.finalUrl) {
      const q = new URL(auth1.finalUrl).searchParams;
      positiveCode = q.get("code");
      record(
        "Positive: authorization redirected to registered loopback with a code",
        Boolean(positiveCode) && q.get("state") === state1,
      );
    } else {
      record("Positive: authorization redirected to registered loopback with a code", false, `status=${auth1.status}`);
    }

    let accessToken = null;
    if (positiveCode) {
      const tokenRes = await fetch(as.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: positiveCode,
          redirect_uri: redirectUriA,
          client_id: CLIENT_ID,
          code_verifier: pkce1.verifier,
        }),
      });
      const tokenBody = await tokenRes.json().catch(() => ({}));
      accessToken = tokenBody.access_token || null;
      record(
        "Positive: token exchange with correct PKCE verifier succeeds",
        tokenRes.status === 200 && Boolean(accessToken),
        `status=${tokenRes.status}`,
      );
    } else {
      record("Positive: token exchange with correct PKCE verifier succeeds", false, "no code from authorization step");
    }

    if (accessToken) {
      const meRes = await fetch(as.userinfoEndpoint, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const meBody = await meRes.json().catch(() => ({}));
      record(
        "Positive: protected resource request with access token succeeds",
        meRes.status === 200 && Boolean(meBody.sub),
        `status=${meRes.status}`,
      );
    } else {
      record("Positive: protected resource request with access token succeeds", false, "no access token");
    }

    // --- Negative: client_id document mismatch ------------------------
    const pkceM = pkcePair();
    const authMismatch = await runAuthorization({
      authorizationEndpoint: as.authorizationEndpoint,
      loopbackPrefix: redirectUriA,
      params: {
        response_type: "code",
        client_id: MISMATCH_CLIENT_ID,
        redirect_uri: redirectUriA,
        scope: "openid",
        state: crypto.randomUUID(),
        code_challenge: pkceM.challenge,
        code_challenge_method: "S256",
      },
    });
    const mismatchRejected =
      !authMismatch.finalUrl && authMismatch.status >= 400 && authMismatch.status < 500;
    record(
      "Negative: client_id / hosted-document mismatch is rejected",
      mismatchRejected,
      authMismatch.finalUrl ? `unexpectedly redirected to ${authMismatch.finalUrl}` : `status=${authMismatch.status}`,
    );

    // --- Negative: unregistered redirect_uri --------------------------
    const pkceR = pkcePair();
    const wrongRedirect = redirectUriA.replace(/\/callback$/, "/not-registered");
    const authBadRedirect = await runAuthorization({
      authorizationEndpoint: as.authorizationEndpoint,
      loopbackPrefix: wrongRedirect,
      params: {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: wrongRedirect,
        scope: "openid",
        state: crypto.randomUUID(),
        code_challenge: pkceR.challenge,
        code_challenge_method: "S256",
      },
    });
    const redirectRejected =
      !authBadRedirect.finalUrl && authBadRedirect.status >= 400 && authBadRedirect.status < 500;
    record(
      "Negative: unregistered redirect_uri is rejected (no redirect issued)",
      redirectRejected,
      authBadRedirect.finalUrl ? "unexpectedly redirected" : `status=${authBadRedirect.status}`,
    );

    // --- Negative: wrong PKCE verifier ---------------------------------
    const pkce2 = pkcePair();
    const state2 = crypto.randomUUID();
    const auth2 = await runAuthorization({
      authorizationEndpoint: as.authorizationEndpoint,
      loopbackPrefix: redirectUriA,
      params: {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: redirectUriA,
        scope: "openid",
        state: state2,
        code_challenge: pkce2.challenge,
        code_challenge_method: "S256",
      },
    });
    const code2 = auth2.finalUrl ? new URL(auth2.finalUrl).searchParams.get("code") : null;
    if (code2) {
      const wrongVerifier = b64url(crypto.randomBytes(32));
      const tokenRes2 = await fetch(as.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code2,
          redirect_uri: redirectUriA,
          client_id: CLIENT_ID,
          code_verifier: wrongVerifier,
        }),
      });
      const tokenBody2 = await tokenRes2.json().catch(() => ({}));
      record(
        "Negative: wrong PKCE verifier is rejected (no token issued)",
        tokenRes2.status !== 200 && !tokenBody2.access_token,
        `status=${tokenRes2.status} error=${tokenBody2.error || "n/a"}`,
      );
    } else {
      record("Negative: wrong PKCE verifier is rejected (no token issued)", false, "could not obtain a code to test against");
    }
  } finally {
    await loopback.close();
    await as.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
