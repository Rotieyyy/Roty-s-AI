export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: "API Key is missing in Vercel Environment Variables" });
    }

    // UPDATED: Using gemini-1.5-pro for maximum intelligence
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${key}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 64,
                    maxOutputTokens: 8192,
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(400).json({ error: data.error.message });
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to Roty Pro Engine: " + error.message });
    }
}
