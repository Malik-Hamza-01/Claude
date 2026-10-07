// Jarvis Day Engine: local server. No dependencies, Node 18+.
// Serves the app and proxies AI calls to the Anthropic API so the key never reaches the browser.
//   ANTHROPIC_API_KEY=sk-ant-... node server.js   ->  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODELS = {
  quick: process.env.JARVIS_MODEL_QUICK || "claude-haiku-4-5-20251001",
  default: process.env.JARVIS_MODEL || "claude-sonnet-5-5",
};
const MAX_TOKENS = { quick: 2048, default: 16000 };
const STATIC = { "/": "index.html", "/index.html": "index.html", "/claude-shim.js": "claude-shim.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function sample(req, res) {
  if (!KEY) { res.writeHead(503).end("ANTHROPIC_API_KEY is not set on the server."); return; }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { res.writeHead(400).end("Bad request"); return; }
  if (typeof body.prompt !== "string" || !body.prompt) { res.writeHead(400).end("Missing prompt"); return; }
  const tier = body.modelTier === "quick" ? "quick" : "default";

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELS[tier], max_tokens: MAX_TOKENS[tier], stream: true,
      messages: [{ role: "user", content: body.prompt }] }),
  }).catch(e => ({ ok: false, status: 502, text: async () => String(e.message || e) }));

  if (!upstream.ok) {
    const msg = await upstream.text();
    console.error("Anthropic API error", upstream.status, msg.slice(0, 500));
    res.writeHead(502).end("AI request failed (" + upstream.status + ")");
    return;
  }

  // Re-emit the SSE stream as newline-delimited JSON the shim can read.
  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
  const send = obj => res.write(JSON.stringify(obj) + "\n");
  const dec = new TextDecoder(); let buf = "", stop = null;
  try {
    for await (const chunk of upstream.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send({ t: ev.delta.text });
        else if (ev.type === "message_delta" && ev.delta.stop_reason) stop = ev.delta.stop_reason;
        else if (ev.type === "error") send({ error: ev.error && ev.error.message || "stream error" });
      }
    }
    send({ done: true, stop });
  } catch (e) {
    send({ error: String(e.message || e) });
  }
  res.end();
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ai: !!KEY }));
    } else if (url.pathname === "/api/sample" && req.method === "POST") {
      await sample(req, res);
    } else if (STATIC[url.pathname]) {
      const file = path.join(__dirname, STATIC[url.pathname]);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] });
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404).end("Not found");
    }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end("Server error");
  }
}).listen(PORT, HOST, () => {
  console.log(`Jarvis running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  if (!KEY) console.log("AI features off: set ANTHROPIC_API_KEY to turn them on.");
});
