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

