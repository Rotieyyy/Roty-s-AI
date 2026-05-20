export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) return res.status(500).json({ error: "API Key missing in Vercel settings." });

    // We will try Flash 1.5 and Gemini Pro
    const models = ["gemini-1.5-flash", "gemini-pro"];
    let debugInfo = [];

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await response.json();

            if (response.ok && data.candidates) {
                return res.status(200).json(data);
            } else {
                // Save the exact error from Google to show the user
                debugInfo.push(`${model}: ${data.error?.message || 'Unknown Error'}`);
            }
        } catch (err) {
            debugInfo.push(`${model}: ${err.message}`);
        }
    }

    // This will now tell you EXACTLY why Google is mad
    return res.status(400).json({ 
        error: "Google Connection Failed",
        details: debugInfo.join(" | ")
    });
}
