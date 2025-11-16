// --- DOM Елементи ---
const elements = {
    testSummaryTitle: document.getElementById('test-summary-title'),
    resultPoints: document.getElementById('result-points'),
    resultPercent: document.getElementById('result-percent'),
    resultTime: document.getElementById('result-time'),
    detailedReportContainer: document.getElementById('detailed-report-container'),
    reviewLink: document.getElementById('review-link')
};

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function calculateAndDisplayResults(rawResults) {
    if (!rawResults) {
        elements.detailedReportContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Не знайдено збережених результатів.</div>`;
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

    const scorePercentage = (correctCount / totalQuestions) * 100;
    
    // 2. Відображення Загальної Статистики (Ф7)
    elements.testSummaryTitle.textContent = `Тест: ${rawResults.testId}`;
    elements.resultPoints.textContent = `${correctCount}/${totalQuestions}`;
    elements.resultPercent.textContent = `${scorePercentage.toFixed(0)}%`;
    elements.resultTime.textContent = formatTime(rawResults.duration);

    // Зміна кольору балів залежно від прохідного відсотка (умовно)
    if (scorePercentage >= 60) {
        elements.resultPercent.classList.add('text-green-600');
        elements.resultPercent.classList.remove('text-red-600');
    } else {
        elements.resultPercent.classList.add('text-red-600');
        elements.resultPercent.classList.remove('text-green-600');
    }
    
    // 3. Відображення Детального Звіту (Ф8)
    elements.detailedReportContainer.innerHTML = '';
    
    rawResults.questions.forEach(q => {
        const userAnswerIndex = rawResults.answers[q.id];
        const isCorrect = userAnswerIndex === q.correct_answer_index;
        
        const cardClass = isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50';
        const statusText = isCorrect ? 'Правильно' : 'Помилка';
        const statusColor = isCorrect ? 'text-green-700' : 'text-red-700';

        const card = document.createElement('div');
        card.className = `p-6 rounded-lg shadow-md border-l-4 ${cardClass}`;
        
        card.innerHTML = `
            <h4 class="text-lg font-bold ${statusColor} mb-2 flex justify-between items-center">
                <span>Питання ${q.id}: ${statusText}</span>
                <span class="text-sm font-normal text-gray-500">Ваша відповідь: ${userAnswerIndex !== undefined ? q.options[userAnswerIndex].substring(0, 1) : '—'}</span>
            </h4>
            <p class="text-gray-700 mb-3">${q.text}</p>
            
            <div class="mt-4 space-y-2 text-sm">
                ${q.options.map((option, index) => {
                    const optionClass = [];
                    // Відповідь користувача
                    if (index === userAnswerIndex) {
                        optionClass.push(isCorrect ? 'bg-green-200 border-green-500 font-semibold' : 'bg-red-200 border-red-500 font-semibold line-through');
                    }
                    // Правильна відповідь
                    if (index === q.correct_answer_index) {
                        optionClass.push('bg-green-300 border-green-700 font-bold');
                    } else if (index !== userAnswerIndex) {
                        // Якщо це не обраний варіант і не правильний
                        optionClass.push('text-gray-600');
                    }
                    
                    return `
                        <p class="p-2 rounded-lg border ${optionClass.join(' ')}">
                            ${option}
                        </p>
                    `;
                }).join('')}
            </div>

            <!-- Пояснення (якщо помилка) -->
            ${!isCorrect && q.explanation ? `<div class="mt-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-gray-800">
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
        localStorage.removeItem('b2_test_results'); 
    } else {
        elements.detailedReportContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Не знайдено результатів останнього тесту. Спробуйте пройти тест знову.</div>`;
    }
});