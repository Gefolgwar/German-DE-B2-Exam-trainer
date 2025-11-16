// --- DOM Елементи ---
const elements = {
    testSummaryTitle: document.getElementById('test-summary-title'),
    resultPoints: document.getElementById('result-points'),
    resultPercent: document.getElementById('result-percent'),
    resultTime: document.getElementById('result-time'),
    detailedReportContainer: document.getElementById('detailed-report-container'),
    reviewLink: document.getElementById('review-link'),
    resultIdDisplay: document.getElementById('result-id-display'), 
    historyContainer: document.getElementById('history-container'), 
};

// Глобальний стан для Firebase (залишаємо як є)
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

// --- Firebase Ініціалізація та Завантаження Історії (залишаємо як є) ---

async function setupFirebase() {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const { getAuth, signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

        if (Object.keys(firebaseConfig).length === 0) {
            console.warn("Firebase config not found. Skipping Firebase setup.");
            return;
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        const auth = getAuth(app);

        if (initialAuthToken) {
            const userCredential = await signInWithCustomToken(auth, initialAuthToken);
            userId = userCredential.user.uid;
            console.log("Firebase initialized and user signed in:", userId);
            loadUserHistory();
        } else {
            console.warn("No authentication token found. Firebase history feature disabled.");
        }
    } catch (e) {
        console.error("Failed to initialize Firebase:", e);
    }
}

// --- Логіка Звіту (Ф6, Ф7, Ф8) ---

function calculateAndDisplayResults(results) {
    const { title, questions, answers, timeSpent, totalDuration, passingScore } = results;

    // 1. Обчислення результатів
    let correctCount = 0;
    let maxPoints = questions.length;

    questions.forEach(q => {
        const userAnswer = answers[q.id];
        if (userAnswer !== undefined && userAnswer === q.correct_answer_index) {
            correctCount++;
        }
    });

    const percentCorrect = maxPoints > 0 ? Math.round((correctCount / maxPoints) * 100) : 0;
    const isPassed = correctCount >= passingScore;

    // 2. Відображення Загальної Статистики
    elements.testSummaryTitle.textContent = title;
    elements.resultPoints.textContent = `${correctCount} / ${maxPoints}`;
    elements.resultPercent.textContent = `${percentCorrect}%`;
    elements.resultTime.textContent = formatTime(timeSpent);
    
    // Оновлення кольорів
    const statusColor = isPassed ? 'text-green-600' : 'text-red-600';
    elements.resultPoints.className = elements.resultPoints.className.replace(/text-(green|red|purple)-\d{3}/, statusColor);
    elements.resultPercent.className = elements.resultPercent.className.replace(/text-(green|red|purple)-\d{3}/, statusColor);
    
    const passStatusElement = document.getElementById('pass-status');
    if (passStatusElement) {
        passStatusElement.textContent = isPassed ? 'ТЕСТ СКЛАДЕНО! 🎉' : 'ТЕСТ НЕ СКЛАДЕНО 😞';
        passStatusElement.className = `text-4xl font-extrabold ${statusColor} mb-2`;
    }

    // 3. Детальний звіт
    renderDetailedReport(questions, answers);
    
    // 4. Збереження в історії (якщо Firebase активний)
    if (userId && db) {
        saveResultToHistory({ 
            testId: results.testId, 
            title: title, 
            score: correctCount, 
            maxScore: maxPoints, 
            time: timeSpent, 
            timestamp: Date.now() 
        });
    }
}

function renderDetailedReport(questions, answers) {
    elements.detailedReportContainer.innerHTML = '';
    
    questions.forEach((q, index) => {
        const userAnswerIndex = answers[q.id];
        const isAnswered = userAnswerIndex !== undefined;
        const isCorrect = isAnswered && userAnswerIndex === q.correct_answer_index;

        const headerClass = isCorrect ? 'border-green-500 bg-green-50' : (isAnswered ? 'border-red-500 bg-red-50' : 'border-gray-400 bg-gray-100');
        const headerText = isCorrect ? 'Правильно' : (isAnswered ? 'Неправильно' : 'Без відповіді');

        // --- Медіа Контент ---
        let mediaHtml = '';
        if (q.image_url) {
            mediaHtml += `<div class="mb-4 text-center"><img src="${q.image_url}" alt="Зображення до питання ${q.id}" class="max-w-full h-auto mx-auto rounded-lg shadow-md md:w-1/2"></div>`;
        }
        if (q.audio_url) {
            mediaHtml += `<div class="mb-4 text-center"><audio controls class="w-full max-w-sm mx-auto"><source src="${q.audio_url}" type="audio/mpeg">Ваш браузер не підтримує аудіо елемент.</audio></div>`;
        }
        // ---------------------

        const card = document.createElement('div');
        card.className = `p-5 rounded-xl shadow-lg border-l-4 ${headerClass}`;
        card.innerHTML = `
            <h4 class="text-xl font-bold text-gray-800 mb-3">
                Питання №${index + 1}: ${q.text} 
                <span class="text-sm font-normal ml-2 py-1 px-3 rounded-full ${isCorrect ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}">${headerText}</span>
            </h4>
            
            ${q.stimulus ? `<p class="text-gray-600 italic mb-3">Стимул: ${q.stimulus}</p>` : ''}
            
            ${mediaHtml} <div class="space-y-2 mt-4">
                ${q.options.map((option, optIndex) => {
                    let optionClass = ['p-2 rounded-lg border text-gray-800 transition duration-150'];
                    
                    if (optIndex === q.correct_answer_index) {
                        // Правильна відповідь
                        optionClass.push('bg-green-100 border-green-500 font-semibold');
                    } else if (optIndex === userAnswerIndex) {
                        // Неправильно обрана відповідь користувача
                        optionClass.push('bg-red-100 border-red-500 line-through');
                    } else {
                        // Необраний варіант
                        optionClass.push('bg-white border-gray-200');
                    }
                    
                    return `
                        <p class="${optionClass.join(' ')}">
                            ${String.fromCharCode(65 + optIndex)}. ${option}
                            ${optIndex === q.correct_answer_index ? ' (Правильно)' : (optIndex === userAnswerIndex ? ' (Ваша відповідь)' : '')}
                        </p>
                    `;
                }).join('')}
            </div>

            ${(q.explanation) ? `<div class="mt-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-gray-800 rounded-lg">
                <strong class="text-yellow-700">Пояснення:</strong> ${q.explanation}
            </div>` : ''}
        `;
        
        elements.detailedReportContainer.appendChild(card);
    });

    // Оновлення посилання для перегляду
    elements.reviewLink.href = 'index.html'; 
}

// --- Ініціалізація ---\
document.addEventListener('DOMContentLoaded', () => {
    // Отримуємо результати з локального сховища
    const results = localStorage.getItem('b2_test_results');
    if (results) {
        const parsedResults = JSON.parse(results);
        calculateAndDisplayResults(parsedResults);
        // Не очищаємо localStorage, щоб користувач міг оновити сторінку
    } else {
        elements.detailedReportContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка: Не знайдено результатів останнього тесту.</div>`;
    }
    
    // Firebase setup
    setupFirebase();
});

// --- Функції Історії --- (залишаємо як є)

function saveResultToHistory(result) {
    if (!db || !userId) return;

    const historyCollectionRef = collection(db, `users/${userId}/history`);
    addDoc(historyCollectionRef, result)
        .then(() => console.log("Result saved to history successfully."))
        .catch((e) => console.error("Error saving result to history:", e));
}

function loadUserHistory() {
    if (!db || !userId || !elements.historyContainer) return;

    const historyCollectionRef = collection(db, `users/${userId}/history`);
    const q = query(historyCollectionRef, orderBy("timestamp", "desc"), limit(5));

    getDocs(q)
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                elements.historyContainer.innerHTML = `<p class="text-gray-500">Історія тестів відсутня.</p>`;
                return;
            }

            let historyHtml = '<h3 class="text-xl font-bold mb-3 text-gray-800">Остання Історія Тестів</h3>';
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const date = new Date(data.timestamp).toLocaleDateString('uk-UA');
                const time = new Date(data.timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                const percentage = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0;
                
                historyHtml += `
                    <div class="p-3 bg-white rounded-lg shadow border-l-2 border-blue-400 mb-2 flex justify-between items-center">
                        <div>
                            <p class="font-semibold">${data.title}</p>
                            <p class="text-sm text-gray-500">${date} о ${time}</p>
                        </div>
                        <p class="text-lg font-bold ${percentage >= 50 ? 'text-green-600' : 'text-red-600'}">${percentage}% (${data.score}/${data.maxScore})</p>
                    </div>
                `;
            });
            elements.historyContainer.innerHTML = historyHtml;
        })
        .catch((e) => {
            console.error("Error loading user history:", e);
            elements.historyContainer.innerHTML = `<p class="text-red-500">Не вдалося завантажити історію.</p>`;
        });
}