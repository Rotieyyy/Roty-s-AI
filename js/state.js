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
let currentAbortController = null;

const LIMITS = {
    maxChats: 30,
    maxMessagesPerChat: 100,
    maxGalleryItems: 50,
    maxDocumentChars: 18000,
    maxDocumentBytes: 8 * 1024 * 1024,
    maxRequestsPerMinute: 12,
    maxProRequestsPerMinute: 8
};

