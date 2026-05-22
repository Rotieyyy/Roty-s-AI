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

const chatViewport = document.getElementById('chat-viewport');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');

// --- ENGINE MODE TOGGLE ---
function setMode(mode) {
    isArtMode = mode === 'art';

    btnChatMode.classList.toggle('active', !isArtMode);
    btnArtMode.classList.toggle('active', isArtMode);

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

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn')
        .forEach(btn => btn.classList.remove('active'));

    document.querySelectorAll('.tab-pane')
        .forEach(pane => pane.classList.remove('active'));

    event.target.classList.add('active');
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

// --- FIXED HANDLE SEND WITH PROPER HISTORY ---
async function handleSend() {
    let text = userInput.value.trim();

    if (!text && !currentImageData) return;

    if (document.getElementById('welcome-hero')) {
        document.getElementById('welcome-hero').remove();
    }

    const imageToSend = currentImageData;

    appendMessage(
        'user',
        imageToSend
            ? `<img src="${imageToSend}" style="max-width:200px">${text}`
            : text
    );

    saveChat(text, null);

    userInput.value = '';
    clearImageUpload();

    // --- STRICT MODE VALIDATION ---
    if (isArtMode) {
        const id = appendMessage('ai', 'Generating art...');

        const url =
            `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?seed=${Date.now()}`;

        document.getElementById(id).innerHTML =
            `<img src="${url}" style="width:100%">`;

        saveImageToGallery(url, text);

        return;
    }

    // BLOCK IMAGE REQUESTS IN CHAT MODE
    const imageKeywords = [
        'generate image', 'create image', 'make image',
        'draw', 'generate art', 'make art', 'create art'
    ];

    const lower = text.toLowerCase();
    const wantsImage = imageKeywords.some(k => lower.includes(k));

    if (wantsImage && !isArtMode) {
        appendMessage('ai', 'Please switch to Art Mode to generate images.');
        return;
    }

    const aiId = appendMessage(
        'ai',
        '<div class="typing-indicator"></div>'
    );

    // --- GET CHAT HISTORY ---
    let chatSession = allChats.find(c => c.id === currentChatId);
    let chatHistory = [];

    if (chatSession && chatSession.msgs) {
        // We slice off the last message because it's the current prompt, 
        // which we are passing in the "prompt" variable below.
        chatHistory = chatSession.msgs.slice(0, -1).map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text
        }));
    }

    try {
        const res = await fetch('/api/chat', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: text,
                history: chatHistory, // FIXED: Now passing actual memory instead of []
                image: imageToSend,
                mode: isArtMode ? 'art' : 'chat'
            })
        });

        if (!res.ok) {
            throw new Error(`Server Error ${res.status}`);
        }

        const data = await res.json();

        // --- FIXED NULL VALIDATION ---
        const safeText =
            typeof data?.text === 'string' &&
            data.text.trim().length > 0
                ? data.text
                : "The AI returned an empty response.";

        document.getElementById(aiId).innerHTML = marked.parse(safeText);

        addCopyButtons(document.getElementById(aiId));

        await updateLastAiResponse(safeText);

    } catch (e) {
        console.error("Chat Error:", e);

        document.getElementById(aiId).innerText =
            "Connection Error: " + e.message;
    }
}

// --- APPEND MESSAGE ---
function appendMessage(role, content) {
    const id = "msg-" + Math.random();
    const div = document.createElement('div');

    div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.id = id;

    if (role === 'ai') {
        if (
            content.includes('<span') ||
            content.includes('<img') ||
            content.includes('<div')
        ) {
            div.innerHTML = content;
        } else {
            const safeContent =
                typeof content === 'string'
                    ? content
                    : "Invalid response.";

            div.innerHTML = marked.parse(safeContent);

            addCopyButtons(div);
        }
    } else {
        div.innerHTML = content;
    }

    chatViewport.appendChild(div);

    chatViewport.scrollTo({
        top: chatViewport.scrollHeight,
        behavior: 'smooth'
    });

    return id;
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

// --- SAVE CHAT ---
async function saveChat(userText, aiText) {
    if (isGuest) return;

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
    renderHistory();

    if (currentUserUid) {
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

// --- UPDATE AI RESPONSE ---
async function updateLastAiResponse(aiText) {
    if (isGuest || !currentUserUid) return;

    let chat = allChats.find(c => c.id === currentChatId);

    if (chat) {
        chat.msgs.push({
            role: 'ai',
            text: aiText
        });

        chat.updatedAt = Date.now();

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

// --- EXPORT CHAT ---
function exportChat() {
    let chat = allChats.find(c => c.id === currentChatId);

    if (!chat || chat.msgs.length === 0) {
        showToast("No messages to export!", "error");
        return;
    }

    let content = `# ${chat.title}\n\n`;

    chat.msgs.forEach(m => {
        const role = m.role === 'user' ? 'You' : "Roty's AI";

        content += `
### ${role}
${m.text.replace(/<img[^>]*>/g, '[Image]')}

`;
    });

    const blob = new Blob([content], {
        type: 'text/markdown'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `${chat.title.replace(/\s+/g, '_')}_Export.md`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("Conversation exported successfully!", "success");
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
                ${c.title}
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
        chat.msgs.forEach(m =>
            appendMessage(m.role, m.text)
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
            userGallery.push(doc.data());
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

    userGallery.unshift(imageObj);

    try {
        await db
            .collection('users')
            .doc(currentUserUid)
            .collection('gallery')
            .add(imageObj);

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

    userGallery.forEach(img => {
        const div = document.createElement('div');

        div.className = 'gallery-item';
        div.title = img.prompt;

        div.innerHTML = `
            <img src="${img.url}" alt="AI Generated Art">

            <a
                href="${img.url}"
                target="_blank"
                download="Rotys_Art.jpg"
                class="gallery-download-btn"
                title="Download"
            >
                <i class="fas fa-download"></i>
            </a>
        `;

        grid.appendChild(div);
    });
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

        // HARD LIMIT
        if (file.size > 10 * 1024 * 1024) {
            showToast("Image too large. Max 10MB.", "error");
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
                    return;
                }

                document.getElementById('image-preview').src = currentImageData;
                document.getElementById('image-preview-container').style.display = 'flex';
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
