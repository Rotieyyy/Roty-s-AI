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

// --- STATE ---
let currentChatId = null;
let allChats = JSON.parse(localStorage.getItem('roty_chats')) || [];
let isLoginMode = true;
let currentImageData = null;

// --- AUTH UI LOGIC ---
const authOverlay = document.getElementById('auth-overlay');
const btnMainAuth = document.getElementById('btn-main-auth');
const btnSwitchAuth = document.getElementById('btn-switch-auth');
const subtitle = document.getElementById('auth-subtitle');
const toggleMsg = document.getElementById('toggle-msg');
const errorMsg = document.getElementById('auth-error');
const successMsg = document.getElementById('auth-success');

btnSwitchAuth.onclick = () => {
    isLoginMode = !isLoginMode;
    btnMainAuth.innerText = isLoginMode ? "Sign In" : "Create Account";
    subtitle.innerText = isLoginMode ? "Welcome back! Sign in to continue." : "Join Roty's AI Studio today.";
    toggleMsg.innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    btnSwitchAuth.innerText = isLoginMode ? "Create Account" : "Sign In";
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
};

btnMainAuth.onclick = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        if (isLoginMode) {
            const userCred = await auth.signInWithEmailAndPassword(email, pass);
            if (!userCred.user.emailVerified) {
                auth.signOut();
                throw new Error("Please check your email and click the verification link before signing in.");
            }
        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, pass);
            await userCred.user.sendEmailVerification();
            successMsg.innerText = "Account created! A verification link has been sent to your email. Please verify before signing in.";
            successMsg.style.display = 'block';
            auth.signOut(); 
            return;
        }
        closeAuth();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

auth.onAuthStateChanged(user => {
    if (user && user.emailVerified) {
        closeAuth();
        document.getElementById('user-display-email').innerText = user.email;
        document.getElementById('user-initial').innerText = user.email[0].toUpperCase();
        document.getElementById('logout-btn').style.display = 'block';
    } else {
        document.getElementById('user-display-email').innerText = "Guest Mode";
        document.getElementById('user-initial').innerText = "G";
        document.getElementById('logout-btn').style.display = 'none';
    }
});

function handleLogout() { 
    auth.signOut().then(() => {
        authOverlay.classList.remove('hidden'); 
    }); 
}

function closeAuth() { 
    authOverlay.classList.add('hidden'); 
}

// --- THEME ---
function toggleTheme() {
    const html = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
}

// --- FILE UPLOAD LOGIC ---
document.getElementById('img-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(re) {
            currentImageData = re.target.result;
            document.getElementById('image-preview').src = currentImageData;
            document.getElementById('image-preview-container').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
});

function clearImageUpload() {
    currentImageData = null;
    document.getElementById('img-upload').value = "";
    document.getElementById('image-preview-container').style.display = 'none';
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
            <div class="hero-logo"><i class="fas fa-layer-group"></i></div>
            <h1 class="shimmer-text">Hello, I'm Roty's AI.</h1>
            <p>What shall we build today?</p>
        </div>`;
}

async function handleSend() {
    let text = userInput.value.trim();
    if (!text && !currentImageData) return;

    if (document.getElementById('welcome-hero')) document.getElementById('welcome-hero').remove();

    let userMessageHTML = text;
    if (currentImageData) {
        userMessageHTML = `<img src="${currentImageData}" style="max-width: 200px; border-radius: 8px; margin-bottom: 10px; display: block;">` + text;
    }
    
    appendMessage('user', userMessageHTML);
    saveChat(userMessageHTML, null); 

    userInput.value = '';
    userInput.style.height = 'auto';
    clearImageUpload();

    const artKeywords = ["draw", "image", "generate", "photo", "art"];
    if (artKeywords.some(w => text.toLowerCase().includes(w))) {
        const id = appendMessage('ai', '<span class="pulse-dot"></span> Generating visualization...');
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
        
        setTimeout(() => {
            const finalHtml = `<div class="img-wrapper"><img src="${url}" style="width:100%; border-radius:12px; margin-top:8px; border:1px solid var(--border);"></div>`;
            document.getElementById(id).innerHTML = finalHtml;
            updateLastAiResponse(finalHtml);
        }, 3000);
        return;
    }

    const aiId = appendMessage('ai', '<span class="pulse-dot"></span> Processing...');
    try {
        const res = await fetch('/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        document.getElementById(aiId).innerHTML = marked.parse(data.text);
        updateLastAiResponse(data.text);
    } catch (e) {
        document.getElementById(aiId).innerText = "Engine Error. Check connection.";
        updateLastAiResponse("Engine Error. Check connection.");
    }
}

function appendMessage(role, content) {
    const id = "msg-" + Math.random();
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.id = id;
    
    if (role === 'ai') {
        if (content.includes('<span') || content.includes('<img') || content.includes('<div')) {
            div.innerHTML = content;
        } else {
            div.innerHTML = marked.parse(content);
        }
    } else {
        div.innerHTML = content;
    }
    
    chatViewport.appendChild(div);
    chatViewport.scrollTo({ top: chatViewport.scrollHeight, behavior: 'smooth' });
    return id;
}

function saveChat(userText, aiText) {
    let chat = allChats.find(c => c.id === currentChatId);
    if (!chat) {
        const cleanTitle = userText.replace(/<[^>]*>?/gm, '');
        chat = { id: currentChatId, title: cleanTitle.substring(0, 30) || "New Conversation", msgs: [] };
        allChats.unshift(chat);
    }
    chat.msgs.push({ role: 'user', text: userText });
    if (aiText) {
        chat.msgs.push({ role: 'ai', text: aiText });
    }
    localStorage.setItem('roty_chats', JSON.stringify(allChats));
    renderHistory();
}

function updateLastAiResponse(aiText) {
    let chat = allChats.find(c => c.id === currentChatId);
    if (chat) {
        chat.msgs.push({ role: 'ai', text: aiText });
        localStorage.setItem('roty_chats', JSON.stringify(allChats));
    }
}

// --- HISTORY MANAGEMENT ---
function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach((c, index) => {
        const d = document.createElement('div');
        d.className = `history-item ${c.id === currentChatId ? 'active' : ''}`;
        d.innerHTML = `
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" onclick="loadChat(${c.id})">
                <i class="far fa-comment-alt"></i> ${c.title}
            </span>
            <button onclick="deleteChat(${index})" style="background:none; border:none; color:var(--text-dim); cursor:pointer; padding: 4px; transition: color 0.2s;">
                <i class="fas fa-trash-alt hover:text-red-500"></i>
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
        chat.msgs.forEach(m => appendMessage(m.role, m.text));
    }
    renderHistory();
}

function deleteChat(index) {
    allChats.splice(index, 1);
    localStorage.setItem('roty_chats', JSON.stringify(allChats));
    if (allChats.length === 0 || allChats[index]?.id === currentChatId) {
        startNewChat();
    }
    renderHistory();
}

function deleteAllHistory() {
    if(confirm("Are you sure you want to clear all conversations?")) {
        allChats = [];
        localStorage.removeItem('roty_chats');
        startNewChat();
        renderHistory();
    }
}

sendBtn.onclick = handleSend;
userInput.onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }};
userInput.oninput = function() { this.style.height = 'auto'; this.style.height = (this.scrollHeight > 200 ? 200 : this.scrollHeight) + 'px'; };

init();
