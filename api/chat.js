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
            documentContext,
            mode = 'chat',
            engine = 'roty-1',
            persona = 'general',
            webSearch = false
        } = req.body || {};

        const key = process.env.GROQ_API_KEY;

        // --- VALIDATION ---
        if (!key) {
            return res.status(500).json({
                error: "Missing GROQ_API_KEY"
            });
        }

        const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;

        if (!hasPrompt && !image && !documentContext) {
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

        const lowerPrompt = (prompt || '').toLowerCase();

        const isAskingForArt =
            artKeywords.some(word =>
                lowerPrompt.includes(word)
            );

        // --- STRICT MODE GATEKEEPER ---
        if (mode === 'chat' && isAskingForArt && !image) {

            return res.status(200).json({
                text:
`# Switch to Art Mode

I'm currently in **Chat Mode**.

To generate images, please switch to **Art Mode** above and try again.`
            });
        }

        // --- MAP ROTY ENGINES TO GROQ MODELS ---
        let selectedGroqModel = "llama-3.1-8b-instant"; // Default Roty 1.0

        if (image) {
            selectedGroqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
        } else if (engine === 'roty-2') {
            selectedGroqModel = "llama-3.3-70b-versatile";
        } else if (engine === 'roty-pro') {
            selectedGroqModel = "llama-3.3-70b-versatile"; // Roty Pro 70B
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

                // TEXT MESSAGE
                return {
                    role: safeRole,
                    content:
                        safeContent
                            .replace(/<img[^>]*>/g, '[Image]')
                            .trim()
                };

            }).slice(-10) // MEMORY LIMIT
            : [];

        // --- SYSTEM PROMPT ---
        const personaPrompts = {
            general: "Be balanced, practical, and clear.",
            "code-reviewer": "Act as a careful code reviewer. Prioritize bugs, regressions, edge cases, security, and missing tests.",
            "creative-writer": "Act as a creative writing partner. Improve voice, imagery, structure, rhythm, and originality.",
            "video-script": "Act as a video script assistant. Help with hooks, pacing, structure, narration, scenes, and calls to action.",
            "photo-prompt": "Act as a photography prompt expert. Focus on subject, camera, lens, lighting, composition, mood, and style."
        };

        const personaInstruction =
            personaPrompts[persona] || personaPrompts.general;

        const safeDocument =
            documentContext &&
            typeof documentContext.name === 'string' &&
            typeof documentContext.content === 'string'
                ? {
                    name: documentContext.name.substring(0, 120),
                    content: documentContext.content.substring(0, 18000)
                }
                : null;

        const webContext = webSearch && mode === 'chat'
            ? await fetchSearchContext(prompt)
            : '';

        const contextParts = [];

        if (safeDocument) {
            contextParts.push(
`Attached document: ${safeDocument.name}
${safeDocument.content}`
            );
        }

        if (webContext) {
            contextParts.push(
`Web search context:
${webContext}`
            );
        }

        const basePrompt = hasPrompt
            ? prompt
            : image
                ? "Describe this image and extract any visible text."
                : "Summarize this file and point out the important details.";

        const promptWithContext = contextParts.length
            ? `${contextParts.join('\n\n')}\n\nUser request:\n${basePrompt}`
            : basePrompt;

        const systemPrompt = mode === 'art'
            ? `
You are Roty's AI in Art Mode.

You ONLY help users create image prompts and visual ideas.

Keep responses short and visual-focused.
`
            : `
You are Roty's AI in Chat Mode.

Rules:
- ${personaInstruction}
- Use clear formatting only when it helps: short paragraphs, bullets, numbered steps, tables, and code blocks are all supported.
- For code, include fenced code blocks with the language name when possible.
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
                        text: promptWithContext
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
                content: promptWithContext
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

async function fetchSearchContext(query) {
    try {
        const url =
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

        const response = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) return '';

        const data = await response.json();
        const parts = [];

        if (data.AbstractText) {
            parts.push(data.AbstractText);
        }

        if (Array.isArray(data.RelatedTopics)) {
            data.RelatedTopics
                .flatMap(item => item.Topics || [item])
                .filter(item => item.Text)
                .slice(0, 5)
                .forEach(item => {
                    parts.push(`${item.Text}${item.FirstURL ? ` (${item.FirstURL})` : ''}`);
                });
        }

        return parts.join('\n').substring(0, 4000);

    } catch (e) {
        console.error("Search Context Error:", e);
        return '';
    }
}
