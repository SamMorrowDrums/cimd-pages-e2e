import http from "node:http";

// A real loopback (127.0.0.1) HTTP server acting as the native app's OAuth
// redirect target, per RFC 8252. Captures exactly one callback and resolves
// with its query parameters.
export function startLoopbackCallback(port = 0) {
  let resolveCallback;
  const received = new Promise((resolve) => {
    resolveCallback = resolve;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("cimd-flow-test: callback received, you may close this window.");
    resolveCallback(Object.fromEntries(url.searchParams.entries()));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(Number(port), "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        received,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
