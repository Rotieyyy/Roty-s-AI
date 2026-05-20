// api/chat.js
export default async function handler(req, res) {
    const { prompt } = req.body;
    const key = process.env.GEMINI_API_KEY; // Secret!
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    res.status(200).json(data);
}