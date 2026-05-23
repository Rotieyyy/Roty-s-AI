export default async function handler(req, res) {

    // --- ONLY ALLOW POST ---
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {

        const {
            prompt,
            history = [],
            image,
            mode = 'chat',
            engine = 'roty-1' // NEW: Gets the selected model from frontend
        } = req.body || {};

        const key = process.env.GROQ_API_KEY;

        // --- VALIDATION ---
        if (!key) {
            return res.status(500).json({
                error: "Missing GROQ_API_KEY"
            });
        }

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        // --- PAYLOAD SIZE PROTECTION ---
        if (image && image.length > 4_000_000) {
            return res.status(413).json({
                error: "Image payload too large."
            });
        }

        // --- STRONG ART DETECTION ---
        const artKeywords = [
            "generate image",
            "create image",
            "make image",
            "draw",
            "make art",
            "generate art",
            "create art",
            "make a picture",
            "image of",
            "photo of",
            "illustration of"
        ];

        const lowerPrompt = prompt.toLowerCase();

        const isAskingForArt =
            artKeywords.some(word =>
                lowerPrompt.includes(word)
            );

        // --- STRICT MODE GATEKEEPER ---
        if (mode === 'chat' && isAskingForArt) {

            return res.status(200).json({
                text:
`# Switch to Art Mode

I'm currently in **Chat Mode**.

To generate images, please switch to **Art Mode** above and try again.`
            });
        }

        // --- DETECT IMAGE HISTORY ---
        const historyHasImage = Array.isArray(history)
            ? history.some(msg =>
                typeof msg?.content === 'string' &&
                msg.content.includes('<img ')
            )
            : false;

        const useVision = !!image || historyHasImage;

        // --- MAP ROTY ENGINES TO GROQ MODELS ---
        let selectedGroqModel = "llama-3.1-8b-instant"; // Default Roty 1.0

        if (engine === 'roty-2') {
            selectedGroqModel = "llama-3.2-11b-vision-preview";
        } else if (engine === 'roty-pro') {
            selectedGroqModel = "llama-3.3-70b-versatile"; // Roty Pro 70B
        }

        // OVERRIDE: Groq's 8B and 70B models don't support vision natively.
        // If the user uploads an image, we quietly force it to the 11B vision model so it doesn't crash.
        if (useVision) {
            selectedGroqModel = "llama-3.2-11b-vision-preview";
        }

        // --- SAFE HISTORY FORMATTER ---
        const formattedHistory = Array.isArray(history)
            ? history.map(msg => {

                const safeRole =
                    msg?.role === 'assistant'
                        ? 'assistant'
                        : 'user';

                const safeContent =
                    typeof msg?.content === 'string'
                        ? msg.content
                        : '';

                const imgMatch =
                    safeContent.match(
                        /<img[^>]*src="([^"]+)"/
                    );

                // IMAGE MESSAGE
                if (imgMatch) {

                    return {
                        role: safeRole,
                        content: [
                            {
                                type: "text",
                                text:
                                    safeContent
                                        .replace(/<img[^>]*>/g, '')
                                        .trim() ||
                                    "User shared an image."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imgMatch[1]
                                }
                            }
                        ]
                    };
                }

                // TEXT MESSAGE
                return {
                    role: safeRole,
                    content: safeContent
                };

            }).slice(-10) // MEMORY LIMIT
            : [];

        // --- SYSTEM PROMPT ---
        const systemPrompt = mode === 'art'
            ? `
You are Roty's AI in Art Mode.

You ONLY help users create image prompts and visual ideas.

Keep responses short and visual-focused.
`
            : `
You are Roty's AI in Chat Mode.

Rules:
- Respond in Markdown.
- Help with coding, questions, conversation, and analysis.
- NEVER claim you can generate images in Chat Mode.
- If user asks for images, tell them to switch to Art Mode.
`;

        // --- USER MESSAGE ---
        const userMessage = image
            ? {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: prompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: image
                        }
                    }
                ]
            }
            : {
                role: "user",
                content: prompt
            };

        // --- TIMEOUT CONTROLLER ---
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 30000);

        // --- API REQUEST ---
        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",

                signal: controller.signal,

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },

                body: JSON.stringify({

                    model: selectedGroqModel, // UPDATED: Uses dynamic engine map

                    temperature: 0.7,

                    max_tokens: 2048,

                    messages: [
                        {
                            role: "system",
                            content: systemPrompt
                        },

                        ...formattedHistory,

                        userMessage
                    ]
                })
            }
        );

        clearTimeout(timeout);

        // --- HANDLE BAD RESPONSES ---
        if (!response.ok) {

            const errorText = await response.text();

            console.error("Groq API Error:", errorText);

            return res.status(response.status).json({
                error: "AI service temporarily unavailable."
            });
        }

        const data = await response.json();

        // --- SAFE RESPONSE EXTRACTION ---
        const aiText =
            data?.choices?.[0]?.message?.content;

        if (
            !aiText ||
            typeof aiText !== 'string'
        ) {

            return res.status(200).json({
                text:
                    "The AI returned an empty response. Please try again."
            });
        }

        // --- SUCCESS ---
        return res.status(200).json({
            text: aiText
        });

    } catch (e) {

        console.error("SERVER ERROR:", e);

        // TIMEOUT
        if (e.name === 'AbortError') {

            return res.status(408).json({
                error: "Request timeout."
            });
        }

        // GENERAL ERROR
        return res.status(500).json({
            error:
                e?.message ||
                "Unknown server error."
        });
    }
}