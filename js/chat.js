// --- CHAT ENGINE ---
function init() {
    renderHistory();

    if (allChats.length === 0) {
        startNewChat();
    } else {
        loadChat(allChats[0].id);
    }
}

function startNewChat() {
    currentChatId = Date.now();

    chatViewport.innerHTML = `
        <div class="welcome-hero" id="welcome-hero">
            <div class="hero-logo">
                <i class="fas fa-layer-group"></i>
            </div>
            <h1 class="shimmer-text">Hello, I'm Roty's AI.</h1>
            <p>What shall we build today?</p>
        </div>
    `;

    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// --- CHAT SENDING ---
async function handleSend() {
    if (isSharedView) {
        showToast("This is a read-only shared chat.");
        return;
    }

    let text = userInput.value.trim();
    const imageToSend = currentImageData;
    const documentToSend = currentDocumentAttachment
        ? { ...currentDocumentAttachment }
        : null;

    if (!text && !imageToSend && !documentToSend) return;

    if (!text && imageToSend) {
        text = "Describe this image and extract any visible text.";
    }

    if (!text && documentToSend) {
        text = "Summarize this file and point out the important details.";
    }

    await sendMessage(text, {
        imageData: imageToSend,
        documentAttachment: documentToSend,
        clearComposer: true,
        mode: isArtMode ? 'art' : 'chat',
        engine: currentEngine,
        persona: currentPersona
    });
}

async function sendMessage(text, options = {}) {
    if (isSending) return;
    if (!checkRateLimit()) return;

    const mode = options.mode || (isArtMode ? 'art' : 'chat');
    const engine = options.engine || currentEngine;
    const persona = options.persona || currentPersona;
    const imageData = options.imageData || null;
    const documentAttachment = options.documentAttachment || null;

    isSending = true;
    sendBtn.disabled = true;

    try {
        const welcome = document.getElementById('welcome-hero');
        if (welcome) welcome.remove();

        const chat = ensureCurrentChat(text || documentAttachment?.name || "New Conversation");

        if (!options.skipUserAppend) {
            const userIndex = chat.msgs.length;
            const userMessage = {
                role: 'user',
                text,
                mode,
                engine,
                persona,
                hasImage: !!imageData,
                document: documentAttachment
                    ? {
                        name: documentAttachment.name,
                        content: documentAttachment.content
                    }
                    : null
            };

            chat.msgs.push(userMessage);
            chat.updatedAt = Date.now();
            appendMessage('user', userMessage, userIndex);
            await persistChat(chat);
        }

        if (options.clearComposer) {
            userInput.value = '';
            userInput.style.height = 'auto';
            clearImageUpload();
            clearDocumentUpload();
        }

        if (mode === 'art') {
            await generateArtResponse(text, chat);
            return;
        }

        const lower = text.toLowerCase();
        const imageKeywords = [
            'generate image', 'create image', 'make image',
            'draw', 'generate art', 'make art', 'create art'
        ];

        if (imageKeywords.some(k => lower.includes(k))) {
            await addAiResponse("Please switch to Art Mode to generate images.", chat, { engine, persona });
            return;
        }

        const aiId = appendMessage('ai', buildTypingIndicator(), null, {
            isHtml: true,
            skipTools: true
        });

        const aiNode = document.getElementById(aiId);
        const history = chat.msgs.slice(0, -1).map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: getMessageText(m)
        }));

        try {
            currentAbortController = new AbortController();
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
                sendBtn.style.background = 'var(--red)';
                sendBtn.dataset.action = 'stop';
            }

            const res = await fetch('/api/chat', {
                method: "POST",
                signal: currentAbortController.signal,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    prompt: text,
                    history,
                    image: imageData,
                    documentContext: documentAttachment,
                    mode,
                    engine,
                    persona,
                    webSearch: webSearchEnabled
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData?.error || `Server Error ${res.status}`);
            }

            const data = await res.json();
            const aiText = data.text;
        
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                sendBtn.style.background = '';
                sendBtn.dataset.action = 'send';
            }

            const newIndex = await pushAiMessage(chat, aiText, { engine, persona });
            renderAiMessage(aiNode, aiText, newIndex);

        } catch (e) {
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                sendBtn.style.background = '';
                sendBtn.dataset.action = 'send';
            }

            console.error("Chat API Error:", e);
            
            if (e.name === 'AbortError') {
                renderAiMessage(aiNode, "Generation stopped by user.", null);
            } else {
                const errorText = "Connection issue: " + e.message;
                const aiIndex = await pushAiMessage(chat, errorText, { engine, persona, failed: true });
                renderAiMessage(aiNode, errorText, aiIndex);
            }
        }

    } finally {
        isSending = false;
        sendBtn.disabled = false;
    }
}

