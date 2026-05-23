// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCpB65diH8Qxp5Q3_wQb7SWCvK9RvT4J2E",
    authDomain: "roty-s-ai.firebaseapp.com",
    projectId: "roty-s-ai",
    storageBucket: "roty-s-ai.firebasestorage.app",
    messagingSenderId: "724241802469",
    appId: "1:724241802469:web:abd96c31fafa967ffce00c"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- STATE ---
let currentChatId = null;
let allChats = [];
let isLoginMode = true;
let currentImageData = null;
let isGuest = false;
let currentUserUid = null;
let userGallery = [];
let isArtMode = false;
let isInitializing = false;
let currentEngine = 'roty-1';
let currentPersona = 'general';
let currentPersonaName = 'General';
let webSearchEnabled = false;
let currentDocumentAttachment = null;
let currentImageModel = 'flux';
let currentImageSize = '1024x1024';
let enhanceArtPrompt = true;
let isSending = false;
let isSharedView = false;
let activeLightboxIndex = null;
let activeSpeechUtterance = null;

const LIMITS = {
    maxChats: 30,
    maxMessagesPerChat: 100,
    maxGalleryItems: 50,
    maxDocumentChars: 18000,
    maxDocumentBytes: 8 * 1024 * 1024,
    maxRequestsPerMinute: 12,
    maxProRequestsPerMinute: 8
};

if (window.marked) {
    marked.setOptions({
        gfm: true,
        breaks: true
    });
}

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function stripHtml(value) {
    const temp = document.createElement('div');
    temp.innerHTML = String(value ?? '');
    return temp.innerText || temp.textContent || '';
}

function getChat() {
    return allChats.find(c => c.id === currentChatId);
}

function getMessageText(message) {
    if (!message) return '';
    return typeof message.text === 'string' ? message.text : '';
}

function buildTypingIndicator() {
    return '<div class="typing-indicator"><span></span><span></span><span></span></div>';
}

function makeSafeFileName(value, fallback = 'Rotys_AI') {
    return (value || fallback)
        .replace(/<[^>]*>?/gm, '')
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 60) || fallback;
}

function downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

function highlightCodeBlocks(container) {
    if (!window.hljs || !container) return;

    container.querySelectorAll('pre code').forEach(code => {
        if (!code.dataset.highlighted) {
            hljs.highlightElement(code);
        }
    });
}

function pruneStoredData() {
    allChats = allChats.slice(0, LIMITS.maxChats);

    allChats.forEach(chat => {
        if (Array.isArray(chat.msgs) && chat.msgs.length > LIMITS.maxMessagesPerChat) {
            chat.msgs = chat.msgs.slice(-LIMITS.maxMessagesPerChat);
        }
    });

    userGallery = userGallery.slice(0, LIMITS.maxGalleryItems);
}

