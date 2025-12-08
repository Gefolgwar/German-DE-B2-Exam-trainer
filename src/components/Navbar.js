import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

export function renderNavbar() {
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (!navbarPlaceholder) return;

    const currentPath = window.location.pathname;

    const isAdmin = window.userRole === 'admin';
    const isLoggedIn = window.userId !== null; // Assuming userId is set when logged in

    const navbarHtml = `
        <nav class="bg-blue-800 p-4 shadow-md">
            <div class="container mx-auto flex justify-between items-center">
                <a href="index.html" class="text-white text-2xl font-bold">B2 Test Trainer</a>
                <div class="flex space-x-4">
                    <a href="index.html" class="text-white hover:text-blue-200 transition ${currentPath.includes('index.html') || currentPath === '/' ? 'font-bold' : ''}">Home</a>
                    <a href="history-page.html" class="text-white hover:text-blue-200 transition ${currentPath.includes('history-page.html') ? 'font-bold' : ''}">📜 My History</a>
                    ${isAdmin ? `<a href="admin.html" class="text-white hover:text-blue-200 transition ${currentPath.includes('admin.html') ? 'font-bold' : ''}">Admin Panel</a>` : ''}
                    <a href="indexAI.html" class="text-white hover:text-blue-200 transition ${currentPath.includes('indexAI.html') ? 'font-bold' : ''}">AI Example</a>
                    ${isLoggedIn ? `<button id="logout-btn" class="text-white hover:text-blue-200 transition">Logout</button>` : `<a href="login.html" class="text-white hover:text-blue-200 transition ${currentPath.includes('login.html') ? 'font-bold' : ''}">Login</a>`}
                </div>
            </div>
        </nav>
    `;

    navbarPlaceholder.innerHTML = navbarHtml;

    if (isLoggedIn) {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const auth = getAuth();
                try {
                    await signOut(auth);
                    // Redirect to login or home page after logout
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Error signing out:", error);
                    alert("Logout error: " + error.message);
                }
            });
        }
    }
}
