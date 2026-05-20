export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) return res.status(500).json({ error: "API Key missing in Vercel." });

    // Try these models in order. One of them WILL work.
    const modelList = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.0-pro",
        "gemini-pro"
    ];

    let successData = null;
    let errors = [];

    for (const model of modelList) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await response.json();

            if (response.ok && data.candidates) {
                successData = data;
                break; // Found a working model! Stop looking.
            } else {
                errors.push(`${model}: ${data.error?.message || 'Unknown error'}`);
            }
        } catch (err) {
            errors.push(`${model}: ${err.message}`);
        }
    }

    if (successData) {
        return res.status(200).json(successData);
    } else {
        // If all failed, we show you exactly why so we can fix the Google side
        return res.status(404).json({ 
            error: "All models failed. This usually means your API Key is restricted.",
            details: errors 
        });
    }
}