function checkRateLimit() {
    const now = Date.now();
    const bucketKey = `rotys-ai-rate-${currentUserUid || 'guest'}`;
    const limit = currentEngine === 'roty-pro'
        ? LIMITS.maxProRequestsPerMinute
        : LIMITS.maxRequestsPerMinute;

    let timestamps = [];

    try {
        timestamps = JSON.parse(localStorage.getItem(bucketKey) || '[]')
            .filter(t => now - t < 60000);
    } catch (e) {
        timestamps = [];
    }

    if (timestamps.length >= limit) {
        showToast("Please slow down a little so the system stays responsive.", "error");
        return false;
    }

    timestamps.push(now);
    localStorage.setItem(bucketKey, JSON.stringify(timestamps));
    return true;
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    toast.className = `toast ${type}`;

    let icon = '<i class="fas fa-info-circle"></i>';

    if (type === 'success') {
        icon = '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
    }

    if (type === 'error') {
        icon = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>';
    }

    toast.innerHTML = `${icon} <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// --- DOM ---
const btnChatMode = document.getElementById('mode-chat');
const btnArtMode = document.getElementById('mode-art');

const authOverlay = document.getElementById('auth-overlay');
const btnMainAuth = document.getElementById('btn-main-auth');
const btnSwitchAuth = document.getElementById('btn-switch-auth');
const subtitle = document.getElementById('auth-subtitle');
const toggleMsg = document.getElementById('toggle-msg');
const errorMsg = document.getElementById('auth-error');
const successMsg = document.getElementById('auth-success');

const micBtn = document.getElementById('mic-btn');
const userInput = document.getElementById('user-input');
const artOptions = document.getElementById('art-options');
const imageModelSelect = document.getElementById('image-model-select');
const imageSizeSelect = document.getElementById('image-size-select');

const chatViewport = document.getElementById('chat-viewport');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');

// --- MODEL SELECTION LOGIC ---
function toggleModelDropdown() {
    document.getElementById('model-dropdown').classList.toggle('hidden');
    document.getElementById('persona-dropdown')?.classList.add('hidden');
}

function selectModel(engineId, engineName, element) {
    currentEngine = engineId;
    document.getElementById('current-model-name').innerText = engineName;
    
    // Highlight the active option in the menu
    document.querySelectorAll('#model-dropdown .model-option')
        .forEach(el => el.classList.remove('active'));

    if (element) {
        element.classList.add('active');
    }
    
    toggleModelDropdown();
    showToast(`Switched to ${engineName}`);
}

function togglePersonaDropdown() {
    document.getElementById('persona-dropdown').classList.toggle('hidden');
    document.getElementById('model-dropdown')?.classList.add('hidden');
}

function selectPersona(personaId, personaName, element) {
    currentPersona = personaId;
    currentPersonaName = personaName;
    document.getElementById('current-persona-name').innerText = personaName;

    document.querySelectorAll('#persona-dropdown .model-option')
        .forEach(el => el.classList.remove('active'));

    if (element) {
        element.classList.add('active');
    }

    togglePersonaDropdown();
    showToast(`Persona set to ${personaName}`, "success");
}

function toggleWebSearch() {
    webSearchEnabled = !webSearchEnabled;

    const btn = document.getElementById('web-search-toggle');
    btn.classList.toggle('active', webSearchEnabled);
    btn.title = webSearchEnabled ? "Web Search On" : "Web Search Off";

    showToast(webSearchEnabled ? "Web search enabled" : "Web search disabled");
}

function toggleArtEnhance() {
    enhanceArtPrompt = !enhanceArtPrompt;

    const btn = document.getElementById('enhance-art-toggle');
    btn.classList.toggle('active', enhanceArtPrompt);
    btn.title = enhanceArtPrompt ? "Enhance Prompt On" : "Enhance Prompt Off";

    showToast(enhanceArtPrompt ? "Art prompt enhancement on" : "Art prompt enhancement off");
}

if (imageModelSelect) {
    imageModelSelect.onchange = () => {
        currentImageModel = imageModelSelect.value;
        showToast(`Image model set to ${imageModelSelect.options[imageModelSelect.selectedIndex].text}`);
    };
}

if (imageSizeSelect) {
    imageSizeSelect.onchange = () => {
        currentImageSize = imageSizeSelect.value;
        showToast(`Image size set to ${imageSizeSelect.options[imageSizeSelect.selectedIndex].text}`);
    };
}

// Close dropdown if user clicks outside of it
document.addEventListener('click', (e) => {
    const pairs = [
        ['model-selector-btn', 'model-dropdown'],
        ['persona-selector-btn', 'persona-dropdown']
    ];

    pairs.forEach(([btnId, dropdownId]) => {
        const btn = document.getElementById(btnId);
        const dropdown = document.getElementById(dropdownId);

        if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    if (!e.target.closest('.message-download')) {
        document.querySelectorAll('.download-menu')
            .forEach(menu => menu.classList.add('hidden'));
    }
});

// --- ENGINE MODE TOGGLE ---
function setMode(mode) {
    isArtMode = mode === 'art';

    btnChatMode.classList.toggle('active', !isArtMode);
    btnArtMode.classList.toggle('active', isArtMode);
    artOptions?.classList.toggle('hidden', !isArtMode);

    if (isArtMode && currentImageData) {
        clearImageUpload();
        showToast("Photo analysis works in Chat Mode. Art Mode uses your text prompt.");
    }

    userInput.placeholder = isArtMode
        ? "Describe the image you want to generate..."
        : "Type a message or prompt...";
}

btnChatMode.onclick = () => setMode('chat');
btnArtMode.onclick = () => setMode('art');

// --- AUTH UI LOGIC ---
btnSwitchAuth.onclick = () => {
    isLoginMode = !isLoginMode;

    btnMainAuth.innerText = isLoginMode ? "Sign In" : "Sign Up";

    subtitle.innerText = isLoginMode
        ? "Welcome back! Sign in to continue."
        : "Join Roty's AI Studio today.";

    toggleMsg.innerText = isLoginMode
        ? "Don't have an account?"
        : "Already have an account?";

    btnSwitchAuth.innerText = isLoginMode ? "Sign Up" : "Sign In";

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
};

document.getElementById('btn-forgot-pass').onclick = async () => {
    const email = document.getElementById('auth-email').value;

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (!email) {
        errorMsg.innerText = "Please enter your email above to reset password.";
        errorMsg.style.display = 'block';
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);

        successMsg.innerText = "Password reset email sent! Check your inbox.";
        successMsg.style.display = 'block';

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

document.getElementById('btn-google').onclick = async () => {
    try {
        await auth.signInWithPopup(googleProvider);

        closeAuth();

        showToast("Logged in with Google", "success");

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

btnMainAuth.onclick = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        if (isLoginMode) {
            const userCred = await auth.signInWithEmailAndPassword(email, pass);

            if (
                !userCred.user.emailVerified &&
                userCred.user.providerData[0].providerId === 'password'
            ) {
                auth.signOut();

                throw new Error(
                    "Please check your email and click the verification link before signing in."
                );
            }

        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, pass);

            await userCred.user.sendEmailVerification();

            successMsg.innerText =
                "Account created! A verification link has been sent to your email.";

            successMsg.style.display = 'block';

            auth.signOut();

            return;
        }

        closeAuth();

        showToast("Successfully logged in!", "success");

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

// --- FIXED AUTH + INIT RACE CONDITION ---
auth.onAuthStateChanged(async (user) => {

    if (isInitializing) return;

    isInitializing = true;

    try {
        const sharedChatId = getSharedChatId();

        if (sharedChatId) {
            await loadSharedChat(sharedChatId);
            return;
        }

        if (
            user &&
            (
                user.emailVerified ||
                user.providerData[0].providerId !== 'password'
            )
        ) {
            isGuest = false;
            currentUserUid = user.uid;

            closeAuth();

            document.getElementById('user-display-email').innerText =
                user.displayName || user.email;

            document.getElementById('user-initial').innerText =
                (user.displayName || user.email)[0].toUpperCase();

            document.getElementById('logout-btn').style.display = 'block';
            document.getElementById('logout-btn').innerText = "Sign Out";
            document.getElementById('guest-history-msg').style.display = 'none';

            // Wait for ALL cloud data BEFORE init()
            await Promise.all([
                fetchChatsFromCloud(),
                fetchGalleryFromCloud()
            ]);

            init();

        } else if (isGuest) {
            closeAuth();
            init();

        } else {
            authOverlay.classList.remove('hidden');

            allChats = [];
            userGallery = [];

            renderHistory();
            startNewChat();
        }

    } catch (err) {
        console.error("Auth Init Error:", err);
        showToast("Initialization Error", "error");

    } finally {
        isInitializing = false;
    }
});

function useGuestMode() {
    isGuest = true;
    isSharedView = false;
    currentUserUid = null;

    closeAuth();

    showToast("Guest Mode Enabled");

    document.getElementById('user-display-email').innerText = "Guest Mode";
    document.getElementById('user-initial').innerText = "G";

    document.getElementById('logout-btn').style.display = 'block';
    document.getElementById('logout-btn').innerText = "Sign In";
    document.getElementById('guest-history-msg').style.display = 'block';

    allChats = [];
    userGallery = [];

    init();
}

function handleLogout() {
    auth.signOut().then(() => {
        currentUserUid = null;
        allChats = [];
        userGallery = [];

        authOverlay.classList.remove('hidden');
    });
}

function closeAuth() {
    authOverlay.classList.add('hidden');
}

// --- DEVELOPER PORTAL ---
function toggleDevPortal() {
    const modal = document.getElementById('dev-portal-modal');
    modal.classList.toggle('hidden');
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-btn')
        .forEach(btn => btn.classList.remove('active'));

    document.querySelectorAll('.tab-pane')
        .forEach(pane => pane.classList.remove('active'));

    if (element) {
        element.classList.add('active');
    }

    document.getElementById(tabId).classList.add('active');
}

// --- VOICE INPUT ---
const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();

    recognition.continuous = false;

    micBtn.onclick = () => {
        if (micBtn.classList.contains('mic-active')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    };

    recognition.onstart = () => {
        micBtn.classList.add('mic-active');
        userInput.placeholder = "Listening...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;

        userInput.value +=
            (userInput.value ? " " : "") + transcript;

        userInput.style.height = 'auto';

        userInput.style.height =
            userInput.scrollHeight + 'px';
    };

    recognition.onend = () => {
        micBtn.classList.remove('mic-active');

        userInput.placeholder = isArtMode
            ? "Describe the image you want to generate..."
            : "Type a message or prompt...";
    };

} else {
    micBtn.style.display = 'none';
}

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
            const res = await fetch('/api/chat', {
                method: "POST",
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
            const safeText =
                typeof data?.text === 'string' && data.text.trim().length > 0
                    ? data.text
                    : "The AI returned an empty response.";

            const aiIndex = await pushAiMessage(chat, safeText, { engine, persona });
            renderAiMessage(aiNode, safeText, aiIndex);

        } catch (e) {
            console.error("Chat Error:", e);

            const errorText = "Connection issue: " + e.message;
            const aiIndex = await pushAiMessage(chat, errorText, { engine, persona, failed: true });
            renderAiMessage(aiNode, errorText, aiIndex);
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
    return aiIndex;
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
        const res = await fetch('/api/image', {
            method: "POST",
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
        const aiIndex = await pushAiMessage(chat, aiText, {
            engine: currentEngine,
            persona: currentPersona,
            imageModel: currentImageModel
        });

        renderAiMessage(document.getElementById(aiId), aiText, aiIndex, { isHtml: true });
        saveImageToGallery(data.url, data.revisedPrompt || text);

    } catch (e) {
        console.error("Image Generation Error:", e);

        const errorText = `Image generation failed: ${e.message}. Try Turbo or a smaller prompt.`;
        const aiIndex = await pushAiMessage(chat, errorText, { failed: true });
        renderAiMessage(document.getElementById(aiId), errorText, aiIndex);
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

// --- HISTORY ---
function renderHistory() {
    historyList.innerHTML = '';

    if (isGuest) return;

    allChats.forEach((c, index) => {
        const d = document.createElement('div');
        d.className = `history-item ${c.id === currentChatId ? 'active' : ''}`;

        d.innerHTML = `
            <span
                style="
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    flex:1;
                "
                onclick="loadChat(${c.id})"
            >
                <i class="far fa-comment-alt"></i>
                ${escapeHtml(c.title)}
            </span>

            <button
                onclick="deleteChat(${index})"
                style="
                    background:none;
                    border:none;
                    color:var(--text-dim);
                    cursor:pointer;
                    padding:4px;
                "
            >
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        historyList.appendChild(d);
    });
}

