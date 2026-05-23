export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        const {
            prompt,
            model = 'flux',
            size = '1024x1024',
            quality = 'high',
            enhance = true,
            userId = 'guest'
        } = req.body || {};

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        const allowedModels = new Set(['flux', 'turbo', 'flux-realism']);
        const safeModel = allowedModels.has(model) ? model : 'flux';
        const safeSize = /^\d{3,4}x\d{3,4}$/.test(size) ? size : '1024x1024';
        const [width, height] = safeSize.split('x').map(Number);
        const cleanPrompt = prompt.substring(0, 1200);
        const imagePrompt = enhance
            ? `${cleanPrompt}, high detail, polished lighting, coherent composition, sharp focus`
            : cleanPrompt;

        const pollinationsKey = process.env.POLLINATIONS_API_KEY;

        if (pollinationsKey) {
            const response = await fetch('https://gen.pollinations.ai/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pollinationsKey}`
                },
                body: JSON.stringify({
                    prompt: imagePrompt,
                    model: safeModel,
                    size: safeSize,
                    quality,
                    n: 1,
                    response_format: 'url',
                    safe: 'true',
                    user: String(userId).substring(0, 80)
                })
            });

            if (response.ok) {
                const data = await response.json();
                const url = data?.data?.[0]?.url;

                if (url) {
                    return res.status(200).json({
                        url,
                        model: safeModel,
                        revisedPrompt: data?.data?.[0]?.revised_prompt || imagePrompt
                    });
                }
            } else {
                console.error("Pollinations image API error:", await response.text());
            }
        }

        const params = new URLSearchParams({
            model: safeModel,
            width: String(width),
            height: String(height),
            seed: String(Date.now()),
            nologo: 'true',
            private: 'true',
            safe: 'true'
        });

        if (enhance) {
            params.set('enhance', 'true');
        }

        return res.status(200).json({
            url: `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?${params.toString()}`,
            model: safeModel,
            revisedPrompt: imagePrompt
        });

    } catch (e) {
        console.error("IMAGE SERVER ERROR:", e);

        return res.status(500).json({
            error: e?.message || "Image generation failed."
        });
    }
}
