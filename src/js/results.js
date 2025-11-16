// --- DOM Елементи ---
const elements = {
    testSummaryTitle: document.getElementById('test-summary-title'),
    resultPoints: document.getElementById('result-points'),
    resultPercent: document.getElementById('result-percent'),
    resultTime: document.getElementById('result-time'),
    detailedReportContainer: document.getElementById('detailed-report-container'),
    reviewLink: document.getElementById('review-link'),
    resultIdDisplay: document.getElementById('result-id-display'), // Новий елемент для ID
    historyContainer: document.getElementById('history-container'), // Новий елемент для історії
};

// Глобальний стан для Firebase
let db = null;
let userId = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// --- Firebase Ініціалізація та Завантаження Історії ---

async function setupFirebase() {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
        const { getAuth, signInWithCustomToken, signInAnonymously } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
        const { getFirestore, setLogLevel, collection, query, orderBy, limit, onSnapshot } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        
        // setLogLevel('Debug');
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        
        userId = auth.currentUser?.uid || 'anonymous-user';
        console.log("Firebase ініціалізовано. ID користувача:", userId);

        loadTestHistory();

    } catch (error) {
        console.error("Помилка налаштування Firebase у results.js:", error);
        elements.historyContainer.innerHTML = `<div class=\"p-4 text-red-600 bg-red-100 rounded-lg\">Помилка завантаження історії.</div>`;
    }
}


