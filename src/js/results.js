import { getDoc, doc, collection, query, onSnapshot, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// --- DOM Елементи ---
const elements = {
    testSummaryTitle: document.getElementById('test-summary-title'),
    resultPoints: document.getElementById('result-points'),
    resultPercent: document.getElementById('result-percent'),
    resultTime: document.getElementById('result-time'),
    resultIncorrect: document.getElementById('result-incorrect'),
    detailedReportContainer: document.getElementById('detailed-report-container'),
    reviewLink: document.getElementById('review-link'),
    resultIdDisplay: document.getElementById('result-id-display'), 
    historyContainer: document.getElementById('history-container'), 
};

// Глобальний стан для результатів
let currentResultData = null;
let currentTestSnapshot = null;
let incorrectQuestions = [];

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Генерує HTML-розмітку для одного питання у звіті.
 */
function generateQuestionHtml({ q, originalIndex }) {
    const detailedResult = currentResultData.detailedResults.find(r => r.questionId === q.id);
    if (!detailedResult) return '';

    // Знаходимо частину, до якої належить питання
    const part = currentTestSnapshot.parts.find(p => p.questions.some(pq => pq.id === q.id));
    const partTitle = part ? part.title : 'Невідома частина';
    const isCorrect = detailedResult.isCorrect;
    const userAnswerIndex = detailedResult.userAnswerIndex;

    const statusText = isCorrect
      ? "(Правильно)"
      : userAnswerIndex === null || userAnswerIndex === undefined
      ? "(Помилка - нічого не обрано)"
      : "(Помилка)";

    let optionsHtml = '';
    q.options.forEach((option, optionIndex) => {
        let optionClass = 'text-gray-700';
        let icon = '';

        if (optionIndex === q.correct_answer_index) {
            // Це правильна відповідь
            optionClass = 'bg-green-100 text-green-800 font-semibold border-green-500';
            icon = '✅ Правильна';
        } else if (optionIndex === userAnswerIndex) {
            // Це неправильна відповідь користувача
            optionClass = 'bg-red-100 text-red-800 font-semibold border-red-500';
            icon = '❌ Ваша відповідь';
        }

        optionsHtml += `
            <div class="p-3 rounded-lg border ${optionClass}">
                <span class="font-bold mr-2">${String.fromCharCode(65 + optionIndex)}.</span> 
                ${option}
                <span class="float-right text-sm italic">${icon}</span>
            </div>
        `;
    });

    return `
        <div class="bg-white p-6 rounded-xl shadow-md border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}">
            <div class="flex justify-between items-center mb-4">
                 <h4 class="text-xl font-bold text-gray-800">
                    Запитання ${originalIndex + 1} <span class="text-base font-normal text-gray-500">(${partTitle})</span>
                    <span class="text-sm font-normal ml-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}">
                        ${statusText}
                    </span>
                </h4>
            </div>
            
            <p class="text-gray-600 mb-4">${q.text}</p>
            
            <div class="space-y-2">
                ${optionsHtml}
            </div>

            <div class="mt-4 p-3 bg-gray-100 rounded-lg">
                <p class="font-semibold text-gray-700 mb-1">Пояснення:</p>
                <p class="text-sm text-gray-600">${q.explanation || 'Пояснення відсутнє.'}</p>
            </div>
        </div>
    `;
}

/**
 * Завантажує результат тесту та сам тест (snapshot) з Firestore.
 * @param {string} resultId - ID результату тесту.
 */
async function loadResultData(resultId) {
    if (!window.db) {
         console.warn("Firestore not ready. Retrying loadResultData...");
         setTimeout(() => loadResultData(resultId), 200);
         return;
    }
    
    if (!window.userId) {
        // Це мало б не трапитися, якщо isAuthReady спрацював, але на всяк випадок
        throw new Error("User ID is not available.");
    }
    
    const resultRef = doc(window.db, `artifacts/${appId}/users/${window.userId}/results`, resultId);

    try {
        const docSnap = await getDoc(resultRef);

        if (docSnap.exists()) {
            currentResultData = docSnap.data();
            currentTestSnapshot = currentResultData.testSnapshot;
            renderSummary();
            loadUserHistory();
        } else {
             // Спроба завантажити з localStorage як запасний варіант
            const localResult = localStorage.getItem('b2_last_result_data');
            if (localResult) {
                currentResultData = JSON.parse(localResult);
                currentTestSnapshot = currentResultData.testSnapshot;
                renderSummary();
            } else {
                throw new Error(`Результат з ID ${resultId} не знайдено.`);
            }
        }
    } catch (error) {
        console.error("Error loading result data:", error);
        elements.detailedReportContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка завантаження результатів: ${error.message}</div>`;
    }
}


/**
 * Відображає зведену інформацію про результат.
 */
function renderSummary() {
    if (!currentResultData || !currentTestSnapshot) return;

    const { correctPoints, totalQuestions, timeSpentSeconds, passingScore, detailedResults, testTitle, timestamp, partTimes } = currentResultData;
    const percent = totalQuestions > 0 ? ((correctPoints / totalQuestions) * 100).toFixed(1) : 0;
    const incorrectCount = totalQuestions - correctPoints;
    const overallStatus = correctPoints >= passingScore ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО';
    const formattedDate = new Date(timestamp).toLocaleString('uk-UA');
    
    elements.testSummaryTitle.innerHTML = `${testTitle} <span class="block text-lg font-normal text-gray-500 mt-1">${formattedDate}</span>`;
    elements.resultPoints.innerHTML = `${correctPoints}/${totalQuestions} <span class="text-xl text-gray-500">(Загальний прохідний: ${passingScore})</span> <span class="block text-2xl mt-2 ${overallStatus === 'ПРОЙДЕНО' ? 'text-green-600' : 'text-red-600'}">${overallStatus}</span>`;
    elements.resultPercent.textContent = `${percent}%`;
    elements.resultTime.textContent = formatTime(timeSpentSeconds);
    elements.resultIncorrect.textContent = incorrectCount;
    elements.resultIdDisplay.textContent = `ID Користувача: ${window.userId}`;

    // Розрахунок та відображення статистики по частинах
    const partsStats = {};
    currentTestSnapshot.parts.forEach(part => {
        partsStats[part.part_id] = {
            title: part.title,
            correct: 0,
            total: part.questions.length,
            duration_minutes: part.duration_minutes || 0,
            passingScore: part.passing_score_points || 0,
        };
    });

    detailedResults.forEach(res => {
        // Знаходимо питання у знімку тесту
        const question = currentTestSnapshot.parts.flatMap(p => p.questions).find(q => q.id === res.questionId);
        // Знаходимо частину, до якої належить це питання
        const part = currentTestSnapshot.parts.find(p => p.questions.some(q => q.id === res.questionId));
        if (res.isCorrect && part) {
            partsStats[part.part_id].correct++;
        }
    });

    const summaryContainer = document.querySelector('.grid.grid-cols-3.gap-4.mb-10');
    if (summaryContainer) {
        summaryContainer.innerHTML = ''; // Очищуємо старий вигляд
        Object.values(partsStats).forEach(stat => {
            const partTimeSpent = partTimes && partTimes[stat.part_id] ? partTimes[stat.part_id].timeSpent / 1000 : 0;
            // Розраховуємо відсоток та статус для кожної частини
            const partPercent = stat.total > 0 ? (stat.correct / stat.total * 100).toFixed(1) : 0;
            const partStatus = stat.correct >= stat.passingScore ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО';
            summaryContainer.innerHTML += `
                <div class="p-4 bg-white rounded-xl shadow-lg text-center border-l-4 ${partStatus === 'ПРОЙДЕНО' ? 'border-green-500' : 'border-red-500'}">
                    <h4 class="font-bold text-gray-700">${stat.title}</h4>
                    <p class="text-xs text-gray-500">Витрачено: ${formatTime(Math.round(partTimeSpent))} / Виділено: ${stat.duration_minutes} хв.</p>
                    <p class="text-3xl font-bold my-2">${stat.correct} / ${stat.total}</p>
                    <p class="text-lg font-semibold ${partStatus === 'ПРОЙДЕНО' ? 'text-green-600' : 'text-red-600'}">${partStatus} (${partPercent}%)</p>
                    <p class="text-xs text-gray-500">Прохідний бал: ${stat.passingScore}</p>
                </div>
            `;
        });
    }

    // Створюємо плоский масив питань для звіту, використовуючи знімок тесту
    const flatQuestions = [];
    currentTestSnapshot.parts.forEach(part => {
        part.questions.forEach(q => flatQuestions.push(q));
    });

    incorrectQuestions = detailedResults
        .filter(r => !r.isCorrect)
        .map(r => {
            const questionData = flatQuestions.find(q => q.id === r.questionId);
            const originalIndex = flatQuestions.findIndex(q => q.id === r.questionId);
            return { q: questionData, originalIndex: originalIndex };
        });

    let reportTitle = incorrectQuestions.length > 0 
        ? `Детальний Звіт про ${incorrectQuestions.length} Помилок` 
        : '🎉 Вітаємо! Всі відповіді правильні.';

    let currentReportList = incorrectQuestions;
    
    // Початкове відображення - тільки помилки
    elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` + 
        currentReportList.map(generateQuestionHtml).join('');
    
    // Логіка перегляду (всі питання / лише помилки)
    let isReviewingAll = false;
    
    if (elements.reviewLink) {
        elements.reviewLink.textContent = incorrectQuestions.length > 0 ? '🔍 Переглянути Усі Питання' : '🔍 Переглянути Усі Питання';

        elements.reviewLink.addEventListener('click', (e) => {
            e.preventDefault();
            isReviewingAll = !isReviewingAll;
            
            if (isReviewingAll) {
                // Показуємо всі питання
                currentReportList = flatQuestions.map((q, index) => ({ q, originalIndex: index }));
                reportTitle = `Детальний Звіт: Усі ${totalQuestions} Питань`;
                elements.reviewLink.textContent = '❌ Приховати Правильні Відповіді';
            } else {
                // Показуємо лише помилки
                currentReportList = incorrectQuestions;
                reportTitle = incorrectQuestions.length > 0 ? `Детальний Звіт про ${incorrectQuestions.length} Помилок` : '🎉 Вітаємо! Всі відповіді правильні.';
                elements.reviewLink.textContent = '🔍 Переглянути Усі Питання';
            }
            
            elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` + 
                currentReportList.map((item) => generateQuestionHtml(item)).join('');
        });
    }
}

/**
 * Завантажує історію проходжень тестів поточного користувача з Firestore.
 */
function loadUserHistory() {
    if (!window.db || !window.userId) {
        console.warn("Firestore not ready or User ID missing for history load. Retrying...");
        setTimeout(loadUserHistory, 500);
        return;
    }

    const historyRef = collection(window.db, `artifacts/${appId}/users/${window.userId}/results`);
    // Отримуємо останні 10 результатів, сортуючи за часом створення
    const q = query(historyRef, orderBy("timestamp", "desc"), limit(10)); 

    // onSnapshot для оновлення в реальному часі
    onSnapshot(q, (snapshot) => {
        const historyItems = [];
        snapshot.forEach(doc => {
            historyItems.push({ id: doc.id, ...doc.data() });
        });
        
        renderHistory(historyItems);

    }, (error) => {
        console.error("Error fetching history from Firestore:", error);
        renderHistory([]); // Відображаємо пусту історію в разі помилки
    });
}

/**
 * Відображає історію проходжень тестів.
 * @param {Array} historyItems - Масив об'єктів історії.
 */
function renderHistory(historyItems) {
    if (!elements.historyContainer) return;

    let historyHtml = `
        <h3 class="text-2xl font-bold text-gray-700 mb-4">Ваша Історія Проходжень (Останні 10)</h3>
        <div class="space-y-3">
    `;

    if (historyItems.length === 0) {
        historyHtml += `<p class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Ви ще не завершили жодного тесту, який було збережено у Firebase.</p>`;
    } else {
        historyItems.forEach(item => {
            const date = new Date(item.timestamp).toLocaleString('uk-UA');
            const percent = item.totalQuestions > 0 ? ((item.correctPoints / item.totalQuestions) * 100).toFixed(0) : 0;
            const statusClass = item.correctPoints >= item.passingScore ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50';
            const statusText = item.correctPoints >= item.passingScore ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО';

            historyHtml += `
                <div class="p-4 rounded-lg shadow-md border-l-4 ${statusClass} flex justify-between items-center">
                    <div>
                        <p class="font-semibold text-gray-800">${item.testTitle}</p>
                        <p class="text-sm text-gray-500">${date} | ${item.correctPoints}/${item.totalQuestions} балів</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-lg ${statusClass.includes('green') ? 'text-green-700' : 'text-red-700'}">${percent}%</p>
                        <a href="results-page.html?resultId=${item.id}" 
                           onclick="localStorage.removeItem('b2_last_result_id');"
                           class="text-sm text-blue-500 hover:text-blue-700 transition">
                           Переглянути звіт
                        </a>
                    </div>
                </div>
            `;
        });
    }

    historyHtml += `</div>`;
    elements.historyContainer.innerHTML = historyHtml;
}


// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // Отримуємо ID результату з URL або localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('resultId') || localStorage.getItem('b2_last_result_id');

    // Якщо Firebase готовий, завантажуємо дані
    if (window.isAuthReady) {
        if (resultId) {
             loadResultData(resultId);
        } else {
            console.error("No result ID provided. Cannot load test results.");
            loadUserHistory(); // Хоча б завантажити історію, якщо це можливо
        }
    } else {
        // Чекаємо готовності Firebase, а потім завантажуємо дані
        window.addEventListener('firestoreReady', () => {
             if (resultId) {
                 loadResultData(resultId);
             } else {
                 console.error("No result ID provided. Cannot load test results.");
                 loadUserHistory();
             }
        });
    }
});