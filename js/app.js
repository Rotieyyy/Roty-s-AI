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

// --- EVENTS ---
sendBtn.onclick = () => {
    if (sendBtn.dataset.action === 'stop') {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    } else {
        handleSend();
    }
};

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