function loadTestHistory() {
    if (!db || !userId) return;

    // Шлях до колекції: /artifacts/{appId}/users/{userId}/test_results
    const resultsRef = collection(db, `artifacts/${appId}/users/${userId}/test_results`);
    
    // Запит: сортуємо за часом (новий зверху) та обмежуємо 5-ма записами
    // NOTE: orderBy() вимкнено, щоб уникнути помилок індексування. Сортування в JS.
    const q = resultsRef; // query(resultsRef, orderBy("timestamp", "desc"), limit(5));

    elements.historyContainer.innerHTML = `<div class="text-center text-gray-500">Завантаження історії...</div>`;

    // onSnapshot для оновлення в реальному часі
    onSnapshot(q, (snapshot) => {
        let historyHtml = '';
        const rawHistory = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            rawHistory.push({ ...data, id: doc.id });
        });
        
        // Сортування в JS
        rawHistory.sort((a, b) => b.timestamp - a.timestamp);

        if (rawHistory.length === 0) {
            historyHtml = `<div class="text-center text-gray-500 p-4">Історія тестів порожня.</div>`;
        } else {
            // Беремо останні 5 записів
            const recentHistory = rawHistory.slice(0, 5);

            historyHtml = recentHistory.map(result => {
                const totalQuestions = result.questions.length;
                let correctCount = 0;
                result.questions.forEach(q => {
                    if (result.answers[q.id] === q.correct_answer_index) {
                        correctCount++;
                    }
                });
                const percentage = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(0) : 0;
                const date = new Date(result.timestamp).toLocaleDateString('uk-UA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                return `
                    <div class="flex justify-between items-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition duration-150">
                        <div>
                            <p class="font-semibold text-gray-800">${result.title}</p>
                            <p class="text-sm text-gray-500">${date}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-lg font-bold ${percentage >= 75 ? 'text-green-600' : 'text-red-600'}">${percentage}%</p>
                            <p class="text-sm text-gray-500">${correctCount}/${totalQuestions} балів</p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        elements.historyContainer.innerHTML = `<div class="space-y-3">${historyHtml}</div>`;
    }, (error) => {
        console.error("Помилка під час onSnapshot:", error);
        elements.historyContainer.innerHTML = `<div class=\"p-4 text-red-600 bg-red-100 rounded-lg\">Помилка отримання даних історії: ${error.message}</div>`;
    });
}


function calculateAndDisplayResults(rawResults) {
    if (!rawResults) {
        elements.detailedReportContainer.innerHTML = `<div class=\"p-10 text-center text-red-600 bg-red-100 rounded-lg\">Не знайдено збережених результатів.</div>`;
        return;
    }
    
    let correctCount = 0;
    const totalQuestions = rawResults.questions.length;

    // 1. Підрахунок Балів (Ф6)
    rawResults.questions.forEach(q => {
        const userAnswer = rawResults.answers[q.id];
        // Порівнюємо індекс відповіді користувача з правильним індексом
        if (userAnswer === q.correct_answer_index) {
            correctCount++;
        }
    });

    const totalPoints = correctCount; // Кожне питання = 1 бал
    const percentage = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(0) : 0;
    const timeSpent = formatTime(rawResults.timeSpentSeconds);
    const isPassed = totalPoints >= rawResults.passing_score_points;

    // 2. Відображення Загальних Результатів (Ф6)
    elements.testSummaryTitle.textContent = rawResults.title;
    elements.resultPoints.textContent = totalPoints;
    elements.resultPercent.textContent = `${percentage}%`;
    elements.resultTime.textContent = timeSpent;
    
    // Відображення статусу
    const statusText = document.getElementById('result-status-text');
    if (statusText) {
        statusText.textContent = isPassed ? "Вітаємо! Успішно пройдено!" : "На жаль, не пройдено.";
        statusText.className = isPassed 
            ? 'text-green-600 font-bold' 
            : 'text-red-600 font-bold';
    }
    
    // Відображення ID результату
    if (rawResults.resultDocId) {
        elements.resultIdDisplay.textContent = `ID Результату: ${rawResults.resultDocId} (Користувач: ${rawResults.userId.substring(0, 8)}...)`;
        elements.resultIdDisplay.classList.remove('hidden');
    }


    // 3. Детальний Звіт (Ф7)
    elements.detailedReportContainer.innerHTML = ''; // Очищаємо перед рендерингом
    
    // Перебираємо питання та рендеримо деталі
    rawResults.questions.forEach(q => {
        const userAnswerIndex = rawResults.answers[q.id];
        const isAnswered = userAnswerIndex !== undefined && userAnswerIndex !== null;
        const isCorrect = isAnswered && userAnswerIndex === q.correct_answer_index;
        
        const card = document.createElement('div');
        card.className = `p-5 rounded-xl shadow-lg transition-colors duration-200 ${isCorrect ? 'bg-green-50 border-green-200' : (isAnswered ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200')} border`;

        card.innerHTML = `
            <div class="text-lg font-semibold text-gray-800 mb-2">
                Питання ${q.id}: ${q.text}
                <span class="float-right text-sm font-normal p-1 rounded-full ${isCorrect ? 'bg-green-500 text-white' : (isAnswered ? 'bg-red-500 text-white' : 'bg-gray-400 text-white')}">
                    ${isCorrect ? '✔️ Правильно' : (isAnswered ? '❌ Помилка' : '⚪ Пропущено')}
                </span>
            </div>
            <p class="text-gray-600 mb-3 italic">Завдання: ${q.stimulus}</p>
            
            <div class="space-y-2 text-sm">
                ${q.options.map((option, index) => {
                    let optionClass = ['p-2 rounded-lg border text-gray-700'];
                    
                    // Правильна відповідь
                    if (index === q.correct_answer_index) {
                        optionClass = ['bg-green-200 border-green-400 font-medium'];
                    }
                    
                    // Відповідь користувача (якщо вона була і вона неправильна)
                    if (index === userAnswerIndex) {
                         if (index !== q.correct_answer_index) {
                            // Неправильна відповідь
                            optionClass = ['bg-red-200 border-red-400 font-medium'];
                        } else {
                            // Правильна відповідь користувача
                            optionClass = ['bg-green-500 border-green-600 text-white font-medium'];
                        }
                    } else if (index === q.correct_answer_index) {
                         // Показуємо правильну відповідь, якщо користувач відповів неправильно
                         optionClass = ['bg-green-100 border-green-300 font-medium'];
                    } else {
                        // Невибраний варіант
                        optionClass = ['bg-white border-gray-200 text-gray-700'];
                    }
                    
                    return `
                        <p class="${optionClass.join(' ')}">
                            ${option}
                        </p>
                    `;
                }).join('')}
            </div>

            <!-- Пояснення -->
            ${(isAnswered && !isCorrect) && q.explanation ? `<div class="mt-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-gray-800 rounded-lg">
                <strong class="text-yellow-700">Пояснення:</strong> ${q.explanation}
            </div>` : ''}
        `;
        
        elements.detailedReportContainer.appendChild(card);
    });

    // Оновлення посилання для перегляду (просто повертаємо на індекс для простоти)
    elements.reviewLink.href = 'index.html'; 
}

// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // Отримуємо результати з локального сховища
    const results = localStorage.getItem('b2_test_results');
    if (results) {
        const parsedResults = JSON.parse(results);
        calculateAndDisplayResults(parsedResults);
        // Очищаємо localStorage, щоб при наступному заході не показувати старі результати
        // localStorage.removeItem('b2_test_results'); 
    } else {
        elements.detailedReportContainer.innerHTML = `<div class=\"p-10 text-center text-red-600 bg-red-100 rounded-lg\">Не знайдено збережених результатів.</div>`;
    }
    
    // Налаштовуємо Firebase для завантаження історії
    setupFirebase();
});