function loadChat(id) {
    currentChatId = id;

    const chat = allChats.find(c => c.id === id);

    chatViewport.innerHTML = '';

    if (chat) {
        chat.msgs.forEach((m, index) =>
            appendMessage(m.role, m, index)
        );
    }

    renderHistory();

    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

async function deleteChat(index) {
    const chatToDelete = allChats[index];

    allChats.splice(index, 1);

    if (
        allChats.length === 0 ||
        chatToDelete.id === currentChatId
    ) {
        startNewChat();
    }

    renderHistory();

    if (!isGuest && currentUserUid) {
        try {
            await db
                .collection('users')
                .doc(currentUserUid)
                .collection('chats')
                .doc(chatToDelete.id.toString())
                .delete();
        } catch (e) {
            console.error("Error deleting from cloud:", e);
        }
    }
}

function deleteAllHistory() {
    if (confirm("Are you sure you want to clear all conversations?")) {
        const chatsToDelete = [...allChats];
        allChats = [];

        startNewChat();
        renderHistory();

        if (!isGuest && currentUserUid) {
            chatsToDelete.forEach(async (chat) => {
                try {
                    await db
                        .collection('users')
                        .doc(currentUserUid)
                        .collection('chats')
                        .doc(chat.id.toString())
                        .delete();
                } catch (e) {}
            });
        }
    }
}

// --- EVENTS ---
sendBtn.onclick = handleSend;

userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
};

