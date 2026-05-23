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
            userGallery.push({
                id: doc.id,
                ...doc.data()
            });
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

    try {
        const docRef = await db
            .collection('users')
            .doc(currentUserUid)
            .collection('gallery')
            .add(imageObj);

        userGallery.unshift({
            id: docRef.id,
            ...imageObj
        });

        if (userGallery.length > LIMITS.maxGalleryItems) {
            const extras = userGallery.splice(LIMITS.maxGalleryItems);
            extras.forEach(extra => {
                if (extra.id) {
                    db.collection('users')
                        .doc(currentUserUid)
                        .collection('gallery')
                        .doc(extra.id)
                        .delete()
                        .catch(() => {});
                }
            });
        }

        showToast("Art saved to gallery!", "success");

    } catch (e) {
        console.error("Error saving image:", e);
    }
}

function handleImageError(img) {
    img.onerror = null;
    img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="%232a2a40"/><text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="%23888" text-anchor="middle" dominant-baseline="middle">Image Unavailable</text></svg>';
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

    userGallery.forEach((img, index) => {
        const div = document.createElement('div');

        div.className = 'gallery-item';
        div.title = img.prompt;

        div.innerHTML = `
            <img src="${img.url}" alt="AI Generated Art" onclick="openImageLightbox(${index})" onerror="handleImageError(this)">

            <a
                href="${img.url}"
                target="_blank"
                download="Rotys_Art.jpg"
                class="gallery-download-btn"
                title="Download"
                onclick="event.stopPropagation()"
            >
                <i class="fas fa-download"></i>
            </a>

            <button
                class="gallery-delete-btn"
                title="Delete"
                onclick="event.stopPropagation(); deleteGalleryImage(${index})"
            >
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        grid.appendChild(div);
    });
}

function openImageLightbox(index) {
    const img = userGallery[index];
    if (!img) return;

    activeLightboxIndex = index;
    document.getElementById('lightbox-image').src = img.url;
    document.getElementById('lightbox-prompt').innerText = img.prompt || "Generated artwork";
    document.getElementById('lightbox-download').href = img.url;
    document.getElementById('lightbox-delete').onclick = () => deleteGalleryImage(index, true);
    
    document.getElementById('lightbox-reuse').onclick = () => {
        const input = document.getElementById('user-input');
        input.value = img.prompt || "";
        setMode('art');
        closeImageLightbox();
        document.getElementById('gallery-modal').classList.add('hidden');
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
            toggleSidebar();
        }
        input.focus();
    };
    
    document.getElementById('image-lightbox-modal').classList.remove('hidden');
}

function closeImageLightbox() {
    activeLightboxIndex = null;
    document.getElementById('image-lightbox-modal').classList.add('hidden');
}

async function deleteGalleryImage(index, fromLightbox = false) {
    const img = userGallery[index];

    if (!img) return;
    if (!confirm("Delete this artwork from your gallery?")) return;

    userGallery.splice(index, 1);

    if (!isGuest && currentUserUid && img.id) {
        try {
            await db
                .collection('users')
                .doc(currentUserUid)
                .collection('gallery')
                .doc(img.id)
                .delete();
        } catch (e) {
            console.error("Gallery Delete Error:", e);
            showToast("Could not delete this image from the cloud.", "error");
        }
    }

    if (fromLightbox || activeLightboxIndex === index) {
        closeImageLightbox();
    }

    renderGallery();
    showToast("Image deleted.", "success");
}

