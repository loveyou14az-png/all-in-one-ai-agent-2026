const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v, d) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

function friendly(status, detail) {
  if (status === 401 || status === 403 || /api key/i.test(detail || ""))
    return "Server API key problem. Please check GEMINI_API_KEY.";
  if (status === 400) return "Invalid request sent to the AI model.";
  if (status === 404) return "AI model name not found. Check GEMINI_MODEL.";
  if (status === 429) return "Too many requests or quota reached. Please try again shortly.";
  return "The AI service is busy right now. Please try again in a moment.";
}

async function callGemini(model, payload, apiKey, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let data = {};
    try { data = await r.json(); } catch {}
    return { status: r.status, data };
  } catch (e) {
    return { status: e.name === "AbortError" ? 504 : 502, data: {} };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const primary = (process.env.GEMINI_MODEL || "gemini-flash-latest").trim();
  const fallback = (process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest").trim();

  // Diagnostics: open /api/chat?models=1 in browser (never shows the key)
  if (req.method === "GET") {
    const out = { keyConfigured: !!apiKey, primary, fallback };
    if (apiKey && req.query && req.query.models) {
      try {
        const r = await fetch(`${API_BASE}/models?pageSize=100`, {
          headers: { "x-goog-api-key": apiKey },
        });
        const d = await r.json();
        out.listStatus = r.status;
        out.availableModels = (d.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => m.name.replace("models/", ""));
        if (!r.ok) out.error = d?.error?.message;
      } catch {
        out.error = "Could not reach Gemini.";
      }
    }
    return res.status(200).json(out);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set in Vercel." });
  }

  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const message = (
      body.question || body.message || body.prompt || body.text || ""
    ).toString().trim();

    if (!message) {
      return res.status(400).json({ error: "No message provided." });
    }

    const payload = { contents: [{ role: "user", parts: [{ text: message }] }] };
    const sys = (process.env.GEMINI_SYSTEM_PROMPT || "").trim();
    if (sys) payload.systemInstruction = { parts: [{ text: sys }] };

    const maxRetries = num(process.env.GEMINI_MAX_RETRIES, 2);
    const budget = num(process.env.GEMINI_TOTAL_BUDGET_MS, 9000);
    const started = Date.now();
    const models = [...new Set([primary, fallback])];
    let last = { status: 503, data: {} };

    outer:
    for (let mi = 0; mi < models.length; mi++) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const left = budget - (Date.now() - started);
        if (left < 1500) break outer;

        const r = await callGemini(models[mi], payload, apiKey, Math.min(left, 8000));
        last = r;

        if (r.status === 200) {
          const text = (r.data?.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || "").join("").trim();
          const reply = text || "No response received.";    if (apiKey && req.query && req.query.test) {
      const test = async (m) => {
        const t0 = Date.now();
        const r = await callGemini(
          m,
          { contents: [{ role: "user", parts: [{ text: "Hello" }] }] },
          apiKey,
          9000
        );
        return {
          model: m,
          status: r.status,
          ms: Date.now() - t0,
          message: r.data?.error?.message || (r.status === 200 ? "OK" : "no detail"),
        };
      };
      out.test = await Promise.all([primary, fallback].map(test));
    }
          return res.status(200).json({
            answer: reply,
            reply,
            model: models[mi],
            fallbackUsed: mi > 0,
          });
        }

        console.error(
          `Gemini model=${models[mi]} status=${r.status} attempt=${attempt + 1} ${r.data?.error?.message || ""}`
        );

        if (r.status === 404) break;                    // wrong model name -> try next model
        if (!RETRYABLE.has(r.status)) break outer;      // 400/401/403: retry is useless
        if (attempt < maxRetries) {
          await sleep(Math.min(500 * 2 ** attempt, 4000) + Math.random() * 300);
        }
      }
    }

    const msg = friendly(last.status, last.data?.error?.message);
    const status = last.status >= 400 && last.status < 600 ? last.status : 503;
    return res.status(status).json({ error: msg, answer: msg, reply: msg, upstreamStatus: last.status });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
}