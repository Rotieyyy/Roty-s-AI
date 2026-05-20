export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: "API Key is missing in Vercel. Please add it to Environment Variables." });
    }

    // CHANGED: Using v1beta which is the most compatible with 1.5-flash on the Free Tier
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // Check for errors from Google
        if (data.error) {
            return res.status(400).json({ error: data.error.message });
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Connection error: " + error.message });
    }
}
