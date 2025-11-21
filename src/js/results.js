import { getDoc, doc, collection, query } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { renderNavbar } from '../components/Navbar.js';

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
    statsByLevelContainer: document.getElementById('stats-by-level-container'), 
};

// Глобальний стан для результатів
let currentResultData = null;
let currentTestSnapshot = null;
let incorrectExercises = [];

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

function formatTime(seconds) {
    let totalSeconds = Math.round(seconds);
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Генерує HTML-розмітку для однієї вправи у звіті.
 */
function generateExerciseHtml({ q, originalIndex }) {
    const detailedResult = currentResultData.detailedResults.find(r => r.exerciseId === q.id);
    if (!detailedResult) return '';

    // Знаходимо блок і частину, до якої належить вправа
    const block = currentTestSnapshot.blocks.find(b => b.teils.some(t => t.exercises.some(ex => ex.id === q.id)));
    const teil = block.teils.find(t => t.exercises.some(ex => ex.id === q.id));
    const blockTitle = block ? block.title : 'Невідомий блок';
    const teilTitle = teil ? teil.name : 'Невідома частина';

    const isCorrect = detailedResult.isCorrect;
    const userAnswer = detailedResult.userAnswer;
    const explanation = detailedResult.explanation || q.explanation || 'Пояснення відсутнє.';
    const exerciseTime = currentResultData.exerciseTimes[q.id] ? currentResultData.exerciseTimes[q.id].timeSpent / 1000 : 0;
    const exercisePoints = isCorrect ? q.points : 0;

    let statusText = '';
    let exerciseContentHtml = '';

    if (q.type === 'single_choice') {
        statusText = isCorrect
            ? "(Правильно)"
            : userAnswer === null || userAnswer === undefined
            ? "(Помилка - нічого не обрано)"
            : "(Помилка)";

        q.options.forEach((option, optionIndex) => {
            let optionClass = 'text-gray-700';
            if (optionIndex === q.correct_answer_index) {
                optionClass = 'bg-green-100 text-green-800 font-semibold border-green-500';
            } else if (optionIndex === userAnswer) {
                optionClass = 'bg-red-100 text-red-800 font-semibold border-red-500';
            }

            exerciseContentHtml += `
                <div class="p-3 rounded-lg border ${optionClass}">
                    <span class="font-bold mr-2">${String.fromCharCode(65 + optionIndex)}.</span> 
                    ${option}
                </div>
            `;
        });
    } else if (q.type === 'text_input') {
        statusText = "(Перевірено ШІ)";
        exerciseContentHtml = `
            <div class="mb-4">
                <p class="font-semibold text-gray-700 mb-1">Ваша відповідь:</p>
                <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 whitespace-pre-wrap">${userAnswer || 'Відповідь відсутня.'}</div>
            </div>
        `;
    }

    return `
        <div class="bg-white p-6 rounded-xl shadow-md border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}">
            <div class="flex justify-between items-center mb-4">
                 <h4 class="text-xl font-bold text-gray-800">
                    Вправа ${originalIndex + 1} <span class="text-base font-normal text-gray-500">(${blockTitle} / ${teilTitle})</span>
                    <span class="text-sm font-normal ml-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}">
                        ${statusText}
                    </span>
                </h4>
                <div class="text-right">
                    <p class="font-mono text-sm">Час: ${formatTime(exerciseTime)}</p>
                    <p class="font-bold text-sm">${exercisePoints}/${q.points} балів</p>
                </div>
            </div>
            
            <p class="text-gray-600 mb-4">${q.text}</p>
            
            <div class="space-y-3">
                ${exerciseContentHtml}
            </div>

            <div class="mt-4 p-3 bg-gray-100 rounded-lg">
                <p class="font-semibold text-gray-700 mb-1">Пояснення:</p>
                <p class="text-sm text-gray-600 whitespace-pre-wrap">${explanation}</p>
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

    const { correctPoints, totalExercises, timeSpentSeconds, passingScore, detailedResults, testTitle, timestamp, blockTimes, teilTimes, exerciseTimes } = currentResultData;
    const percent = totalExercises > 0 ? ((correctPoints / totalExercises) * 100).toFixed(1) : 0;
    const incorrectCount = totalExercises - correctPoints;
    const overallStatus = correctPoints >= passingScore ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО';
    const formattedDate = new Date(timestamp).toLocaleString('uk-UA');
    
    elements.testSummaryTitle.innerHTML = `${testTitle} <span class="block text-lg font-normal text-gray-500 mt-1">${formattedDate}</span>`;
    elements.resultPoints.innerHTML = `${correctPoints}/${totalExercises} <span class="text-xl text-gray-500">(Загальний прохідний: ${passingScore})</span> <span class="block text-2xl mt-2 ${overallStatus === 'ПРОЙДЕНО' ? 'text-green-600' : 'text-red-600'}">${overallStatus}</span>`;
    elements.resultPercent.textContent = `${percent}%`;
    elements.resultTime.textContent = formatTime(timeSpentSeconds);
    elements.resultIncorrect.textContent = incorrectCount;
    elements.resultIdDisplay.textContent = `ID Користувача: ${window.userId}`;

    // --- Статистика за рівнями ---
    let statsHtml = `
        <h3 class="text-2xl font-bold text-gray-700 pt-4 border-t mb-6">Статистика за рівнями</h3>
        <div class="bg-white p-4 rounded-xl shadow-md">
            <div class="grid grid-cols-3 gap-4 font-bold text-gray-700 border-b pb-2 mb-2">
                <div>Назва</div>
                <div class="text-center">Час</div>
                <div class="text-right">Бали</div>
            </div>
    `;

    let exerciseCounter = 0;
    currentTestSnapshot.blocks.forEach(block => {
        const blockTime = blockTimes[block.block_id] ? blockTimes[block.block_id].timeSpent / 1000 : 0;
        let blockPoints = 0;
        let blockMaxPoints = 0;

        block.teils.forEach(teil => {
            let teilPoints = 0;
            let teilMaxPoints = 0;

            teil.exercises.forEach(ex => {
                const exResult = detailedResults.find(r => r.exerciseId === ex.id);
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                
                teilPoints += exPoints;
                teilMaxPoints += ex.points;
            });

            blockPoints += teilPoints;
            blockMaxPoints += teilMaxPoints;
        });

        statsHtml += `
            <div class="grid grid-cols-3 gap-4 items-center py-2 border-b border-gray-200">
                <div class="font-bold text-blue-700">Блок: ${block.title}</div>
                <div class="text-center font-mono">${formatTime(blockTime)} / ${formatTime(block.time * 60)}</div>
                <div class="text-right font-bold">${blockPoints}/${blockMaxPoints}</div>
            </div>
        `;

        block.teils.forEach(teil => {
            const teilTime = teilTimes[teil.teil_id] ? teilTimes[teil.teil_id].timeSpent / 1000 : 0;
            let teilPoints = 0;
            let teilMaxPoints = 0;

            teil.exercises.forEach(ex => {
                const exResult = detailedResults.find(r => r.exerciseId === ex.id);
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                
                teilPoints += exPoints;
                teilMaxPoints += ex.points;
            });

            statsHtml += `
                <div class="grid grid-cols-3 gap-4 items-center py-1 pl-4 border-l-2 border-blue-100">
                    <div class="text-blue-600">Частина: ${teil.name}</div>
                    <div class="text-center font-mono">${formatTime(teilTime)}</div>
                    <div class="text-right font-semibold">${teilPoints}/${teilMaxPoints}</div>
                </div>
            `;

            teil.exercises.forEach(ex => {
                exerciseCounter++;
                const exResult = detailedResults.find(r => r.exerciseId === ex.id);
                const exTime = exerciseTimes[ex.id] ? exerciseTimes[ex.id].timeSpent / 1000 : 0;
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                
                statsHtml += `
                    <div class="grid grid-cols-3 gap-4 items-center py-1 pl-8 text-sm text-gray-700">
                        <div>Вправа №${exerciseCounter}</div>
                        <div class="text-center font-mono">${formatTime(exTime)}</div>
                        <div class="text-right">${exPoints}/${ex.points}</div>
                    </div>
                `;
            });
        });
    });

    statsHtml += `</div>`; // Close the main bg-white div
    elements.statsByLevelContainer.innerHTML = statsHtml;


    // --- Логіка для перегляду помилок ---
    const flatExercises = currentTestSnapshot.blocks.flatMap(b => b.teils.flatMap(t => t.exercises));

        incorrectExercises = detailedResults
            .filter(r => !r.isCorrect)
            .map(r => {
                const exerciseData = flatExercises.find(ex => ex.id === r.exerciseId);
                const originalIndex = flatExercises.findIndex(ex => ex.id === r.exerciseId);
                return { q: exerciseData, originalIndex: originalIndex };
            });
    
        let reportTitle = incorrectExercises.length > 0 
            ? `Детальний Звіт про ${incorrectExercises.length} Помилок` 
            : '🎉 Вітаємо! Всі відповіді правильні.';
    
        let currentReportList = incorrectExercises;
        
        elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` +
            currentReportList.map(generateExerciseHtml).join('');
        
        // Логіка перегляду (всі питання / лише помилки)
        let isReviewingAll = false;
        
        if (elements.reviewLink) {
            elements.reviewLink.textContent = incorrectExercises.length > 0 ? '🔍 Переглянути Усі Вправи' : '🔍 Переглянути Усі Вправи';
    
            elements.reviewLink.addEventListener('click', (e) => {
                e.preventDefault();
                isReviewingAll = !isReviewingAll;
                
                if (isReviewingAll) {
                    // Показуємо всі питання
                    currentReportList = flatExercises.map((q, index) => ({ q, originalIndex: index }));
                    reportTitle = `Детальний Звіт: Усі ${totalExercises} Вправ`;
                    elements.reviewLink.textContent = '❌ Приховати Правильні Відповіді';
                } else {
                    // Показуємо лише помилки
                    currentReportList = incorrectExercises;
                    reportTitle = incorrectExercises.length > 0 ? `Детальний Звіт про ${incorrectExercises.length} Помилок` : '🎉 Вітаємо! Всі відповіді правильні.';
                    elements.reviewLink.textContent = '🔍 Переглянути Усі Вправи';
                }
                
                elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` +
                    currentReportList.map((item) => generateExerciseHtml(item)).join('');
            });
        }}

// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // Рендеримо навігаційну панель
    renderNavbar();

    // Отримуємо ID результату з URL або localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('resultId') || localStorage.getItem('b2_last_result_id');

    // Якщо Firebase готовий, завантажуємо дані
    if (window.isAuthReady) {
        if (resultId) {
             loadResultData(resultId);
        } else {
            console.error("No result ID provided. Cannot load test results.");
        }
    } else {
        // Чекаємо готовності Firebase, а потім завантажуємо дані
        window.addEventListener('firestoreReady', () => {
             if (resultId) {
                 loadResultData(resultId);
             } else {
                 console.error("No result ID provided. Cannot load test results.");
             }
        });
    }
});