userInput.oninput = function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight > 200 ? 200 : this.scrollHeight) + 'px';
};

document
    .getElementById('doc-upload')
    .addEventListener('change', async function(e) {
        const file = e.target.files[0];

        if (!file) return;

        const allowed = [
            'text/plain',
            'text/markdown',
            'text/csv',
            'application/json',
            'application/pdf',
            ''
        ];

        if (!allowed.includes(file.type) && !/\.(txt|md|csv|json|pdf)$/i.test(file.name)) {
            showToast("Please upload a TXT, MD, CSV, JSON, or PDF file.", "error");
            clearDocumentUpload();
            return;
        }

        if (file.size > LIMITS.maxDocumentBytes) {
            showToast("File is too large. Please keep it under 8MB.", "error");
            clearDocumentUpload();
            return;
        }

        try {
            let content = '';

            if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
                content = await extractPdfText(file);
            } else {
                content = await file.text();
            }

            attachDocumentContent(file.name, content);

        } catch (error) {
            console.error("Document Read Error:", error);
            showToast("Could not read this document.", "error");
            clearDocumentUpload();
        }
    });

async function extractPdfText(file) {
    if (!window.pdfjsLib) {
        throw new Error("PDF reader is still loading.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 25);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map(item => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (pageText) {
            pages.push(`Page ${pageNumber}: ${pageText}`);
        }
    }

    if (pdf.numPages > maxPages) {
        pages.push(`Only the first ${maxPages} pages were attached to keep the chat fast.`);
    }

    return pages.join('\n\n') || "No selectable text was found in this PDF.";
}

