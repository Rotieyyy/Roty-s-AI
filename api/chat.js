export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: "API Key missing in Vercel settings." });
    }

    // List of models to try in order of best to most compatible
    const models = [
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
        "gemini-pro"
    ];

    let lastError = "";

    for (const modelName of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();

            // If this model works, send the response and STOP the loop
            if (response.ok && data.candidates && data.candidates[0].content.parts[0].text) {
                return res.status(200).json(data);
            }
            
            // If it didn't work, save the error and try the next model in the list
            lastError = data.error ? data.error.message : "Unknown error";
            console.log(`Model ${modelName} failed, trying next...`);

        } catch (err) {
            lastError = err.message;
        }
    }

    // If we get here, it means NONE of the models worked
    res.status(400).json({ error: "All free models failed. Last error: " + lastError });
}
