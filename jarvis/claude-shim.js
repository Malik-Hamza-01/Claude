/* Stand-in for the Claude artifact runtime (window.claude.use) when Jarvis runs
   from server.js instead of inside claude.ai.
   - "sample"    -> AI calls go through the local server's /api/sample endpoint
   - "downloads" -> files are saved with a normal browser download
   - "db"/"user" -> not available, so the app keeps its data in localStorage */
(function () {
  if (window.claude && window.claude.use) return;   // running inside Claude: use the real runtime

  function fail(code, text) { const e = new Error(text || code); e.code = code; if (text) e.text = text; return e; }

  async function call(prompt, opts = {}) {
    let res;
    try {
      res = await fetch("/api/sample", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelTier: opts.modelTier || "default" }) });
    } catch (e) { throw fail("network", "Can't reach the Jarvis server."); }
    if (!res.ok || !res.body) throw fail(res.status === 503 ? "sampling_disabled" : "api_error", await res.text().catch(() => ""));

    // Server streams newline-delimited JSON: {"t":"chunk"} … {"done":true,"stop":"end_turn"} or {"error":"…"}
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", stop = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.error) throw fail("api_error", text || ev.error);
        if (ev.t) { text += ev.t; if (opts.onText) opts.onText({ text }); }
        if (ev.done) stop = ev.stop;
      }
    }
    return { text, truncated: stop === "max_tokens" };
  }

  function parseJson(text) {
    const s = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(s); } catch (e) {}
    const m = s.match(/[\[{][\s\S]*[\]}]/);           // fall back to the first JSON-looking block
    if (m) return JSON.parse(m[0]);
    throw fail("bad_json", "Reply wasn't valid JSON.");
  }

  const sample = (prompt, opts) => call(prompt, opts);
  sample.json = async (prompt, opts = {}) => parseJson((await call(prompt, { ...opts, onText: null })).text);

  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename || "download" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };

  window.claude = {
    async use(name) {
      if (name === "sample") {
        const h = await fetch("/api/health").then(r => r.json()).catch(() => ({}));
        if (!h.ai) throw fail("sampling_disabled");      // no API key: app falls back to manual entry
        return sample;
      }
      if (name === "downloads") return downloads;
      return null;                                       // db, user: app uses localStorage
    }
  };
})();