function ensureCurrentChat(titleSeed) {
    let chat = getChat();

    if (!chat) {
        chat = {
            id: currentChatId || Date.now(),
            title: stripHtml(titleSeed).substring(0, 30) || "New Conversation",
            msgs: [],
            updatedAt: Date.now()
        };

        currentChatId = chat.id;
        allChats.unshift(chat);
    }

    return chat;
}

async function persistChat(chat) {
    pruneStoredData();
    chat.updatedAt = Date.now();

    if (!isGuest) {
        renderHistory();
    }

    if (!isGuest && currentUserUid) {
        try {
            await db
                .collection('users')
                .doc(currentUserUid)
                .collection('chats')
                .doc(chat.id.toString())
                .set(chat);
        } catch (e) {
            console.error("Cloud Save Error:", e);
        }
    }
}

async function pushAiMessage(chat, text, meta = {}) {
    const aiIndex = chat.msgs.length;

    chat.msgs.push({
        role: 'ai',
        text,
        engine: meta.engine || currentEngine,
        persona: meta.persona || currentPersona,
        failed: !!meta.failed,
        createdAt: Date.now()
    });

    await persistChat(chat);
    
    if (chat.msgs.length === 2 && !isGuest && !chat.titleGenerated) {
        generateChatTitle(chat, getMessageText(chat.msgs[0]));
    }
    
    return aiIndex;
}

async function generateChatTitle(chat, prompt) {
    try {
        const res = await fetch('/api/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.title) {
                chat.title = data.title;
                chat.titleGenerated = true;
                await persistChat(chat);
            }
        }
    } catch (e) {
        console.error("Failed to generate title", e);
    }
}

async function addAiResponse(text, chat, meta = {}) {
    const aiIndex = await pushAiMessage(chat, text, meta);
    appendMessage('ai', text, aiIndex);
}

async function generateArtResponse(text, chat) {
    if (!text) {
        await addAiResponse("Tell me what kind of image you want to create.", chat);
        return;
    }

    const aiId = appendMessage('ai', "Generating art...", null, { skipTools: true });

    try {
        currentAbortController = new AbortController();
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            sendBtn.style.background = 'var(--red)';
            sendBtn.dataset.action = 'stop';
        }

        const res = await fetch('/api/image', {
            method: "POST",
            signal: currentAbortController.signal,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: text,
                model: currentImageModel,
                size: currentImageSize,
                quality: 'high',
                enhance: enhanceArtPrompt,
                userId: currentUserUid || 'guest'
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData?.error || `Image Error ${res.status}`);
        }

        const data = await res.json();

        if (!data?.url) {
            throw new Error("Image provider returned no image.");
        }

        const promptLabel = escapeHtml(data.revisedPrompt || text);
        const aiText = `
            <figure class="generated-art">
                <img src="${data.url}" alt="${promptLabel}">
                <figcaption>${promptLabel}</figcaption>
            </figure>
        `;

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.style.background = '';
            sendBtn.dataset.action = 'send';
        }

        const aiIndex = await pushAiMessage(chat, aiText, {
            engine: currentEngine,
            persona: currentPersona,
            imageModel: currentImageModel
        });

        renderAiMessage(aiDiv, aiText, aiIndex, { isHtml: true });
        saveImageToGallery(data.url, data.revisedPrompt || text);

    } catch (e) {
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.style.background = '';
            sendBtn.dataset.action = 'send';
        }

        console.error("Art Error:", e);
        if (e.name === 'AbortError') {
            renderAiMessage(aiDiv, "Generation stopped by user.", null);
        } else {
            const errorText = `Image generation failed: ${e.message}. Try Turbo or a smaller prompt.`;
            const aiIndex = await pushAiMessage(chat, errorText, { failed: true });
            renderAiMessage(aiDiv, errorText, aiIndex);
        }
    }
}

