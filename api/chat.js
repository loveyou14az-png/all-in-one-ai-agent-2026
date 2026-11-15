module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is missing" });
    }

    const question = req.body && req.body.question;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model + ":generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: (data.error && data.error.message) || "Gemini API error"
      });
    }

    const parts =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) || [];

    const answer = parts.map(p => p.text || "").join("\n").trim();

    if (!answer) {
      return res.status(500).json({ error: "AI returned no text response" });
    }

    return res.status(200).json({ answer: answer });
  } catch (error) {
    console.error("AI Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};