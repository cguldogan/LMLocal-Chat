// Pairing by QR code: the phone tells this app its address and key, so nobody types them.
//
// 1. The app listens on a random port and shows a QR code holding its own address(es)
//    and a one-time token: locallm-pair:v1?a=192.168.1.20:51234,100.90.1.2:51234&t=<token>
// 2. The phone (Local LM ▸ Settings ▸ Serve to other devices ▸ Pair the desktop app) scans it and
//    POSTs { urls, key, device } to http://<address>/pair with "Authorization: Bearer <token>".
// 3. The app checks it can reach the phone at one of those URLs, answers the phone with the
//    outcome, and stops listening. It stops anyway after a few minutes.

const http = require("http");
const os = require("os");
const crypto = require("crypto");
const qrcode = require("qrcode-generator");

const PAIRING_MINUTES = 5;
const MAX_BODY = 16 * 1024;

/** This computer's addresses the phone can reach: private IPv4 and Tailscale, Wi-Fi-like first. */
function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal && isPrivate(a.address)) found.push(a.address);
    }
  }
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("100.") ? 3 : 2);
  return [...new Set(found)].sort((x, y) => rank(x) - rank(y)).slice(0, 4);
}

function isPrivate(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return false;
  return p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127); // Tailscale / carrier-grade NAT
}

const peerIsLocal = (remote) => {
  const ip = (remote || "").replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1" || isPrivate(ip);
};

function tokenMatches(header, token) {
  const given = Buffer.from(String(header || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/** The first of the phone's URLs that answers with this key, as a base URL without /v1. */
async function firstReachable(urls, key) {
  let keyRejected = false;
  for (const url of urls) {
    const base = url.replace(/\/+$/, "").replace(/\/v1$/, "");
    try {
      const res = await fetch(base + "/v1/models", {
        headers: key ? { Authorization: "Bearer " + key } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { base };
      if (res.status === 401) keyRejected = true;
    } catch {
      // Not reachable at this address; try the next.
    }
  }
  return { keyRejected };
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Starts listening and returns { code, svg }. onEvent gets
 * { type: "paired", baseUrl, key, device } | { type: "unreachable", message } | { type: "expired" }.
 * Call the returned stop() to cancel.
 */
async function startPairing(onEvent) {
  const addresses = lanAddresses();
  if (!addresses.length) {
    throw new Error("This computer isn't on a network the phone can reach. Connect to Wi-Fi or Tailscale and try again.");
  }
  const token = crypto.randomBytes(18).toString("base64url");
  let done = false;
  let timer = null;

  const server = http.createServer((req, res) => {
    if (!peerIsLocal(req.socket.remoteAddress)) return send(res, 403, { error: { message: "Not on this network." } });
    if (req.method !== "POST" || req.url !== "/pair") return send(res, 404, { error: { message: "Not found." } });
    if (!tokenMatches(req.headers.authorization, token)) return send(res, 401, { error: { message: "This QR code isn't the current one. Scan the code on screen again." } });
    if (done) return send(res, 409, { error: { message: "Already paired." } });

    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) req.destroy();
    });
    req.on("end", async () => {
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: { message: "Bad request." } }); }
      const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, 8) : [];
      const key = typeof body.key === "string" ? body.key : "";
      const device = typeof body.device === "string" ? body.device.slice(0, 80) : "your phone";
      if (!urls.length) return send(res, 400, { error: { message: "No phone address was sent." } });

      const found = await firstReachable(urls, key);
      if (done) return send(res, 409, { error: { message: "Already paired." } });
      if (!found.base) {
        const message = found.keyRejected
          ? "LocalLM Chat reached the phone, but the key was refused. Try pairing again."
          : "LocalLM Chat couldn't reach the phone. Check that both are on the same Wi-Fi, or both on Tailscale.";
        onEvent({ type: "unreachable", message });
        return send(res, 422, { error: { message } });
      }
      done = true;
      send(res, 200, { ok: true, baseUrl: found.base });
      onEvent({ type: "paired", baseUrl: found.base, key, device });
      stop();
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const port = server.address().port;

  function stop() {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections?.();
  }
  timer = setTimeout(() => {
    if (!done) onEvent({ type: "expired" });
    stop();
  }, PAIRING_MINUTES * 60 * 1000);

  const code = `locallm-pair:v1?a=${addresses.map((a) => `${a}:${port}`).join(",")}&t=${token}`;
  const qr = qrcode(0, "M");
  qr.addData(code);
  qr.make();
  return { code, svg: qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true }), stop };
}

module.exports = { startPairing, lanAddresses, isPrivate };
