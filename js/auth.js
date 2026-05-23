// --- AUTH UI LOGIC ---
btnSwitchAuth.onclick = () => {
    isLoginMode = !isLoginMode;

    btnMainAuth.innerText = isLoginMode ? "Sign In" : "Sign Up";

    subtitle.innerText = isLoginMode
        ? "Welcome back! Sign in to continue."
        : "Join Roty's AI Studio today.";

    toggleMsg.innerText = isLoginMode
        ? "Don't have an account?"
        : "Already have an account?";

    btnSwitchAuth.innerText = isLoginMode ? "Sign Up" : "Sign In";

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
};

document.getElementById('btn-forgot-pass').onclick = async () => {
    const email = document.getElementById('auth-email').value;

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (!email) {
        errorMsg.innerText = "Please enter your email above to reset password.";
        errorMsg.style.display = 'block';
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);

        successMsg.innerText = "Password reset email sent! Check your inbox.";
        successMsg.style.display = 'block';

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

document.getElementById('btn-google').onclick = async () => {
    try {
        await auth.signInWithPopup(googleProvider);

        closeAuth();

        showToast("Logged in with Google", "success");

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

btnMainAuth.onclick = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        if (isLoginMode) {
            const userCred = await auth.signInWithEmailAndPassword(email, pass);

            if (
                !userCred.user.emailVerified &&
                userCred.user.providerData[0].providerId === 'password'
            ) {
                auth.signOut();

                throw new Error(
                    "Please check your email and click the verification link before signing in."
                );
            }

        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, pass);

            await userCred.user.sendEmailVerification();

            successMsg.innerText =
                "Account created! A verification link has been sent to your email.";

            successMsg.style.display = 'block';

            auth.signOut();

            return;
        }

        closeAuth();

        showToast("Successfully logged in!", "success");

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
};

// --- FIXED AUTH + INIT RACE CONDITION ---
window.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {

    if (isInitializing) return;

    isInitializing = true;

    try {
        const sharedChatId = getSharedChatId();

        if (sharedChatId) {
            await loadSharedChat(sharedChatId);
            return;
        }

        if (
            user &&
            (
                user.emailVerified ||
                user.providerData[0].providerId !== 'password'
            )
        ) {
            isGuest = false;
            currentUserUid = user.uid;

            closeAuth();

            document.getElementById('user-display-email').innerText =
                user.displayName || user.email;

            document.getElementById('user-initial').innerText =
                (user.displayName || user.email)[0].toUpperCase();

            document.getElementById('logout-btn').style.display = 'block';
            document.getElementById('logout-btn').innerText = "Sign Out";
            document.getElementById('guest-history-msg').style.display = 'none';

            // Wait for ALL cloud data BEFORE init()
            await Promise.all([
                fetchChatsFromCloud(),
                fetchGalleryFromCloud()
            ]);

            init();

        } else if (isGuest) {
            closeAuth();
            init();

        } else {
            authOverlay.classList.remove('hidden');

            allChats = [];
            userGallery = [];

            renderHistory();
            startNewChat();
        }

    } catch (err) {
        console.error("Auth Init Error:", err);
        showToast("Init Error: " + err.message, "error");

    } finally {
        isInitializing = false;
    }
    });
});

function useGuestMode() {
    isGuest = true;
    isSharedView = false;
    currentUserUid = null;

    closeAuth();

    showToast("Guest Mode Enabled");

    document.getElementById('user-display-email').innerText = "Guest Mode";
    document.getElementById('user-initial').innerText = "G";

    document.getElementById('logout-btn').style.display = 'block';
    document.getElementById('logout-btn').innerText = "Sign In";
    document.getElementById('guest-history-msg').style.display = 'block';

    allChats = [];
    userGallery = [];

    init();
}

function handleLogout() {
    auth.signOut().then(() => {
        currentUserUid = null;
        allChats = [];
        userGallery = [];

        authOverlay.classList.remove('hidden');
    });
}

function closeAuth() {
    authOverlay.classList.add('hidden');
}

// --- DEVELOPER PORTAL ---
function toggleDevPortal() {
    const modal = document.getElementById('dev-portal-modal');
    modal.classList.toggle('hidden');
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-btn')
        .forEach(btn => btn.classList.remove('active'));

    document.querySelectorAll('.tab-pane')
        .forEach(pane => pane.classList.remove('active'));

    if (element) {
        element.classList.add('active');
    }

    document.getElementById(tabId).classList.add('active');
}

