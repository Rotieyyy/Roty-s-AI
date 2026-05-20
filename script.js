// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "rotys-ai.firebaseapp.com",
    projectId: "rotys-ai",
    appId: "..."
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- STATE ---
let currentChatId = null;
let allChats = JSON.parse(localStorage.getItem('roty_chats')) || [];
let isLoginMode = true;

// --- AUTH UI LOGIC ---
const authOverlay = document.getElementById('auth-overlay');
const btnMainAuth = document.getElementById('btn-main-auth');
const btnSwitchAuth = document.getElementById('btn-switch-auth');
const subtitle = document.getElementById('auth-subtitle');
const toggleMsg = document.getElementById('toggle-msg');
const errorMsg = document.getElementById('auth-error');

btnSwitchAuth.onclick = () => {
    isLoginMode = !isLoginMode;
    btnMainAuth.innerText = isLoginMode ? "Sign In" : "Create Account";
    subtitle.innerText = isLoginMode ? "Welcome back! Sign in to continue." : "Join Roty's AI Studio today.";
    toggleMsg.innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    btnSwitchAuth.innerText = isLoginMode ? "Create Account" : "Sign In";
};

btnMainAuth.onclick = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    errorMsg.style.display = 'none';

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            await auth.createUserWithEmailAndPassword(email, pass);
        }
        authOverlay.style.display = 'none';
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

auth.onAuthStateChanged(user => {
    if (user) {
        authOverlay.style.display = 'none';
        document.getElementById('user-display-email').innerText = user.email;
        document.getElementById('user-initial').innerText = user.email[0].toUpperCase();
        document.getElementById('logout-btn').style.display = 'block';
    }
});

function handleLogout() { auth.signOut().then(() => location.reload()); }
function closeAuth() { authOverlay.style.display = 'none'; }

// --- THEME ---
function toggleTheme() {
    const html = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
}

// --- CHAT ENGINE ---
const chatViewport = document.getElementById('chat-viewport');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');

function init() {
    renderHistory();
    startNewChat();
}

function startNewChat() {
    currentChatId = Date.now();
    chatViewport.innerHTML = `
        <div class="welcome-hero" id="welcome-hero">
            <h1 class="shimmer-text">Design. Code. Create.</h1>
            <p>Experience the future of Roty's AI Studio.</p>
        </div>`;
    renderHistory();
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    if (document.getElementById('welcome-hero')) document.getElementById('welcome-hero').remove();

    appendMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';

    // Image logic
    const artKeywords = ["draw", "image", "generate", "photo", "art"];
    if (artKeywords.some(w => text.toLowerCase().includes(w))) {
        const id = appendMessage('ai', '<span class="pulse-dot"></span> Painting your visualization...');
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
        setTimeout(() => {
            document.getElementById(id).innerHTML = `
                <div class="img-wrapper">
                    <img src="${url}" style="width:100%; border-radius:16px; margin-top:16px; border:1px solid var(--border);">
                </div>`;
            saveChat(text, "[Generated Image]");
        }, 3000);
        return;
    }

    // Text logic (Groq)
    const aiId = appendMessage('ai', '<span class="pulse-dot"></span> Processing neural response...');
    try {
        const res = await fetch('/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        document.getElementById(aiId).innerHTML = marked.parse(data.text);
        saveChat(text, data.text);
    } catch (e) {
        document.getElementById(aiId).innerText = "Engine Error. Try again.";
    }
}

function appendMessage(role, content) {
    const id = "msg-" + Math.random();
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.id = id;
    div.innerHTML = role === 'ai' && content.includes('<span') ? content : (role === 'ai' ? marked.parse(content) : content);
    chatViewport.appendChild(div);
    chatViewport.scrollTop = chatViewport.scrollHeight;
    return id;
}

function saveChat(u, a) {
    let chat = allChats.find(c => c.id === currentChatId);
    if (!chat) {
        chat = { id: currentChatId, title: u.substring(0, 30) + "...", msgs: [] };
        allChats.unshift(chat);
    }
    chat.msgs.push({ role: 'user', text: u }, { role: 'ai', text: a });
    localStorage.setItem('roty_chats', JSON.stringify(allChats));
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(c => {
        const d = document.createElement('div');
        d.className = `history-item ${c.id === currentChatId ? 'active' : ''}`;
        d.innerHTML = `<i class="far fa-message"></i> ${c.title}`;
        d.onclick = () => {
            currentChatId = c.id;
            chatViewport.innerHTML = '';
            c.msgs.forEach(m => appendMessage(m.role, m.text));
            renderHistory();
        };
        historyList.appendChild(d);
    });
}

function quickPrompt(t) { userInput.value = t; handleSend(); }
sendBtn.onclick = handleSend;
userInput.onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }};
userInput.oninput = function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; };

init();