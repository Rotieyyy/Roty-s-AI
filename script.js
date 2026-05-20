const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatFlow = document.getElementById('chat-flow');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const clearHistoryBtn = document.getElementById('clear-history');

let currentChatId = null;
let allChats = JSON.parse(localStorage.getItem('roty_chats')) || [];

const IDENTITY = "I am Roty's AI, a fast and smart assistant. I was launched in May 2024 to help you with anything you need!";

function init() {
    renderHistory();
    if (allChats.length > 0) {
        loadChat(allChats[0].id);
    } else {
        startNewChat();
    }
}

function startNewChat() {
    currentChatId = Date.now();
    chatFlow.innerHTML = `
        <div class="welcome-hero">
            <h2 class="gradient-text">Roty's AI</h2>
            <p>I'm ready. What's on your mind?</p>
        </div>`;
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    const welcome = document.querySelector('.welcome-hero');
    if (welcome) welcome.remove();

    appendMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';

    const aiMsgId = appendMessage('ai', 'Thinking...');
    const aiMsgDiv = document.getElementById(aiMsgId);
    
    let responseText = "";

    if (text.toLowerCase().includes("who are you") || text.toLowerCase().includes("your name")) {
        responseText = IDENTITY;
    } else {
        try {
            const response = await fetch('/api/chat', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: text })
            });
            
            const data = await response.json();

            if (data.error) {
                responseText = "Error: " + data.error;
            } else if (data.candidates && data.candidates[0].content.parts[0].text) {
                responseText = data.candidates[0].content.parts[0].text;
            } else {
                responseText = "I couldn't process that. Try again.";
            }
        } catch (e) {
            responseText = "Network error. Please try again later.";
        }
    }

    aiMsgDiv.innerText = responseText;
    saveChat(text, responseText);
    chatFlow.scrollTop = chatFlow.scrollHeight;
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
    historyList.innerHTML = '';
    allChats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `<i class="far fa-comment"></i> ${chat.title}`;
        item.onclick = () => loadChat(chat.id);
        historyList.appendChild(item);
    });
}

function loadChat(id) {
    currentChatId = id;
    const chat = allChats.find(c => c.id === id);
    if (!chat) return;
    chatFlow.innerHTML = '';
    chat.messages.forEach(msg => appendMessage(msg.role, msg.content));
    renderHistory();
}

function appendMessage(role, text) {
    const id = "msg-" + Math.random().toString(36).substr(2, 9);
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
    msgDiv.id = id;
    msgDiv.innerText = text;
    chatFlow.appendChild(msgDiv);
    chatFlow.scrollTop = chatFlow.scrollHeight;
    return id;
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }});
newChatBtn.addEventListener('click', startNewChat);
clearHistoryBtn.addEventListener('click', () => {
    if(confirm("Delete all history?")) { allChats = []; localStorage.removeItem('roty_chats'); startNewChat(); renderHistory(); }
});
userInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });

init();
