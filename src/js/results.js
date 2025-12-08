import { getDoc, doc, collection, query } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { renderNavbar } from '../components/Navbar.js';

// --- DOM Elements ---
const elements = {
    testSummaryTitle: document.getElementById('test-summary-title'),
    resultPoints: document.getElementById('result-points'),
    resultPercent: document.getElementById('result-percent'),
    resultTime: document.getElementById('result-time'),
    resultIncorrect: document.getElementById('result-incorrect'),
    resultPointsShort: document.getElementById('result-points-short'),
    detailedReportContainer: document.getElementById('detailed-report-container'),
    reviewLink: document.getElementById('review-link'),
    resultIdDisplay: document.getElementById('result-id-display'), 
    statsByLevelContainer: document.getElementById('stats-by-level-container'), 
};

// Global state for results
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
 * Generates HTML markup for a single exercise in the report.
 */
function generateExerciseHtml({ q, originalIndex }) {
    // --- KEY FIX ---
    // Find the result by its index, not by ID, to avoid confusion with duplicate IDs.
    // We assume that detailedResults is stored in the same order as flatExercises.
    const detailedResult = currentResultData.detailedResults[originalIndex];
    if (!detailedResult) return '';

    // Find the block and part to which the exercise belongs
    // --- FIX: Use the saved block_name and teil_name ---
    const blockTitle = q.block_name || 'Unbekannter Block';
    const teilTitle = q.teil_name || 'Unbekannter Teil';

    const isCorrect = detailedResult.isCorrect;
    const userAnswer = detailedResult.userInput;
    
    // --- LOGIC FOR GETTING THE EXPLANATION ---
    let explanation = 'Erklärung nicht vorhanden.';
    if (q.type === 'text_input') {
        // For AI-checked exercises, the explanation is taken ONLY from the result.
        explanation = detailedResult.explanation || 'Erklärung von der KI nicht erhalten.';
    } else {
        // For other exercise types, take the explanation from the result or from the test template.
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
 * Loads the test result and the test itself (snapshot) from Firestore.
 * @param {string} resultId - The ID of the test result.
 */
async function loadResultData(resultId) {
    if (!window.db) {
         console.warn("Firestore not ready. Retrying loadResultData...");
         setTimeout(() => loadResultData(resultId), 200);
         return;
    }
    
    if (!window.userId) {
        // This shouldn't happen if isAuthReady has fired, but just in case
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
             // Try to load from localStorage as a fallback
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
 * Displays summary information about the result.
 */
function renderSummary() {
    if (!currentResultData || !currentTestSnapshot) return;

    const { totalExercises, timeSpentSeconds, detailedResults, testTitle, timestamp, blockTimes, teilTimes, exerciseTimes } = currentResultData;
    const passingScore = currentTestSnapshot.passing_score_points || 0;

    // --- Create a flat list of exercises for easy access ---
    const flatExercises = [];
    let totalTestPoints = 0;
    currentTestSnapshot.blocks.forEach(block => {
        block.teils.forEach((teil, teilIndex) => {
            teil.exercises.forEach((ex, exIndex) => {
                const uniqueId = `${ex.id}-${teilIndex}-${exIndex}`;
                flatExercises.push({ 
                    ...ex, 
                    id: uniqueId, 
                    originalIndex: flatExercises.length,
                    block_id: block.block_id, // <-- IMPORTANT FIX
                    teil_id: teil.teil_id
                });
                totalTestPoints += ex.points || 0;
            });
        });
    });

    // --- Calculate results based on points ---
    let userScore = 0;
    let correctAnswersCount = 0;
    detailedResults.forEach((result, index) => {
        if (result.isCorrect) {
            correctAnswersCount++;
            userScore += flatExercises[index]?.points || 0;
        }
    });

    const percent = totalExercises > 0 ? ((correctAnswersCount / totalExercises) * 100).toFixed(1) : 0;
    const incorrectCount = totalExercises - correctAnswersCount;
    const overallStatus = userScore >= passingScore ? 'BESTANDEN' : 'NICHT BESTANDEN';
    const formattedDate = new Date(timestamp).toLocaleString('uk-UA');
    
    elements.testSummaryTitle.innerHTML = `${testTitle} <span class="block text-lg font-normal text-gray-500 mt-1">${formattedDate}</span>`;
    elements.resultPoints.innerHTML = `${correctAnswersCount}/${totalExercises} richtig <span class="block text-2xl mt-2 ${overallStatus === 'BESTANDEN' ? 'text-green-600' : 'text-red-600'}">${overallStatus}</span>`;
    elements.resultPointsShort.textContent = userScore.toFixed(1);
    elements.resultPercent.textContent = `${percent}%`;
    elements.resultTime.textContent = formatTime(timeSpentSeconds);
    elements.resultIncorrect.textContent = incorrectCount;
    elements.resultIdDisplay.textContent = `Benutzer-ID: ${window.userId}`;

    // --- Statistics by level ---
    // Create a flat list of exercises, as in main.js, to access indices
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
        
        // Calculate total points for the block before displaying it
        const blockExercises = flatExercises.filter(ex => ex.block_id === block.block_id);
        const blockTotalPoints = blockExercises.reduce((sum, ex) => sum + parseFloat(ex.points || 0), 0);
        const blockUserPoints = blockExercises.reduce((sum, ex) => sum + (detailedResults[ex.originalIndex]?.isCorrect ? parseFloat(ex.points || 0) : 0), 0);

        block.teils.forEach(teil => {
            const teilTime = teilTimes[teil.teil_id] ? teilTimes[teil.teil_id].timeSpent / 1000 : 0;
            const exercisesInTeil = flatExercises.filter(ex => ex.teil_id === teil.teil_id);
            
            const teilStats = exercisesInTeil.reduce((acc, ex) => {
                const exResult = detailedResults[ex.originalIndex];
                const exPoints = exResult && exResult.isCorrect ? parseFloat(ex.points || 0) : 0;
                acc.points += exPoints;
                acc.maxPoints += parseFloat(ex.points || 0);
                return acc;
            }, { points: 0, maxPoints: 0 });
            
            // Display the block only once, before the first "Teil"
            if (block.teils.indexOf(teil) === 0) {
                 statsHtml += `
                    <div class="grid grid-cols-3 gap-4 items-center py-2 border-b border-gray-200">
                        <div class="font-bold text-blue-700">Block: ${block.title}</div>
                        <div class="text-center font-mono">${formatTime(blockTime)} / ${formatTime(block.time * 60)}</div>
                        <div class="text-right font-bold">${blockUserPoints.toFixed(1)}/${blockTotalPoints.toFixed(1)}</div>
                    </div>`;
            }
            statsHtml += `
                <div class="grid grid-cols-3 gap-4 items-center py-1 pl-4 border-l-2 border-blue-100">
                    <div class="text-blue-600">Teil: ${teil.name}</div>
                    <div class="text-center font-mono">${formatTime(teilTime)}</div>
                    <div class="text-right font-semibold">${teilStats.points.toFixed(1)}/${teilStats.maxPoints.toFixed(1)}</div>
                </div>
            `;

        });
    });

    statsHtml += `</div>`; // Close the main bg-white div
    elements.statsByLevelContainer.innerHTML = statsHtml;

    // --- Logic for reviewing mistakes ---
    // Use the already created `flatExercises`
    incorrectExercises = detailedResults
        .map((r, index) => ({ result: r, index })) // Add the index to each result
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
        
        // Review logic (all questions / only mistakes)
        let isReviewingAll = false;
        
        if (elements.reviewLink) {
            elements.reviewLink.textContent = incorrectExercises.length > 0 ? '🔍 Alle Übungen ansehen' : '🔍 Alle Übungen ansehen';
    
            elements.reviewLink.addEventListener('click', (e) => {
                e.preventDefault();
                isReviewingAll = !isReviewingAll;
                
                if (isReviewingAll) {
                    // Show all questions
                    currentReportList = flatExercises.map(q => ({ q, originalIndex: q.originalIndex }));
                    reportTitle = `Detaillierter Bericht: Alle ${totalExercises} Übungen`;
                    elements.reviewLink.textContent = '❌ Richtige Antworten ausblenden';
                } else {
                    // Show only mistakes
                    currentReportList = incorrectExercises;
                    reportTitle = incorrectExercises.length > 0 ? `Detaillierter Bericht über ${incorrectExercises.length} Fehler` : '🎉 Herzlichen Glückwunsch! Alle Antworten sind richtig.';
                    elements.reviewLink.textContent = '🔍 Alle Übungen ansehen';
                }
                
                elements.detailedReportContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-4">${reportTitle}</h3>` +
                    currentReportList.map((item) => generateExerciseHtml(item)).join('');
            });
        }}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Render the navigation bar
    renderNavbar();

    // Get the result ID from the URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('resultId') || localStorage.getItem('b2_last_result_id');

    // If Firebase is ready, load the data
    if (window.isAuthReady) {
        if (resultId) {
             loadResultData(resultId);
        } else {
            console.error("No result ID provided. Cannot load test results.");
        }
    } else {
        // Wait for Firebase to be ready, then load the data
        window.addEventListener('firestoreReady', () => {
             if (resultId) {
                 loadResultData(resultId);
             } else {
                 console.error("No result ID provided. Cannot load test results.");
             }
        });
    }
});