// --- APPEND MESSAGE ---
function appendMessage(role, content, messageIndex = null, options = {}) {
    const id = "msg-" + Math.random().toString(16).slice(2);
    const div = document.createElement('div');

    div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.id = id;

    if (role === 'ai') {
        renderAiMessage(div, content, messageIndex, options);
    } else {
        renderUserMessage(div, content, messageIndex);
    }

    chatViewport.appendChild(div);

    chatViewport.scrollTo({
        top: chatViewport.scrollHeight,
        behavior: 'smooth'
    });

    return id;
}

function renderUserMessage(div, content, messageIndex) {
    const message = typeof content === 'object'
        ? content
        : { text: String(content ?? '') };

    const text = getMessageText(message);
    const parts = [];

    if (message.hasImage) {
        parts.push('<div class="attachment-pill"><i class="fas fa-image"></i> Photo uploaded</div>');
    }

    if (message.document?.name) {
        parts.push(`<div class="attachment-pill"><i class="fas fa-file-lines"></i> ${escapeHtml(message.document.name)}</div>`);
    }

    if (text) {
        parts.push(`<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`);
    }

    const contentHtml = parts.join('') || '<div class="attachment-pill">Attachment uploaded</div>';
    div.innerHTML = `<div class="user-bubble">${contentHtml}</div>`;

    if (messageIndex !== null && !isSharedView) {
        const actions = document.createElement('div');
        actions.className = 'user-message-actions';
        actions.innerHTML = `
            <button class="mini-action-btn" title="Copy message" data-action="copy">
                <i class="far fa-copy"></i>
            </button>
            <button class="mini-action-btn" title="Edit message" data-action="edit">
                <i class="fas fa-pen"></i>
            </button>
        `;
        actions.querySelector('[data-action="edit"]').onclick = () => editAndBranchFrom(messageIndex);
        actions.querySelector('[data-action="copy"]').onclick = () => copyMessageText(text);
        div.appendChild(actions);
    }
}

function renderAiMessage(div, content, messageIndex = null, options = {}) {
    const rawText = typeof content === 'object'
        ? getMessageText(content)
        : String(content ?? '');

    div.innerHTML = '<div class="message-body"></div>';

    const body = div.querySelector('.message-body');

    if (options.isHtml || rawText.trim().startsWith('<img')) {
        body.innerHTML = rawText;
    } else {
        body.innerHTML = marked.parse(rawText || "Invalid response.");
    }

    addCopyButtons(body);
    highlightCodeBlocks(body);

    if (!options.skipTools && messageIndex !== null) {
        addMessageTools(div, rawText, messageIndex);
    }
}

function addMessageTools(div, rawText, messageIndex) {
    const chat = getChat();
    const message = chat?.msgs?.[messageIndex];
    const feedback = message?.feedback || '';
    const tools = document.createElement('div');

    tools.className = 'message-actions';
    tools.innerHTML = `
        <button class="mini-action-btn ${feedback === 'like' ? 'active' : ''}" title="Good response" data-action="like">
            <i class="far fa-thumbs-up"></i>
        </button>
        <button class="mini-action-btn ${feedback === 'dislike' ? 'active danger' : ''}" title="Bad response" data-action="dislike">
            <i class="far fa-thumbs-down"></i>
        </button>
        <button class="mini-action-btn" title="Regenerate response" data-action="regen">
            <i class="fas fa-rotate-right"></i>
        </button>
        <button class="mini-action-btn" title="Read aloud" data-action="speak">
            <i class="fas fa-volume-high"></i>
        </button>
        <button class="mini-action-btn" title="Copy response" data-action="copy">
            <i class="far fa-copy"></i>
        </button>
        <div class="message-download">
            <button class="mini-action-btn" title="Download response" data-action="download">
                <i class="fas fa-download"></i>
            </button>
            <div class="download-menu hidden">
                <button data-format="txt">Text</button>
                <button data-format="pdf">PDF</button>
                <button data-format="word">Word</button>
            </div>
        </div>
    `;

    tools.querySelector('[data-action="like"]').onclick = () =>
        recordFeedback('like', messageIndex, tools);

    tools.querySelector('[data-action="dislike"]').onclick = () =>
        recordFeedback('dislike', messageIndex, tools);

    tools.querySelector('[data-action="regen"]').onclick = () =>
        regenerateResponse(messageIndex);

    tools.querySelector('[data-action="speak"]').onclick = () =>
        speakMessage(rawText);

    tools.querySelector('[data-action="copy"]').onclick = () =>
        copyMessageText(rawText);

    const downloadButton = tools.querySelector('[data-action="download"]');
    const menu = tools.querySelector('.download-menu');

    downloadButton.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.download-menu')
            .forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.add('hidden');
            });
        menu.classList.toggle('hidden');
    };

    menu.querySelectorAll('button').forEach(button => {
        button.onclick = (e) => {
            e.stopPropagation();
            menu.classList.add('hidden');
            downloadMessage(rawText, div.querySelector('.message-body'), button.dataset.format);
        };
    });

    div.appendChild(tools);
}

