export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { prompt } = req.body;
    const key = process.env.GROQ_API_KEY;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are Roty's AI. Respond in organized Markdown. If asked to write code, use triple backticks." },
                    { role: "user", content: prompt }
                ]
            })
        });

        const data = await response.json();
        res.status(200).json({ text: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Groq Connection Failed" });
    }
}