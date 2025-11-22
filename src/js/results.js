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
    // --- КЛЮЧОВЕ ВИПРАВЛЕННЯ ---
    // Знаходимо результат за його індексом, а не за ID, щоб уникнути плутанини з дублікатами ID.
    // Ми припускаємо, що detailedResults зберігається в тому ж порядку, що і flatExercises.
    const detailedResult = currentResultData.detailedResults[originalIndex];
    if (!detailedResult) return '';

    // Знаходимо блок і частину, до якої належить вправа
    // --- ВИПРАВЛЕННЯ: Використовуємо збережені block_name та teil_name ---
    const blockTitle = q.block_name || 'Unbekannter Block';
    const teilTitle = q.teil_name || 'Unbekannter Teil';

    const isCorrect = detailedResult.isCorrect;
    const userAnswer = detailedResult.userAnswer;
    
    // --- ЛОГІКА ОТРИМАННЯ ПОЯСНЕННЯ ---
    let explanation = 'Erklärung nicht vorhanden.';
    if (q.type === 'text_input') {
        // Для вправ, що перевіряються ШІ, пояснення береться ТІЛЬКИ з результату.
        explanation = detailedResult.explanation || 'Erklärung von der KI nicht erhalten.';
    } else {
        // Для інших типів вправ, беремо пояснення з результату, або з шаблону тесту.
        explanation = detailedResult.explanation || q.explanation || 'Erklärung nicht vorhanden.';
    }

    const exerciseTime = currentResultData.exerciseTimes[q.id] ? currentResultData.exerciseTimes[q.id].timeSpent / 1000 : 0;
    const exercisePoints = isCorrect ? q.points : 0;

    let statusText = '';
    let exerciseContentHtml = '';

    if (q.type === 'single_choice') {
        statusText = isCorrect
            ? "(Richtig)"
            : userAnswer === null || userAnswer === undefined
            ? "(Fehler - nichts ausgewählt)"
            : "(Fehler)";

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
        statusText = "(Von KI geprüft)";
        exerciseContentHtml = `
            <div class="mb-4">
                <p class="font-semibold text-gray-700 mb-1">Ihre Antwort:</p>
                <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 whitespace-pre-wrap">${userAnswer || 'Antwort fehlt.'}</div>
            </div>
        `;
    }

    return `
        <div class="bg-white p-6 rounded-xl shadow-md border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}">
            <div class="flex justify-between items-center mb-4">
                 <h4 class="text-xl font-bold text-gray-800">
                    Übung ${originalIndex + 1} <span class="text-base font-normal text-gray-500">(${blockTitle} / ${teilTitle})</span>
                    <span class="text-sm font-normal ml-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}">
                        ${statusText}
                    </span>
                </h4>
                <div class="text-right">
                    <p class="font-mono text-sm">Zeit: ${formatTime(exerciseTime)}</p>
                    <p class="font-bold text-sm">${exercisePoints}/${q.points} Punkte</p>
                </div>
            </div>
            
            <p class="text-gray-600 mb-4">${q.text}</p>
            
            <div class="space-y-3">
                ${exerciseContentHtml}
            </div>

            <div class="mt-4 p-3 bg-gray-100 rounded-lg">
                <p class="font-semibold text-gray-700 mb-1">Erklärung:</p>
                <p class="text-sm text-gray-600 whitespace-pre-wrap">${explanation || 'Keine Erklärung verfügbar.'}</p>
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
                throw new Error(`Ergebnis mit ID ${resultId} nicht gefunden.`);
            }
        }
    } catch (error) {
        console.error("Error loading result data:", error);
        elements.detailedReportContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Fehler beim Laden der Ergebnisse: ${error.message}</div>`;
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
    const overallStatus = correctPoints >= passingScore ? 'BESTANDEN' : 'NICHT BESTANDEN';
    const formattedDate = new Date(timestamp).toLocaleString('uk-UA');
    
    elements.testSummaryTitle.innerHTML = `${testTitle} <span class="block text-lg font-normal text-gray-500 mt-1">${formattedDate}</span>`;
    elements.resultPoints.innerHTML = `${correctPoints}/${totalExercises} <span class="text-xl text-gray-500">(Bestehensgrenze: ${passingScore})</span> <span class="block text-2xl mt-2 ${overallStatus === 'BESTANDEN' ? 'text-green-600' : 'text-red-600'}">${overallStatus}</span>`;
    elements.resultPercent.textContent = `${percent}%`;
    elements.resultTime.textContent = formatTime(timeSpentSeconds);
    elements.resultIncorrect.textContent = incorrectCount;
    elements.resultIdDisplay.textContent = `Benutzer-ID: ${window.userId}`;

    // --- Статистика за рівнями ---
    // Створюємо "плаский" список вправ, як і в main.js, щоб мати доступ до індексів
    const flatExercises = [];
    currentTestSnapshot.blocks.forEach(block => {
        block.teils.forEach((teil, teilIndex) => {
            teil.exercises.forEach((ex, exIndex) => {
                const uniqueId = `${ex.id}-${teilIndex}-${exIndex}`;
                // Зберігаємо оригінальний індекс для легкого доступу до результату
                flatExercises.push({ ...ex, id: uniqueId, originalIndex: flatExercises.length });
            });
        });
    });

    let statsHtml = `
        <h3 class="text-2xl font-bold text-gray-700 pt-4 border-t mb-6">Statistik nach Niveaus</h3>
        <div class="bg-white p-4 rounded-xl shadow-md">
            <div class="grid grid-cols-3 gap-4 font-bold text-gray-700 border-b pb-2 mb-2">
                <div>Name</div>
                <div class="text-center">Zeit</div>
                <div class="text-right">Punkte</div>
            </div>
    `;

    currentTestSnapshot.blocks.forEach(block => {
        const blockTime = blockTimes[block.block_id] ? blockTimes[block.block_id].timeSpent / 1000 : 0;
        let blockPoints = 0;
        let blockMaxPoints = 0;

        block.teils.forEach(teil => {
            // Знаходимо всі вправи, що належать до цього "Teil"
            const exercisesInTeil = flatExercises.filter(ex => ex.teil_id === teil.teil_id);
            
            const teilStats = exercisesInTeil.reduce((acc, ex) => {
                // Знаходимо результат за індексом
                const exResult = detailedResults[ex.originalIndex];
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                acc.points += exPoints;
                acc.maxPoints += ex.points;
                return acc;
            }, { points: 0, maxPoints: 0 });

            blockPoints += teilStats.points;
            blockMaxPoints += teilStats.maxPoints;
        });

        statsHtml += `
            <div class="grid grid-cols-3 gap-4 items-center py-2 border-b border-gray-200">
                <div class="font-bold text-blue-700">Block: ${block.title}</div>
                <div class="text-center font-mono">${formatTime(blockTime)} / ${formatTime(block.time * 60)}</div>
                <div class="text-right font-bold">${blockPoints}/${blockMaxPoints}</div>
            </div>
        `;

        block.teils.forEach(teil => {
            const teilTime = teilTimes[teil.teil_id] ? teilTimes[teil.teil_id].timeSpent / 1000 : 0;
            const exercisesInTeil = flatExercises.filter(ex => ex.teil_id === teil.teil_id);
            
            const teilStats = exercisesInTeil.reduce((acc, ex) => {
                const exResult = detailedResults[ex.originalIndex];
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                acc.points += exPoints;
                acc.maxPoints += ex.points;
                return acc;
            }, { points: 0, maxPoints: 0 });
            
            statsHtml += `
                <div class="grid grid-cols-3 gap-4 items-center py-1 pl-4 border-l-2 border-blue-100">
                    <div class="text-blue-600">Teil: ${teil.name}</div>
                    <div class="text-center font-mono">${formatTime(teilTime)}</div>
                    <div class="text-right font-semibold">${teilStats.points}/${teilStats.maxPoints}</div>
                </div>
            `;

            exercisesInTeil.forEach(ex => {
                const exResult = detailedResults[ex.originalIndex];
                const exTime = exerciseTimes[ex.id] ? exerciseTimes[ex.id].timeSpent / 1000 : 0;
                const exPoints = exResult && exResult.isCorrect ? ex.points : 0;
                
                statsHtml += `
                    <div class="grid grid-cols-3 gap-4 items-center py-1 pl-8 text-sm text-gray-700">
                        <div>Übung Nr.${ex.originalIndex + 1}</div>
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
    // Використовуємо вже створений `flatExercises`
    incorrectExercises = detailedResults
        .map((r, index) => ({ result: r, index })) // Додаємо індекс до кожного результату
        .filter(item => !item.result.isCorrect)
        .map(item => {
            const exerciseData = flatExercises[item.index];
            return { q: exerciseData, originalIndex: item.index };
        });
    
        let reportTitle = incorrectExercises.length > 0 
            ? `Detaillierter Bericht über ${incorrectExercises.length} Fehler` 
            : '🎉 Herzlichen Glückwunsch! Alle Antworten sind richtig.';
    
        let currentReportList = incorrectExercises;
        
        elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` +
            currentReportList.map(generateExerciseHtml).join('');
        
        // Логіка перегляду (всі питання / лише помилки)
        let isReviewingAll = false;
        
        if (elements.reviewLink) {
            elements.reviewLink.textContent = incorrectExercises.length > 0 ? '🔍 Alle Übungen ansehen' : '🔍 Alle Übungen ansehen';
    
            elements.reviewLink.addEventListener('click', (e) => {
                e.preventDefault();
                isReviewingAll = !isReviewingAll;
                
                if (isReviewingAll) {
                    // Показуємо всі питання
                    currentReportList = flatExercises.map(q => ({ q, originalIndex: q.originalIndex }));
                    reportTitle = `Detaillierter Bericht: Alle ${totalExercises} Übungen`;
                    elements.reviewLink.textContent = '❌ Richtige Antworten ausblenden';
                } else {
                    // Показуємо лише помилки
                    currentReportList = incorrectExercises;
                    reportTitle = incorrectExercises.length > 0 ? `Detaillierter Bericht über ${incorrectExercises.length} Fehler` : '🎉 Herzlichen Glückwunsch! Alle Antworten sind richtig.';
                    elements.reviewLink.textContent = '🔍 Alle Übungen ansehen';
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