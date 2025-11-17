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
    if (seconds < 0) seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// --- Firebase Ініціалізація та Завантаження Історії (залишаємо як є) ---

// (Функції setupFirebase, loadUserHistory залишаються без змін)

// --- НОВА ФУНКЦІЯ: Згладжування питань з об'єкта 'parts' ---
function flattenQuestions(resultsData) {
    if (resultsData.questions && Array.isArray(resultsData.questions)) {
        // Старий формат: список питань вже плоский
        return resultsData.questions;
    }
    
    if (resultsData.parts && Array.isArray(resultsData.parts)) {
        // Новий формат: згладжуємо з частин
        let flatList = [];
        resultsData.parts.forEach(part => {
            part.questions.forEach(q => {
                // Додаємо інформацію про частину до питання для відображення
                flatList.push({...q, partInstruction: part.instruction, partId: part.part_id }); 
            });
        });
        return flatList;
    }
    return [];
}


// --- Логіка Відображення Результатів (ОНОВЛЕНО) ---

function renderResults() {
    const resultsJson = localStorage.getItem('b2_test_results');
    if (!resultsJson) {
        if (elements.testSummaryTitle) {
            elements.testSummaryTitle.textContent = 'Результати не знайдено.';
        }
        return;
    }

    const resultsData = JSON.parse(resultsJson);
    
    // Використовуємо функцію для отримання плоского списку питань
    const questions = flattenQuestions(resultsData.testData); 
    const userAnswers = resultsData.userAnswers || {};
    
    let correctCount = 0;
    const totalQuestions = questions.length;

    // 1. Обчислення результату
    questions.forEach((q, index) => {
        const userAnswerIndex = userAnswers[index];
        if (userAnswerIndex !== undefined && userAnswerIndex === q.correct_answer_index) {
            correctCount++;
        }
    });

    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const isPassed = correctCount >= resultsData.passingScore;
    
    // 2. Відображення загальних даних
    if (elements.testSummaryTitle) elements.testSummaryTitle.textContent = resultsData.title;
    if (elements.resultPoints) elements.resultPoints.textContent = `${correctCount}/${totalQuestions}`;
    if (elements.resultPercent) elements.resultPercent.textContent = `${percentage}%`;
    if (elements.resultTime) elements.resultTime.textContent = formatTime(resultsData.timeSpent);

    // Оновлення статусу "Складено/Не складено"
    const statusBox = document.getElementById('pass-fail-status');
    if (statusBox) {
        if (isPassed) {
            statusBox.textContent = 'Тест Складено! 🎉';
            statusBox.className = 'text-center text-3xl font-extrabold text-white p-4 rounded-t-xl bg-green-500';
        } else {
            statusBox.textContent = 'Тест Не Складено. 😥';
            statusBox.className = 'text-center text-3xl font-extrabold text-white p-4 rounded-t-xl bg-red-500';
        }
    }


    // 3. Генерація детального звіту
    if (elements.detailedReportContainer) {
        
        // Звіт: Переглядаємо лише неправильні відповіді, якщо це початковий режим
        const incorrectQuestions = questions
            .map((q, index) => ({ q, originalIndex: index })) // Зберігаємо оригінальний індекс
            .filter(item => userAnswers[item.originalIndex] !== item.q.correct_answer_index);

        // Функція для генерації HTML одного питання/відповіді
        const generateQuestionHtml = (item) => {
            const { q, originalIndex: index } = item; // Використовуємо оригінальний індекс
            const userAnswerIndex = userAnswers[index];
            const isCorrect = userAnswerIndex === q.correct_answer_index;
            const statusClass = isCorrect ? 'bg-green-100 border-green-500' : 'bg-red-100 border-red-500';
            const statusEmoji = isCorrect ? '✅' : '❌';

            return `
                <div class="p-4 rounded-xl shadow-md border-l-4 ${statusClass}">
                    <h5 class="font-bold text-lg text-gray-800 mb-2">
                        ${statusEmoji} Питання ${index + 1} (${q.partInstruction ? q.partInstruction.substring(0, 30) + '...' : 'Завдання'})
                    </h5>
                    <p class="mb-3 text-gray-700 font-medium">${q.text}</p>
                    
                    <div class="space-y-2 text-sm">
                        ${q.options.map((option, optIndex) => {
                            const isCorrectAnswer = optIndex === q.correct_answer_index;
                            const isUserAnswer = optIndex === userAnswerIndex;
                            let optionClass = 'p-2 rounded';
                            
                            if (isCorrectAnswer) {
                                optionClass += ' bg-green-200 font-semibold';
                            } else if (isUserAnswer) {
                                optionClass += ' bg-red-200 font-semibold';
                            } else {
                                optionClass += ' bg-gray-50';
                            }

                            return `<p class="${optionClass}">
                                ${String.fromCharCode(65 + optIndex)}. ${option} 
                                ${isCorrectAnswer ? ' (Правильно)' : ''}
                                ${isUserAnswer && !isCorrectAnswer ? ' (Ваша відповідь)' : ''}
                            </p>`;
                        }).join('')}
                    </div>

                    <div class="mt-4 p-3 bg-gray-50 border-l-4 border-blue-400 rounded">
                        <p class="font-semibold text-blue-700">Пояснення:</p>
                        <p class="text-gray-700">${q.explanation}</p>
                    </div>
                </div>
            `;
        };
        
        // Відображаємо тільки неправильні відповіді за замовчуванням
        let currentReportList = incorrectQuestions;
        let reportTitle = incorrectQuestions.length > 0 ? `Детальний Звіт про ${incorrectQuestions.length} Помилок` : '🎉 Вітаємо! Всі відповіді правильні.';
        
        elements.detailedReportContainer.innerHTML = 
            `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` + 
            currentReportList.map(generateQuestionHtml).join('');


        // 4. Обробник кнопки "Переглянути Помилки/Всі Питання"
        let isReviewingAll = false;
        if (elements.reviewLink) {
            elements.reviewLink.textContent = '🔍 Переглянути Всі Питання';
            elements.reviewLink.addEventListener('click', (e) => {
                e.preventDefault();
                isReviewingAll = !isReviewingAll;
                
                if (isReviewingAll) {
                    currentReportList = questions.map((q, index) => ({ q, originalIndex: index }));
                    reportTitle = `Детальний Звіт: Усі ${totalQuestions} Питань`;
                    elements.reviewLink.textContent = '❌ Приховати Правильні Відповіді';
                } else {
                    currentReportList = incorrectQuestions;
                    reportTitle = incorrectQuestions.length > 0 ? `Детальний Звіт про ${incorrectQuestions.length} Помилок` : '🎉 Вітаємо! Всі відповіді правильні.';
                    elements.reviewLink.textContent = '🔍 Переглянути Всі Питання';
                }
                
                elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` + 
                    currentReportList.map(generateQuestionHtml).join('');
            });
        }
    }

    // loadUserHistory(); // (Якщо ви використовуєте Firebase, ця функція завантажує історію)
}

// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    renderResults();
});

// Функція-заглушка для Firebase, якщо вона використовується
function loadUserHistory() { /* Функція Firebase */ }