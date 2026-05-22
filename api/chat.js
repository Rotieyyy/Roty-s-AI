export default async function handler(req, res) {
    const { prompt, history = [], image, mode } = req.body; 
    const key = process.env.GROQ_API_KEY;

    // 1. GATEKEEPER: If user asks for art in Chat Mode, redirect them.
    const artKeywords = ["generate", "draw", "create image", "make a picture", "generate a"];
    const isAskingForArt = prompt && artKeywords.some(word => prompt.toLowerCase().includes(word));

    if (mode === 'chat' && isAskingForArt) {
        return res.status(200).json({ 
            text: "### Switch to Art Mode!\nI'm currently in **Chat Mode**, which is great for conversation and coding. To generate images, please click the **Art Mode** button above and try your prompt again!" 
        });
    }

    // 2. VISION DETECTION: Use Vision model if an image is provided or exists in the conversation history
    const historyHasImage = history.some(msg => msg.content.includes('<img '));
    const useVision = image || historyHasImage;

    // 3. MULTI-TURN MEMORY: Format history to prevent amnesia
    const formattedHistory = history.map(msg => {
        const imgMatch = msg.content.match(/<img[^>]*src="([^"]+)"/);
        if (imgMatch) {
            return {
                role: msg.role,
                content: [
                    { type: "text", text: msg.content.replace(/<img[^>]*>/g, '').trim() || "User shared an image." },
                    { type: "image_url", image_url: { url: imgMatch[1] } }
                ]
            };
        }
        return { role: msg.role, content: msg.content };
    });

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({
                model: useVision ? "llama-3.2-11b-vision-preview" : "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are Roty's AI. Respond in clear Markdown. If in Chat Mode, provide answers. If user asks for images, redirect them to Art Mode." },
                    ...formattedHistory,
                    { role: "user", content: image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt }
                ]
            })
        });
        const data = await response.json();
        res.status(200).json({ text: data.choices[0].message.content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
