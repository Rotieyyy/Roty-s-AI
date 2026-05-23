export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt } = req.body || {};
        const key = process.env.GROQ_API_KEY;

        if (!key) {
            return res.status(500).json({ error: "Missing GROQ_API_KEY" });
        }

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                temperature: 0.3,
                max_tokens: 15,
                messages: [
                    {
                        role: "system",
                        content: "Summarize the user's input into a concise, punchy title for a chat history sidebar. Maximum 4 words. Respond ONLY with the title, no quotes, no extra text."
                    },
                    {
                        role: "user",
                        content: prompt.substring(0, 1000)
                    }
                ]
            })
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(response.status).json({ error: "Title generation failed." });
        }

        const data = await response.json();
        let title = data?.choices?.[0]?.message?.content?.trim() || "New Chat";
        title = title.replace(/^["']|["']$/g, '');

        return res.status(200).json({ title });

    } catch (e) {
        console.error("Title API Error:", e);
        return res.status(500).json({ error: "Internal server error." });
    }
}
