// Minimal, test-only OAuth/OIDC authorization server for the CIMD flow test.
// Backed by oidc-provider (real library, not hand-rolled AS logic), with
// draft-ietf-oauth-client-id-metadata-document-02 support enabled natively.
//
// Login/consent are auto-approved server-side (no real UI, no real user) —
// this is explicitly a test harness, not a production identity provider.
import http from "node:http";
import express from "express";
import Provider from "oidc-provider";

export async function startAuthorizationServer({ port = 0 } = {}) {
  const app = express();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const boundPort = server.address().port;
  const issuer = `http://127.0.0.1:${boundPort}`;

  const provider = new Provider(issuer, {
    clients: [],
    features: {
      clientIdMetadataDocument: {
        enabled: true,
        // Draft-02 requires the fetched document's client_id to equal the
        // URL it was fetched from; oidc-provider enforces this itself. We
        // additionally cap cache so repeated test runs re-fetch quickly.
        cacheMaxAge: 5,
      },
    },
    pkce: {
      // Explicit for clarity; this matches oidc-provider's own default for
      // public (token_endpoint_auth_method: none) clients per RFC 9700.
      required: (_ctx, client) => client.tokenEndpointAuthMethod === "none",
    },
    scopes: ["openid", "profile"],
    claims: { profile: ["name"] },
    findAccount(_ctx, sub) {
      return {
        accountId: sub,
        async claims() {
          return { sub, name: "CIMD Flow Test Account" };
        },
      };
    },
    interactions: {
      url(_ctx, interaction) {
        return `/interaction/${interaction.uid}`;
      },
    },
    routes: {
      authorization: "/auth",
    },
  });

  // Auto-approve every interaction: this is the "test-only user
  // login/consent" the task explicitly allows, not a real login screen.
  app.get("/interaction/:uid", async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      const { prompt } = details;
      if (prompt.name === "login") {
        const result = { login: { accountId: "test-user" } };
        await provider.interactionFinished(req, res, result, {
          mergeWithLastSubmission: false,
        });
        return;
      }
      if (prompt.name === "consent") {
        const grant = new provider.Grant({
          accountId: details.session.accountId,
          clientId: details.params.client_id,
        });
        grant.addOIDCScope("openid profile");
        const grantId = await grant.save();
        await provider.interactionFinished(
          req,
          res,
          { consent: { grantId } },
          { mergeWithLastSubmission: true },
        );
        return;
      }
      next(new Error(`unexpected interaction prompt: ${prompt.name}`));
    } catch (err) {
      next(err);
    }
  });

  // A trivial protected resource so the flow ends with something other
  // than "we got a token" — a real authenticated request using it.
  app.get("/me", async (req, res) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    try {
      const accessToken = await provider.AccessToken.find(token);
      if (!accessToken) {
        res.status(401).json({ error: "invalid or expired token" });
        return;
      }
      res.json({ sub: accessToken.accountId, scope: accessToken.scope });
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  });

  app.use(provider.callback());

  return {
    issuer,
    authorizationEndpoint: `${issuer}/auth`,
    tokenEndpoint: `${issuer}/token`,
    userinfoEndpoint: `${issuer}/me`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
