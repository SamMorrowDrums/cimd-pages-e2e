#!/usr/bin/env node
// Parses a CIMD-request issue body (from .github/ISSUE_TEMPLATE/cimd-request.yml),
// strictly validates the two fields, and writes a Client ID Metadata Document
// under clients/. Never executes user input; every field is treated as inert
// data and constrained by an allow-list regex before it touches a filename,
// JSON value, or git-committed byte.
"use strict";

const fs = require("fs");
const path = require("path");

const PAGES_BASE = "https://sammorrowdrums.github.io/cimd-pages-e2e";
const MAX_APP_NAME = 40;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function fail(message) {
  console.error(`::error::${message}`);
  fs.writeFileSync(process.env.GITHUB_OUTPUT || "/dev/null", `error=${message}\n`, {
    flag: "a",
  });
  process.exit(1);
}

function extractField(body, label) {
  // Issue-form bodies render as: "### Label\n\nvalue\n\n### Next label\n..."
  const re = new RegExp(`### ${label}\\s*\\n\\n([\\s\\S]*?)(?:\\n\\n###|$)`, "i");
  const m = body.match(re);
  if (!m) return "";
  return m[1].trim();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";
}

function validateAppName(name) {
  if (!name) return fail("app_name is required");
  if (name.length > MAX_APP_NAME) return fail("app_name exceeds 40 characters");
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
    return fail("app_name contains disallowed characters (only letters, numbers, spaces, - and _ allowed)");
  }
  return name;
}

function validateRedirectUri(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail(`redirect_uri is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:") {
    return fail("redirect_uri must use the http scheme (loopback redirects per RFC 8252)");
  }
  const hostname = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return fail(`redirect_uri host must be 127.0.0.1, localhost or [::1] (got ${hostname})`);
  }
  if (raw.includes("..") || /\s/.test(raw)) {
    return fail("redirect_uri contains disallowed characters");
  }
  return url.toString();
}

function main() {
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueBody = process.env.ISSUE_BODY || "";
  const issueActor = process.env.ISSUE_ACTOR || "";

  if (!/^[0-9]+$/.test(String(issueNumber))) {
    return fail("missing/invalid issue number");
  }

  const rawAppName = extractField(issueBody, "App name");
  const rawRedirect = extractField(issueBody, "Loopback redirect URI");

  const appName = validateAppName(rawAppName);
  const redirectUri = validateRedirectUri(rawRedirect);

  const slug = slugify(appName);
  const fileName = `${issueNumber}-${slug}.json`;
  // Defence in depth: filename must stay a bare name inside clients/.
  if (fileName.includes("/") || fileName.includes("..")) {
    return fail("computed filename escaped the clients/ directory");
  }
  const relPath = path.join("clients", fileName);
  const clientId = `${PAGES_BASE}/${relPath}`;

  const doc = {
    client_id: clientId,
    client_name: appName,
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "native",
  };

  fs.mkdirSync("clients", { recursive: true });
  fs.writeFileSync(relPath, JSON.stringify(doc, null, 2) + "\n", { encoding: "utf8" });

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(
      out,
      [
        `client_id=${clientId}`,
        `file_path=${relPath}`,
        `app_name=${appName}`,
        `redirect_uri=${redirectUri}`,
        `provisioned_by=${issueActor}`,
      ].join("\n") + "\n"
    );
  }
  console.log(`Provisioned ${clientId} for issue #${issueNumber} (requested by ${issueActor})`);
}

main();
