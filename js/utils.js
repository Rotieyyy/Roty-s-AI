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

