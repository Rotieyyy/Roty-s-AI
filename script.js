const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatViewport = document.getElementById('chat-viewport');
const historyList = document.getElementById('history-list');

// --- STATE ---
let currentChatId = null;
let allChats = JSON.parse(localStorage.getItem('roty_chats')) || [];

// --- IDENTITY ---
const IDENTITY = "I am Roty's AI, a multi-modal assistant. I use the Groq engine for reasoning and Pollinations for image generation.";

function init() {
    renderHistory();
    if (allChats.length > 0) loadChat(allChats[0].id);
    else startNewChat();
}

function startNewChat() {
    currentChatId = Date.now();
    chatViewport.innerHTML = `
        <div class="welcome-hero">
            <h1 class="gradient-text">Hello. I am Roty's AI.</h1>
            <p>I can help you code, write, and generate stunning art.</p>
        </div>`;
    renderHistory();
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    // UI Cleanup
    const hero = document.getElementById('welcome-hero');
    if (hero) hero.remove();

    appendMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';

    // 1. CHECK FOR IMAGE REQUEST
    const artWords = ["draw", "photo", "image", "generate", "art", "picture", "paint"];
    const isArt = artWords.some(word => text.toLowerCase().includes(word));

    if (isArt) {
        const aiMsgId = appendMessage('ai', '🎨 Roty is painting...');
        const aiMsgDiv = document.getElementById(aiMsgId);
        
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random()*1000)}`;
        
        setTimeout(() => {
            aiMsgDiv.innerHTML = `
                <div class="image-box">
                    <p>I've generated this for you:</p>
                    <img src="${imageUrl}" style="width: 100%; border-radius: 15px; margin-top: 15px; border: 1px solid #333;">
                </div>`;
            saveChat(text, "[Generated Image]");
        }, 2000);
        return;
    }

    // 2. TEXT REQUEST (GROQ)
    const aiMsgId = appendMessage('ai', '<span class="pulse">Thinking...</span>');
    const aiMsgDiv = document.getElementById(aiMsgId);

    try {
        const response = await fetch('/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text })
        });
        
        const data = await response.json();
        const responseText = data.text || "No response.";
        
        // Use Marked.js to render organized Markdown
        aiMsgDiv.innerHTML = marked.parse(responseText);
        saveChat(text, responseText);
    } catch (e) {
        aiMsgDiv.innerText = "Error connecting to Roty Engine.";
    }
    chatViewport.scrollTop = chatViewport.scrollHeight;
}

function saveChat(userText, aiText) {
    let chat = allChats.find(c => c.id === currentChatId);
    if (!chat) {
        chat = { id: currentChatId, title: userText.substring(0, 30) + "...", messages: [] };
        allChats.unshift(chat);
    }
    chat.messages.push({ role: 'user', content: userText }, { role: 'ai', content: aiText });
    localStorage.setItem('roty_chats', JSON.stringify(allChats));
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = '<p class="label">Recent Conversations</p>';
    allChats.forEach(chat => {
        const div = document.createElement('div');
        div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
        div.innerHTML = `<i class="far fa-comment"></i> ${chat.title}`;
        div.onclick = () => loadChat(chat.id);
        historyList.appendChild(div);
    });
}

function loadChat(id) {
    currentChatId = id;
    const chat = allChats.find(c => c.id === id);
    chatViewport.innerHTML = '';
    chat.messages.forEach(msg => appendMessage(msg.role, msg.content));
    renderHistory();
}

function appendMessage(role, text) {
    const id = "msg-" + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.id = id;
    
    // Check if it's AI message and needs parsing
    if (role === 'ai' && text !== 'Thinking...') {
        div.innerHTML = marked.parse(text);
    } else {
        div.innerText = text;
    }

    chatViewport.appendChild(div);
    chatViewport.scrollTop = chatViewport.scrollHeight;
    return id;
}

// UI HELPERS
function quickPrompt(t) { userInput.value = t; handleSend(); }
function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('collapsed'); }
document.getElementById('login-trigger').onclick = () => document.getElementById('auth-modal').style.display = 'flex';
function closeAuth() { document.getElementById('auth-modal').style.display = 'none'; }

sendBtn.onclick = handleSend;
userInput.onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }};
userInput.oninput = function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; };

init();