function attachDocumentContent(name, content) {
    let safeContent = String(content || '');

    if (safeContent.length > LIMITS.maxDocumentChars) {
        safeContent = safeContent.slice(0, LIMITS.maxDocumentChars);
        showToast("File attached. Long content was trimmed for speed.");
    } else {
        showToast("File attached.", "success");
    }

    currentDocumentAttachment = {
        name,
        content: safeContent
    };

    document.getElementById('document-name').innerText = name;
    document.getElementById('document-preview-container').style.display = 'flex';
}

// --- GALLERY ---
function toggleGallery() {
    const modal = document.getElementById('gallery-modal');

    modal.classList.toggle('hidden');

    if (!modal.classList.contains('hidden')) {
        renderGallery();
    }
}

async function fetchGalleryFromCloud() {
    if (isGuest || !currentUserUid) return;

    try {
        const snapshot = await db
            .collection('users')
            .doc(currentUserUid)
            .collection('gallery')
            .orderBy('createdAt', 'desc')
            .get();

        userGallery = [];

        snapshot.forEach(doc => {
            userGallery.push({
                id: doc.id,
                ...doc.data()
            });
        });

    } catch (e) {
        console.error("Error loading gallery:", e);
    }
}

async function saveImageToGallery(imageUrl, promptText) {
    if (isGuest || !currentUserUid) return;

    const imageObj = {
        url: imageUrl,
        prompt: promptText,
        createdAt: Date.now()
    };

    try {
        const docRef = await db
            .collection('users')
            .doc(currentUserUid)
            .collection('gallery')
            .add(imageObj);

        userGallery.unshift({
            id: docRef.id,
            ...imageObj
        });

        if (userGallery.length > LIMITS.maxGalleryItems) {
            const extras = userGallery.splice(LIMITS.maxGalleryItems);
            extras.forEach(extra => {
                if (extra.id) {
                    db.collection('users')
                        .doc(currentUserUid)
                        .collection('gallery')
                        .doc(extra.id)
                        .delete()
                        .catch(() => {});
                }
            });
        }

        showToast("Art saved to gallery!", "success");

    } catch (e) {
        console.error("Error saving image:", e);
    }
}

