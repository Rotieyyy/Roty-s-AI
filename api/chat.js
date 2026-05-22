export default async function handler(req, res) {
    // 1. Extract both the new prompt AND the history array
    const { prompt, history = [] } = req.body; 
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
                    // 2. Set the AI's persona
                    { role: "system", content: "You are Roty's AI. Respond in clear, organized Markdown. Use professional language." },
                    
                    // 3. Inject the entire conversation memory here
                    ...history, 
                    
                    // 4. Add the user's brand new message at the very end
                    { role: "user", content: prompt }
                ]
            })
        });
        
        const data = await response.json();
        res.status(200).json({ text: data.choices[0].message.content });
    } catch (e) {
        console.error("Groq API Error:", e);
        res.status(500).json({ error: "Failed to communicate with Roty Engine." });
    }
}