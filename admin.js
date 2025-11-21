import { collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const elements = {
    usersListContainer: document.getElementById('users-list-container'),
};

/**
 * Завантажує всіх користувачів та їхню статистику.
 */
async function loadAllUsersStats() {
    if (!window.db || !window.isAuthReady) {
        console.warn("Admin page: Firestore not ready. Retrying...");
        setTimeout(loadAllUsersStats, 500);
        return;
    }

    elements.usersListContainer.innerHTML = '<p>Завантаження даних користувачів...</p>';

    try {
        // 1. Отримуємо всіх користувачів
        const usersSnapshot = await getDocs(collection(window.db, 'users'));
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        // 2. Для кожного користувача завантажуємо його результати
        const userStatsPromises = users.map(async (user) => {
            const resultsRef = collection(window.db, `artifacts/${appId}/users/${user.id}/results`);
            const resultsSnapshot = await getDocs(resultsRef);
            
            let totalTests = 0;
            let totalScore = 0;
            let totalQuestions = 0;

            resultsSnapshot.forEach(doc => {
                const result = doc.data();
                totalTests++;
                totalScore += result.correctPoints;
                totalQuestions += result.totalExercises;
            });

            const avgScorePercent = totalTests > 0 && totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;

            return {
                ...user,
                totalTests,
                avgScorePercent
            };
        });

        const usersWithStats = await Promise.all(userStatsPromises);
        renderUsers(usersWithStats);

    } catch (error) {
        console.error("Error loading users stats:", error);
        elements.usersListContainer.innerHTML = `
            <div class="p-4 bg-red-100 text-red-700 rounded-lg">
                <p><strong>Помилка завантаження даних:</strong> ${error.message}</p>
                <p class="mt-2"><strong>Можлива причина:</strong> Правила безпеки Firestore не дозволяють адміністратору читати дані всіх користувачів. Переконайтеся, що ваші правила налаштовані правильно.</p>
            </div>
        `;
    }
}

/**
 * Відображає список користувачів.
 * @param {Array} users - Масив користувачів зі статистикою.
 */
function renderUsers(users) {
    if (users.length === 0) {
        elements.usersListContainer.innerHTML = '<p>Користувачів не знайдено.</p>';
        return;
    }

    const usersHtml = users.map(user => `
        <div class="bg-white p-4 rounded-lg shadow-md">
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-bold text-lg text-gray-800">${user.email}</p>
                    <p class="text-sm text-gray-500">User ID: ${user.id}</p>
                    <p class="text-sm text-gray-500">Роль: <span class="font-semibold ${user.role === 'admin' ? 'text-purple-600' : 'text-gray-600'}">${user.role}</span></p>
                </div>
                <div class="text-right">
                    <p class="text-gray-700">Пройдено тестів: <span class="font-bold">${user.totalTests}</span></p>
                    <p class="text-gray-700">Середній бал: <span class="font-bold">${user.avgScorePercent.toFixed(1)}%</span></p>
                </div>
            </div>
        </div>
    `).join('');

    elements.usersListContainer.innerHTML = usersHtml;
}

// --- Ініціалізація ---
window.addEventListener('adminReady', loadAllUsersStats);