function renderGallery() {
    const grid = document.getElementById('gallery-grid');

    grid.innerHTML = '';

    if (userGallery.length === 0) {
        grid.innerHTML = `
            <p
                style="
                    color: var(--text-dim);
                    grid-column: 1 / -1;
                    text-align: center;
                    margin-top: 50px;
                "
            >
                No images generated yet. Switch to Art Mode and create something!
            </p>
        `;

        return;
    }

    userGallery.forEach((img, index) => {
        const div = document.createElement('div');

        div.className = 'gallery-item';
        div.title = img.prompt;

        div.innerHTML = `
            <img src="${img.url}" alt="AI Generated Art" onclick="openImageLightbox(${index})">

            <a
                href="${img.url}"
                target="_blank"
                download="Rotys_Art.jpg"
                class="gallery-download-btn"
                title="Download"
                onclick="event.stopPropagation()"
            >
                <i class="fas fa-download"></i>
            </a>

            <button
                class="gallery-delete-btn"
                title="Delete"
                onclick="event.stopPropagation(); deleteGalleryImage(${index})"
            >
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        grid.appendChild(div);
    });
}

function openImageLightbox(index) {
    const img = userGallery[index];
    if (!img) return;

    activeLightboxIndex = index;
    document.getElementById('lightbox-image').src = img.url;
    document.getElementById('lightbox-prompt').innerText = img.prompt || "Generated artwork";
    document.getElementById('lightbox-download').href = img.url;
    document.getElementById('lightbox-delete').onclick = () => deleteGalleryImage(index, true);
    document.getElementById('image-lightbox-modal').classList.remove('hidden');
}

function closeImageLightbox() {
    activeLightboxIndex = null;
    document.getElementById('image-lightbox-modal').classList.add('hidden');
}

async function deleteGalleryImage(index, fromLightbox = false) {
    const img = userGallery[index];

    if (!img) return;
    if (!confirm("Delete this artwork from your gallery?")) return;

    userGallery.splice(index, 1);

    if (!isGuest && currentUserUid && img.id) {
        try {
            await db
                .collection('users')
                .doc(currentUserUid)
                .collection('gallery')
                .doc(img.id)
                .delete();
        } catch (e) {
            console.error("Gallery Delete Error:", e);
            showToast("Could not delete this image from the cloud.", "error");
        }
    }

    if (fromLightbox || activeLightboxIndex === index) {
        closeImageLightbox();
    }

    renderGallery();
    showToast("Image deleted.", "success");
}

// --- FIXED CHAT FETCH ---
async function fetchChatsFromCloud() {
    if (isGuest || !currentUserUid) return;

    try {
        const snapshot = await db
            .collection('users')
            .doc(currentUserUid)
            .collection('chats')
            .orderBy('updatedAt', 'desc')
            .get();

        allChats = [];

        snapshot.forEach(doc => {
            const data = doc.data();

            if (data && data.id) {
                allChats.push(data);
            }
        });

    } catch (error) {
        console.error("Error loading chats from cloud:", error);
    }
}

// --- SIDEBAR ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');

    if (sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
        overlay.style.opacity = '0';

        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);

    } else {
        sidebar.classList.add('mobile-open');
        overlay.style.display = 'block';

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 10);
    }
}

// --- THEME ---
function toggleTheme() {
    const html = document.documentElement;

    const theme =
        html.getAttribute('data-theme') === 'dark'
            ? 'light'
            : 'dark';

    html.setAttribute('data-theme', theme);
}

// --- FIXED IMAGE UPLOADER & COMPRESSOR ---
document
    .getElementById('img-upload')
    .addEventListener('change', async function(e) {
        const file = e.target.files[0];

        if (!file) return;

        if (isArtMode) {
            setMode('chat');
            showToast("Photo uploaded in Chat Mode for analysis.");
        }

        // HARD LIMIT
        if (file.size > 10 * 1024 * 1024) {
            showToast("Image too large. Max 10MB.", "error");
            clearImageUpload();
            return;
        }

        const reader = new FileReader();

        reader.onload = function(event) {
            const img = new Image();

            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                let scale = MAX_WIDTH / img.width;

                if (scale > 1) scale = 1;

                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                const ctx = canvas.getContext('2d');

                ctx.drawImage(
                    img,
                    0, 0,
                    canvas.width, canvas.height
                );

                // STRONGER COMPRESSION
                currentImageData = canvas.toDataURL('image/jpeg', 0.5);

                // EXTRA SAFETY LIMIT
                if (currentImageData.length > 4_000_000) {
                    showToast("Compressed image still too large.", "error");
                    currentImageData = null;
                    clearImageUpload();
                    return;
                }

                document.getElementById('image-preview').src = currentImageData;
                document.getElementById('image-preview-container').style.display = 'flex';
                showToast("Photo uploaded. Ask me what to describe or extract.", "success");
            };

            img.src = event.target.result;
        };

        reader.readAsDataURL(file);
    });

function clearImageUpload() {
    currentImageData = null;
    document.getElementById('img-upload').value = "";
    document.getElementById('image-preview-container').style.display = 'none';
}

function clearDocumentUpload() {
    currentDocumentAttachment = null;
    document.getElementById('doc-upload').value = "";
    document.getElementById('document-name').innerText = "";
    document.getElementById('document-preview-container').style.display = 'none';
}
