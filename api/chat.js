export default async function handler(req, res) {
    // 1. Extract prompt, history, AND the new image data
    const { prompt, history = [], image } = req.body; 
    const key = process.env.GROQ_API_KEY;

    // 2. CLEANUP: Strip massive Base64 image tags out of the history so we don't crash the API token limit
    const cleanHistory = history.map(msg => ({
        role: msg.role,
        content: msg.content.replace(/<img[^>]*>/g, '[User Uploaded an Image]') 
    }));

    // 3. Format the current message specifically for Vision capabilities
    let currentMessageContent;
    if (image) {
        // This array format is required by AI vision models
        currentMessageContent = [
            { type: "text", text: prompt || "Describe this image in detail." },
            { type: "image_url", image_url: { url: image } }
        ];
    } else {
        currentMessageContent = prompt;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                // 4. DYNAMIC ENGINE: Use Vision model if there's an image, otherwise use the fast Text model
                model: image ? "llama-3.2-11b-vision-preview" : "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are Roty's AI. Respond in clear, organized Markdown. You have vision capabilities." },
                    ...cleanHistory, 
                    { role: "user", content: currentMessageContent }
                ]
            })
        });
        
        const data = await response.json();
        
        // Catch Groq-specific errors gracefully
        if (data.error) throw new Error(data.error.message);

        res.status(200).json({ text: data.choices[0].message.content });
    } catch (e) {
        console.error("Groq API Error:", e);
        res.status(500).json({ error: "Failed to communicate with Roty Engine." });
    }
}
