export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "AI request failed"
      });
    }
const answer = (data.output || [])
  .filter(item => item.type === "message")
  .flatMap(item => item.content || [])
  .filter(item => item.type === "output_text")
  .map(item => item.text)
  .join("\n");
const answer = (data.output || [])
  .filter(item => item.type === "message")
  .flatMap(item => item.content || [])
  .filter(item => item.type === "output_text")
  .map(item => item.text)
  .join("\n");

return res.status(200).json({ answer });

  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}