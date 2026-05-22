export default async function handler(req, res) {
    const { prompt, history = [], image } = req.body; 
    const key = process.env.GROQ_API_KEY;

    // 1. SMART ENGINE SWITCHER: Check if we need Vision for the current prompt OR if there is an image anywhere in the history
    const historyHasImage = history.some(msg => msg.content.includes('<img '));
    const useVision = image || historyHasImage;

    // 2. MULTI-TURN MEMORY: Format the history so the AI doesn't get amnesia
    const formattedHistory = history.map(msg => {
        // Look for our image tags in the chat history
        const imgMatch = msg.content.match(/<img[^>]*src="([^"]+)"/);
        
        if (imgMatch) {
            // We found an old image! Extract the base64 data and the text
            const base64Url = imgMatch[1];
            const textOnly = msg.content.replace(/<img[^>]*>/g, '').trim();
            
            // Format it perfectly for Groq's Vision Model
            return {
                role: msg.role,
                content: [
                    { type: "text", text: textOnly || "User uploaded an image." },
                    { type: "image_url", image_url: { url: base64Url } }
                ]
            };
        } else {
            // It's just a normal text message
            return { role: msg.role, content: msg.content };
        }
    });

    // 3. Format the current new message
    let currentMessageContent;
    if (image) {
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
                // Automatically use the smarter Vision brain if there's an image in play
                model: useVision ? "llama-3.2-11b-vision-preview" : "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are Roty's AI. Respond in clear, organized Markdown." },
                    ...formattedHistory, 
                    { role: "user", content: currentMessageContent }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);

        res.status(200).json({ text: data.choices[0].message.content });
    } catch (e) {
        console.error("Groq API Error:", e);
        res.status(500).json({ error: "Failed to communicate with Roty Engine." });
    }
}
