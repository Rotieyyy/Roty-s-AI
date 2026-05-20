export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: "API Key is missing in Vercel settings." });
    }

    // Using the STABLE v1 endpoint and the standard gemini-1.5-flash model
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            // This will show us the EXACT reason from Google (e.g., API_KEY_INVALID)
            return res.status(data.error.code || 400).json({ 
                error: `Google says: ${data.error.message} (Code: ${data.error.status})` 
            });
        }

        if (data.candidates && data.candidates[0].content.parts[0].text) {
            res.status(200).json(data);
        } else {
            res.status(500).json({ error: "The AI returned an empty response." });
        }

    } catch (error) {
        res.status(500).json({ error: "Network Error: " + error.message });
    }
}
