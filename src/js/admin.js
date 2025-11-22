import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

const usersListContainer = document.getElementById("users-list-container");
const testsStatsContainer = document.getElementById("tests-stats-container");

let allUsersData = []; // Зберігаємо всіх користувачів для сортування
let userSort = {
    field: 'createdAt',
    direction: 'desc'
};

async function fetchUserStats(userId) {
  const resultsRef = collection(
    db,
    `artifacts/${appId}/users/${userId}/results`
  );
  const allResultsSnap = await getDocs(resultsRef);
  if (allResultsSnap.empty) {
    return { testsTaken: 0, lastActivity: "Keine", avgPercent: 0, aiRequests: 0 };
  }
  let totalPercent = 0;
  let count = 0;
  let lastTimestamp = null;
    let aiRequests = 0;
    allResultsSnap.forEach(doc => {
    const data = doc.data();
    const correct = typeof data.correctPoints === 'number' ? data.correctPoints : 0;
    const total = typeof data.totalExercises === 'number' && data.totalExercises > 0 ? data.totalExercises : 1;
    totalPercent += (correct / total) * 100;
    count++;
    if (!lastTimestamp || (data.timestamp && new Date(data.timestamp) > new Date(lastTimestamp))) {
      lastTimestamp = data.timestamp;
    }
      // AI API usage: detailedResults with type === 'text_input'
      if (Array.isArray(data.detailedResults)) {
        aiRequests += data.detailedResults.filter(r => r && r.type === 'text_input').length;
      }
  });
  const avgPercent = count > 0 ? (totalPercent / count) : 0;
  return {
    testsTaken: count,
    lastActivity: lastTimestamp ? new Date(lastTimestamp).toLocaleString("de-DE") : "Keine",
    avgPercent: avgPercent.toFixed(1),
    aiRequests
  };
}

async function loadUsers() {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);

  if (snapshot.empty) {
    usersListContainer.innerHTML = "<p>Keine Benutzer gefunden.</p>";
    return;
  }

  // Цей код має виконуватися, коли користувачі є
    // Завантажуємо всі доступні тести для випадаючого списку
    const testsRef = collection(db, `artifacts/${appId}/public/data/tests`);
    const testsSnap = await getDocs(testsRef);
    const allAvailableTests = [];
    testsSnap.forEach(doc => {
        allAvailableTests.push({ id: doc.id, title: doc.data().title });
    });

    usersListContainer.innerHTML = ""; // Очищуємо контейнер

    const usersPromises = snapshot.docs.map(async (doc) => {
        const user = doc.data();
        const userId = doc.id;
        const stats = await fetchUserStats(userId);

    let testUserControlsHtml = '';

    // Додаємо інформацію про призначений тест для TestUser
    if (user.email === 'TestUser@test.com') {
        const configDocRef = doc(db, 'configs', 'app_settings');
        const configDoc = await getDoc(configDocRef);
        const currentLimit = configDoc.exists() ? (configDoc.data().testUserTestLimit || 1) : 1;

        testUserControlsHtml = `
            <div class="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                <label for="test-user-limit" class="text-xs font-semibold text-orange-700 block mb-1">Anzahl verfügbarer Tests:</label>
                <div class="flex items-center gap-2">
                    <input type="number" id="test-user-limit" value="${currentLimit}" min="1" class="w-full p-1 border border-gray-300 rounded-md text-xs">
                    <button class="btn-save-limit bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-1 px-2 rounded">Speichern</button>
                </div>
            </div>
        `;
    }

        return {
            id: userId,
            ...user,
            stats,
            testUserControlsHtml
        };
    });

    allUsersData = await Promise.all(usersPromises);
    renderUsers(); // Перше відображення з сортуванням за замовчуванням
}

/**
 * Відображає список користувачів на основі `allUsersData` та поточного сортування.
 */
