export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { prompt } = req.body;
    const key = process.env.GROQ_API_KEY;

    if (!key) return res.status(500).json({ error: "Groq Key missing in Vercel." });

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.1-8b-instant",
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ error: data.error.message });
        }

        // Groq uses OpenAI format: data.choices[0].message.content
        res.status(200).json({ text: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Groq Engine Error: " + error.message });
    }
}