async function copyMessageText(rawText) {
    const plainText = markdownToPlainText(rawText);

    try {
        await navigator.clipboard.writeText(plainText);
    } catch (e) {
        const area = document.createElement('textarea');
        area.value = plainText;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }

    showToast("Response copied!", "success");
}

function markdownToPlainText(rawText) {
    if (rawText.trim().startsWith('<img')) {
        return stripHtml(rawText).trim() || '[Image]';
    }

    const temp = document.createElement('div');
    temp.innerHTML = marked.parse(rawText || '');
    return (temp.innerText || temp.textContent || rawText).trim();
}

function downloadMessage(rawText, bodyElement, format) {
    const chat = getChat();
    const baseName = makeSafeFileName(chat?.title || 'Rotys_AI_Response');
    const plainText = markdownToPlainText(rawText);
    const exportBody = cloneForExport(bodyElement);

    if (format === 'txt') {
        downloadBlob(plainText, 'text/plain;charset=utf-8', `${baseName}.txt`);
        showToast("Text downloaded.", "success");
        return;
    }

    if (format === 'word') {
        const html = buildExportHtml(exportBody, chat?.title || "Roty's AI Response");
        downloadBlob('\ufeff' + html, 'application/msword;charset=utf-8', `${baseName}.doc`);
        showToast("Word file downloaded.", "success");
        return;
    }

    if (format === 'pdf') {
        if (!window.html2pdf) {
            showToast("PDF exporter is still loading. Try again in a moment.", "error");
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-export-wrapper';
        wrapper.innerHTML = exportBody.innerHTML;

        html2pdf()
            .set({
                margin: 16,
                filename: `${baseName}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            })
            .from(wrapper)
            .save()
            .then(() => showToast("PDF downloaded.", "success"))
            .catch(() => showToast("PDF download failed. Please try again.", "error"));
    }
}

function cloneForExport(bodyElement) {
    const clone = bodyElement.cloneNode(true);

    clone.querySelectorAll('button').forEach(button => button.remove());
    clone.querySelectorAll('.code-header').forEach(header => {
        if (!header.textContent.trim()) {
            header.remove();
        }
    });

    return clone;
}

function buildExportHtml(bodyElement, title) {
    return `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${escapeHtml(title)}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; }
                pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; }
                code { font-family: Consolas, monospace; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
                img { max-width: 100%; }
            </style>
        </head>
        <body>${bodyElement.innerHTML}</body>
        </html>
    `;
}

function speakMessage(rawText) {
    if (!('speechSynthesis' in window)) {
        showToast("Voice output is not supported in this browser.", "error");
        return;
    }

    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        activeSpeechUtterance = null;
        showToast("Voice stopped.");
        return;
    }

    activeSpeechUtterance = new SpeechSynthesisUtterance(markdownToPlainText(rawText));
    activeSpeechUtterance.rate = 1;
    activeSpeechUtterance.pitch = 1;
    speechSynthesis.speak(activeSpeechUtterance);
}

async function recordFeedback(type, messageIndex, tools) {
    const chat = getChat();
    const message = chat?.msgs?.[messageIndex];

    if (!chat || !message) return;

    message.feedback = type;
    await persistChat(chat);

    tools.querySelectorAll('[data-action="like"], [data-action="dislike"]')
        .forEach(btn => btn.classList.remove('active', 'danger'));

    const selected = tools.querySelector(`[data-action="${type}"]`);
    selected?.classList.add('active');
    if (type === 'dislike') selected?.classList.add('danger');

    if (!isGuest && currentUserUid) {
        try {
            await db.collection('feedback').add({
                userId: currentUserUid,
                chatId: chat.id,
                messageIndex,
                type,
                messageText: getMessageText(message).substring(0, 4000),
                engine: message.engine || currentEngine,
                persona: message.persona || currentPersona,
                createdAt: Date.now()
            });
        } catch (e) {
            console.error("Feedback Save Error:", e);
        }
    }

    showToast(type === 'like' ? "Thanks for the feedback!" : "Dislike saved. This helps improve responses.", "success");
}

async function regenerateResponse(messageIndex) {
    if (isSharedView) {
        showToast("Shared chats are read-only.");
        return;
    }

    const chat = getChat();
    if (!chat?.msgs?.length) return;

    let userIndex = messageIndex - 1;

    while (userIndex >= 0 && chat.msgs[userIndex].role !== 'user') {
        userIndex--;
    }

    if (userIndex < 0) {
        showToast("Could not find the original prompt.", "error");
        return;
    }

    const userMessage = chat.msgs[userIndex];
    chat.msgs = chat.msgs.slice(0, userIndex + 1);
    await persistChat(chat);

    chatViewport.innerHTML = '';
    chat.msgs.forEach((m, index) => appendMessage(m.role, m, index));

    await sendMessage(getMessageText(userMessage), {
        skipUserAppend: true,
        documentAttachment: userMessage.document || null,
        mode: userMessage.mode || 'chat',
        engine: userMessage.engine || currentEngine,
        persona: userMessage.persona || currentPersona
    });
}

async function editAndBranchFrom(messageIndex) {
    const chat = getChat();
    const original = chat?.msgs?.[messageIndex];

    if (!chat || !original || original.role !== 'user') return;

    const editedText = prompt("Edit this message to start a new branch:", getMessageText(original));

    if (editedText === null) return;

    const cleanText = editedText.trim();
    if (!cleanText && !original.document && !original.hasImage) return;

    const newChat = {
        id: Date.now(),
        title: stripHtml(cleanText || original.document?.name || "Branched Conversation").substring(0, 30),
        msgs: [
            ...chat.msgs.slice(0, messageIndex),
            {
                ...original,
                text: cleanText,
                branchedFrom: chat.id,
                createdAt: Date.now()
            }
        ],
        updatedAt: Date.now()
    };

    allChats.unshift(newChat);
    currentChatId = newChat.id;
    renderHistory();
    loadChat(newChat.id);

    await persistChat(newChat);
    await sendMessage(cleanText, {
        skipUserAppend: true,
        documentAttachment: original.document || null,
        mode: original.mode || 'chat',
        engine: original.engine || currentEngine,
        persona: original.persona || currentPersona
    });
}

// --- COPY BUTTONS ---
function addCopyButtons(container) {
    const preBlocks = container.querySelectorAll('pre');

    preBlocks.forEach(pre => {
        if (pre.querySelector('.code-header')) return;

        const codeText = pre.innerText;
        const header = document.createElement('div');

        header.className = 'code-header';

        const langClass = pre.querySelector('code')?.className || '';
        const lang = langClass.replace('language-', '') || 'Code';

        header.innerHTML = `
            <span>${lang}</span>
            <button class="copy-btn">
                <i class="far fa-copy"></i> Copy
            </button>
        `;

        header.querySelector('.copy-btn').onclick = function() {
            navigator.clipboard.writeText(
                pre.querySelector('code')
                    ? pre.querySelector('code').innerText
                    : codeText
            );

            showToast("Code copied to clipboard!", "success");
        };

        pre.insertBefore(header, pre.firstChild);
    });
}

// --- SAVE CHAT (UPDATED FOR GUEST MEMORY) ---
async function saveChat(userText, aiText) {
    let chat = allChats.find(c => c.id === currentChatId);

    if (!chat) {
        const cleanTitle = userText.replace(/<[^>]*>?/gm, '');

        chat = {
            id: currentChatId,
            title: cleanTitle.substring(0, 30) || "New Conversation",
            msgs: [],
            updatedAt: Date.now()
        };

        allChats.unshift(chat);
    }

    chat.msgs.push({
        role: 'user',
        text: userText
    });

    if (aiText) {
        chat.msgs.push({
            role: 'ai',
            text: aiText
        });
    }

    chat.updatedAt = Date.now();
    
    if (!isGuest) {
        renderHistory();
    }

    if (!isGuest && currentUserUid) {
        try {
            await db
                .collection('users')
                .doc(currentUserUid)
                .collection('chats')
                .doc(currentChatId.toString())
                .set(chat);
        } catch (e) {
            console.error("Cloud Save Error:", e);
        }
    }
}

// --- UPDATE AI RESPONSE (UPDATED FOR GUEST MEMORY) ---
async function updateLastAiResponse(aiText) {
    let chat = allChats.find(c => c.id === currentChatId);

    if (chat) {
        chat.msgs.push({
            role: 'ai',
            text: aiText
        });

        chat.updatedAt = Date.now();

        if (!isGuest && currentUserUid) {
            try {
                await db
                    .collection('users')
                    .doc(currentUserUid)
                    .collection('chats')
                    .doc(currentChatId.toString())
                    .set(chat);
            } catch (e) {
                console.error("Cloud Update Error:", e);
            }
        }
    }
}

// --- EXPORT CHAT ---
function exportChat() {
    let chat = allChats.find(c => c.id === currentChatId);

    if (!chat || chat.msgs.length === 0) {
        showToast("No messages to export!", "error");
        return;
    }

    let content = `${chat.title}\n${'='.repeat(Math.min(chat.title.length, 60))}\n\n`;

    chat.msgs.forEach(m => {
        const role = m.role === 'user' ? 'You' : "Roty's AI";

        content += `${role}\n${'-'.repeat(role.length)}\n${markdownToPlainText(getMessageText(m))}\n\n`;
    });

    const blob = new Blob([content], {
        type: 'text/plain;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `${makeSafeFileName(chat.title)}_Export.txt`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("Conversation exported successfully!", "success");
}

function getSharedChatId() {
    return new URLSearchParams(window.location.search).get('share');
}

async function shareCurrentChat() {
    const chat = getChat();

    if (!chat || !chat.msgs.length) {
        showToast("No conversation to share yet.", "error");
        return;
    }

    if (isGuest || !currentUserUid) {
        showToast("Sign in to create a shareable chat link.", "error");
        return;
    }

    try {
        const sharedDoc = await db.collection('sharedChats').add({
            title: chat.title,
            msgs: chat.msgs,
            createdAt: Date.now(),
            createdBy: currentUserUid
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${sharedDoc.id}`;
        await navigator.clipboard.writeText(shareUrl);
        showToast("Share link copied!", "success");

    } catch (e) {
        console.error("Share Error:", e);
        showToast("Could not create share link. Check Firestore rules.", "error");
    }
}

async function loadSharedChat(sharedId) {
    isSharedView = true;
    isGuest = true;
    currentUserUid = null;

    closeAuth();

    try {
        const doc = await db.collection('sharedChats').doc(sharedId).get();

        if (!doc.exists) {
            throw new Error("Shared chat not found");
        }

        const data = doc.data();

        allChats = [{
            id: `shared-${sharedId}`,
            title: data.title || "Shared Conversation",
            msgs: Array.isArray(data.msgs) ? data.msgs : [],
            updatedAt: data.createdAt || Date.now()
        }];

        currentChatId = allChats[0].id;
        document.getElementById('user-display-email').innerText = "Shared Chat";
        document.getElementById('user-initial').innerText = "S";
        document.getElementById('logout-btn').style.display = 'none';
        document.querySelector('.input-area').classList.add('read-only');

        loadChat(currentChatId);
        showToast("Opened shared read-only chat.", "success");

    } catch (e) {
        console.error("Shared Chat Error:", e);
        showToast("This shared chat could not be opened.", "error");
        allChats = [];
        startNewChat();
    }
}