function renderUsers() {
    if (!usersListContainer) return;

    const filterInput = document.getElementById('user-filter-input');
    const filterText = filterInput ? filterInput.value.trim().toLowerCase() : '';

    let filteredUsers = allUsersData;

    if (filterText) {
        filteredUsers = allUsersData.filter(user => user.email && user.email.toLowerCase().includes(filterText));
    }

    // Сортування
    filteredUsers.sort((a, b) => {
        const valA = a[userSort.field] || 0;
        const valB = b[userSort.field] || 0;
        if (userSort.direction === 'asc') {
            return new Date(valA) - new Date(valB);
        } else {
            return new Date(valB) - new Date(valA);
        }
    });

    usersListContainer.innerHTML = ""; // Очищуємо контейнер
    let totalUsers = 0;
    let totalAIRequests = 0;

    filteredUsers.forEach(user => {
      totalUsers++;
      totalAIRequests += user.stats.aiRequests;

    const userCard = document.createElement("div");
    // Додаємо клас .user-card-container для застосування адаптивних стилів з admin.html
    userCard.className = "user-card-container bg-white p-4 rounded-lg shadow-md";
    userCard.innerHTML = `
      <div class="user-info flex-1 min-w-0"> <!-- flex-1 min-w-0 дозволяє блоку займати доступний простір і не виходити за межі -->
        <div class="break-words"> <!-- break-words дозволяє переносити довгі слова/email -->
          <p class="font-bold text-lg text-gray-800">${user.email || userId}</p>
          <p class="text-sm text-gray-600">Rolle: <span class="font-semibold ${user.role === 'admin' ? 'text-purple-600' : 'text-gray-700'}">${user.role || 'user'}</span></p>
          <p class="text-xs text-gray-400 mt-1">Erstellt am: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString("de-DE") : 'Unbekannt'}</p>
        </div>
        ${user.testUserControlsHtml}
        ${user.email !== 'TestUser@test.com' ? `
            <div class="mt-3">
              <button data-email="${user.email}" class="btn-reset-password text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded">
                Passwort zurücksetzen
              </button>
            </div>
        ` : '<div class="mt-3"><span class="text-xs text-gray-400">(Testbenutzer)</span></div>'}
      </div>
      <div class="user-stats text-right flex-shrink-0"> <!-- flex-shrink-0 запобігає стисканню цього блоку -->
        <p>Tests absolviert: <span class="font-bold">${user.stats.testsTaken}</span></p>
        <p class="text-sm text-gray-500">Letzte Aktivität: ${user.stats.lastActivity}</p>
        <p class="text-sm text-blue-700">Durchschnittl. Bestehensquote: <span class="font-bold">${user.stats.avgPercent}%</span></p>
        <p class="text-sm text-pink-700">KI-API-Anfragen: <span class="font-bold">${user.stats.aiRequests}</span></p>
      </div>
    `;
    usersListContainer.appendChild(userCard);
  });

    // Вивід глобальної статистики
    const globalStats = document.getElementById('admin-global-stats');
    if (globalStats) {
      globalStats.innerHTML = `
        <span>Gesamtzahl der Benutzer: <span class="font-bold">${totalUsers}</span></span>
        <span>Gesamtzahl der KI-API-Anfragen: <span class="font-bold">${totalAIRequests}</span></span>
      `;
    }
  // Додаємо обробники для кнопок скидання пароля
  document.querySelectorAll('.btn-reset-password').forEach(button => {
    button.addEventListener('click', async (e) => {
        const email = e.target.dataset.email;
        if (confirm(`Sind Sie sicher, dass Sie eine E-Mail zum Zurücksetzen des Passworts an ${email} senden möchten?`)) {
            try {
                await sendPasswordResetEmail(auth, email);
                alert(`E-Mail zum Zurücksetzen des Passworts erfolgreich an ${email} gesendet. Überprüfen Sie auch Ihren Spam-Ordner.`);
            } catch (error) {
                console.error("Password reset error:", error);
                alert(`E-Mail konnte nicht gesendet werden: ${error.message}`);
            }
        }
    });
  });

  // Обробник для кнопки збереження призначеного тесту
  document.querySelectorAll('.btn-save-limit').forEach(button => {
    button.addEventListener('click', async (e) => {
        const inputElement = e.target.closest('div').querySelector('input');
        const newLimit = parseInt(inputElement.value, 10);

        if (newLimit > 0 && confirm(`Limit auf ${newLimit} Test(s) für TestUser setzen?`)) {
            try {
                const configDocRef = doc(db, 'configs', 'app_settings');
                await updateDoc(configDocRef, { testUserTestLimit: newLimit });
                alert('Testlimit erfolgreich aktualisiert!');
            } catch (error) {
                console.error("Error updating test assignment:", error);
                alert(`Fehler beim Aktualisieren: ${error.message}`);
            }
        }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
    const sortByDateBtn = document.getElementById('sort-by-creation-date');
    if (sortByDateBtn) {
        sortByDateBtn.addEventListener('click', () => {
            userSort.direction = userSort.direction === 'desc' ? 'asc' : 'desc';
            const icon = document.getElementById('sort-date-icon');
            if (icon) {
                icon.textContent = userSort.direction === 'desc' ? '▼' : '▲';
            }
            renderUsers();
        });
    }

    const userFilterInput = document.getElementById('user-filter-input');
    if (userFilterInput) {
        userFilterInput.addEventListener('input', () => {
            renderUsers();
        });
    }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Перевірка, чи користувач є адміном, перш ніж завантажувати дані
    const userDocRef = doc(db, "users", user.uid);
    getDoc(userDocRef).then(userDoc => {
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            loadUsers(); // Завантажуємо статистику користувачів
            loadTestsStats(); // Завантажуємо статистику тестів
        } else {
            if (usersListContainer) {
                usersListContainer.innerHTML = '<p class="text-red-600">Sie haben keine Berechtigung, auf diese Seite zuzugreifen.</p>';
            }
            if (testsStatsContainer) {
                testsStatsContainer.innerHTML = ''; // Очищуємо, якщо немає прав
            }
        }
    });
  } else {
    window.location.href = "login.html";
  }
});

/**
 * Завантажує статистику по кожному тесту.
 */
async function loadTestsStats() {
    if (!testsStatsContainer) return;
    testsStatsContainer.innerHTML = '<p>Teststatistiken werden geladen...</p>';

    try {
        // 1. Отримуємо всі тести
        const testsRef = collection(db, `artifacts/${appId}/public/data/tests`);
        const testsSnap = await getDocs(testsRef);
        const tests = {};
        testsSnap.forEach(doc => {
            tests[doc.id] = doc.data();
        });

        // 2. Отримуємо всі публічні результати
        const resultsRef = collection(db, `artifacts/${appId}/public/data/public_results`);
        const resultsSnap = await getDocs(resultsRef);

        const stats = {}; // { testId: { completions: number, totalPercent: number } }

        resultsSnap.forEach(doc => {
            const result = doc.data();
            const testId = result.testId;

            if (!stats[testId]) {
                stats[testId] = { completions: 0, totalPercent: 0 };
            }

            stats[testId].completions++;
            const percent = result.totalExercises > 0 ? (result.correctPoints / result.totalExercises) * 100 : 0;
            stats[testId].totalPercent += percent;
        });

        // 3. Рендеримо картки
        if (Object.keys(tests).length === 0) {
            testsStatsContainer.innerHTML = '<p>Keine Tests zur Analyse gefunden.</p>';
            return;
        }

        let html = '';
        for (const testId in tests) {
            const test = tests[testId];
            const testStat = stats[testId] || { completions: 0, totalPercent: 0 };
            const avgPercent = testStat.completions > 0 ? (testStat.totalPercent / testStat.completions) : 0;

            html += `
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <p class="font-bold text-lg text-blue-800">${test.title}</p>
                    <p class="text-xs text-gray-500 mb-2">ID: ${testId}</p>
                    <div class="text-right">
                        <p>Anzahl der Durchführungen: <span class="font-bold">${testStat.completions}</span></p>
                        <p class="text-sm text-blue-700">Durchschnittl. Bestehensquote: <span class="font-bold">${avgPercent.toFixed(1)}%</span></p>
                    </div>
                </div>
            `;
        }
        testsStatsContainer.innerHTML = html;

    } catch (error) {
        console.error("Error loading tests stats:", error);
        testsStatsContainer.innerHTML = `<p class="text-red-600">Fehler beim Laden der Teststatistiken: ${error.message}</p>`;
    }
}