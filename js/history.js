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

