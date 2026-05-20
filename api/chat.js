export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: "API Key is missing in Vercel settings." });
    }

    // This is the specific URL for Gemini 1.5 Pro on the Free Tier
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                }
            })
        });

        const data = await response.json();

        // If Pro fails (sometimes Google limits Free tier access), it returns an error
        if (data.error) {
            return res.status(400).json({ 
                error: "Google AI Studio says: " + data.error.message 
            });
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Roty Pro Engine Connection Failed: " + error.message });
    }
}
