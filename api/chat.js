export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set in Vercel." });
  }

  const model = (process.env.GEMINI_MODEL || "gemini-flash-latest").trim();

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "No message provided." });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: message }] }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: data?.error?.message || "Gemini request failed." });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "No response received.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}