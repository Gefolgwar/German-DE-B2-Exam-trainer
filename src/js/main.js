import { collection, onSnapshot, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, query, limit } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getAIExplanation } from './aiService.js'; // Import the AI service
import { renderNavbar } from '../components/Navbar.js'; // Import the Navbar rendering function

// Глобальний стан додатку (для test-page.html)
let currentTest = null;
let userAnswers = {}; // { exerciseId: selectedIndex }
let currentExerciseIndex = 0; // Індекс вправи, яка зараз відображається
let flatExercises = []; // Оптимізація: плоский масив вправ
let timerInterval = null;
let timeLeftSeconds = 0;
let blockTimers = {}; // { blockId: { startTime, timeSpent, totalTime } }
let teilTimers = {}; // { teilId: { startTime, timeSpent } }
let exerciseTimers = {}; // { exerciseId: { startTime, timeSpent } }
// const testDurationPlaceholder = 1500; // Це тепер береться з об'єкта тесту

// --- DOM Елементи ---
const elements = {
    // Елементи для test-page.html
    testTitle: document.getElementById('test-title'),
    currentTestTitle: document.getElementById('current-test-title'),
    stimulusText: document.getElementById('stimulus-text'),
    stimulusContainer: document.getElementById('stimulus-container'),
    questionsContainer: document.getElementById('questions-container'),
    timerDisplay: document.getElementById('timer'),
    progressIndicator: document.getElementById('progress-indicator'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    finishBtn: document.getElementById('finish-btn'),
    blockTimerDisplay: document.getElementById('block-timer'),
    teilTimerDisplay: document.getElementById('teil-timer'),
    exerciseTimerDisplay: document.getElementById('exercise-timer'),

    // Елементи для index.html (завантажуються лише там)
    testListContainer: document.getElementById('test-list-container'),
    uploadJsonFile: document.getElementById('upload-json-file'),
    createNewTestBtn: document.getElementById('create-new-test-btn'), 
};

/**
 * Зберігає активну функцію відписки від onSnapshot для списку тестів.
 */
let unsubscribeFromTests = null;

let allTests = []; // Глобальний масив для зберігання тестів та їх статистики
let sortOrder = {
    completions: 'desc', // 'asc' or 'desc'
    score: 'desc'
};

// =========================================================================
// === Firebase & Допоміжні функції для роботи з даними (замінюють localStorage) ===
// =========================================================================

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * Генерує HTML-розмітку для одного тесту в списку.
 * @param {object} test - Об'єкт тесту з Firestore.
 */
function generateTestItemHtml(test, stats = { completions: 0, avgScore: 0 }) {
    // Адмін може редагувати все, користувач - тільки своє
    const canEdit = window.userRole === 'admin' || test.userId === window.userId;
    
    // Форматуємо дату оновлення
    let updatedAtString = '';
    if (test.updatedAt) {
        const date = new Date(test.updatedAt);
        updatedAtString = `Bearbeitet am: ${date.toLocaleDateString('de-DE')} um ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return `
        <div class="test-card bg-white p-4 rounded-xl shadow-lg border-l-4 border-blue-500 flex justify-between items-center gap-4">
            <!-- Ліва частина: Інформація -->
            <div class="flex-grow">
                <h4 class="text-xl font-bold text-gray-800">${test.title}</h4>
                <div class="text-sm text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                        <strong>${test.questions_total || 0}</strong> Fragen
                    </span>
                    <span>
                        <strong>${test.duration_minutes || 0}</strong> Min.
                    </span>
                    <span>
                        Absolviert: <strong>${stats.completions || 0}</strong> Mal
                    </span>
                    <span>
                        Durchschnitt: <strong>${stats.avgScore.toFixed(1)}%</strong>
                    </span>
                </div>
                <div class="text-xs text-gray-400 mt-2">
                    ${updatedAtString}
                </div>
            </div>

            <!-- Права частина: Кнопки -->
            <div class="flex-shrink-0 flex flex-col sm:flex-row gap-2 items-center">
                <button 
                    class="btn-run w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-full shadow-md transition"
                    data-test-id="${test.test_id}"
                >
                    Start
                </button>
                <a href="upload-test.html?edit=${test.test_id}" class="btn-edit bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition ${!canEdit ? 'hidden' : ''}">
                    Bearbeiten
                </a>
                <button class="btn-download bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition ${window.userRole !== 'admin' ? 'hidden' : ''}" data-test-id="${test.test_id}">
                    JSON
                </button>
                <button class="btn-delete bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition ${!canEdit ? 'hidden' : ''}" data-test-id="${test.test_id}" data-test-title="${test.title}">
                    Löschen
                </button>
            </div>
        </div>
    `;
}

/**
 * Завантажує список доступних тестів з Firestore.
 */
async function loadAvailableTests() {
    if (!window.db || !window.isAuthReady || !window.userId) {
        // Якщо Firebase ще не готовий, чекаємо
        console.warn("Firestore not ready or user not logged in. Waiting...");
        setTimeout(loadAvailableTests, 200);
        return;
    }
    
    // --- ЛОГІКА ДЛЯ ДЕМО-РЕЖИМУ ---
    if (window.userRole === 'test') {
        // Для тестового користувача - завантажуємо обмежену кількість тестів
        const assignedTestId = 'test-1763583666770-a5c28182ab19c8'; // Жорстко визначений ID
        try {
            const testDocRef = doc(window.db, `artifacts/${appId}/public/data/tests`, assignedTestId);
            const testDoc = await getDoc(testDocRef);
            
            if (testDoc.exists()) {
                allTests = [{ 
                    ...testDoc.data(), 
                    test_id: testDoc.id, 
                    stats: { completions: 0, avgScore: 0 } 
                }];
                renderAllTests();
            } else {
                elements.testListContainer.innerHTML = `<div class="p-10 text-center text-yellow-600 bg-yellow-100 rounded-lg">Der Ihnen zugewiesene Test (ID: ${assignedTestId}) wurde nicht gefunden.</div>`;
            }
        } catch (error) {
            console.error("Error fetching demo test:", error);
            elements.testListContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Fehler beim Laden des Demo-Tests: ${error.message}</div>`;
        }
        return; // Виходимо, щоб не завантажувати інші тести
    }
    // --- КІНЕЦЬ ЛОГІКИ ДЛЯ ДЕМО-РЕЖИМУ ---

    // 1. Завантажуємо статистику поточного користувача
    const userResultsRef = collection(window.db, `artifacts/${appId}/users/${window.userId}/results`);
    const statsSnapshot = await getDocs(userResultsRef);
    const testStats = {}; // { testId: { completions: number, totalPercent: number } }

    statsSnapshot.forEach(doc => {
        const result = doc.data();
        if (!testStats[result.testId]) {
            testStats[result.testId] = { completions: 0, totalPercent: 0 };
        }
        testStats[result.testId].completions++;
        const percent = result.totalQuestions > 0 ? (result.correctPoints / result.totalQuestions) * 100 : 0;
        testStats[result.testId].totalPercent += percent;
    });

    // 2. Завантажуємо тести і додаємо до них статистику
    const testCollectionRef = collection(window.db, `artifacts/${appId}/public/data/tests`);

    // Скасовуємо попередню підписку, якщо вона існує
    if (unsubscribeFromTests) {
        unsubscribeFromTests();
    }

    unsubscribeFromTests = onSnapshot(testCollectionRef, (snapshot) => {
        allTests = [];
        snapshot.forEach(doc => {
            const testData = doc.data();
            const stats = testStats[doc.id] || { completions: 0, totalPercent: 0 };
            allTests.push({ ...testData, test_id: doc.id, stats: { completions: stats.completions, avgScore: (stats.completions > 0) ? (stats.totalPercent / stats.completions) : 0 } });
        });
        renderAllTests();
    }, (error) => {
        console.error("Error fetching tests from Firestore:", error);
        if (elements.testListContainer) {
            elements.testListContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Fehler beim Laden der Tests: ${error.message}</div>`;
        }
    });
}

/**
 * Renders the list of all tests.
 */
function renderAllTests() {
    if (!elements.testListContainer) return;

    // Завжди показуємо адмін-контроль, якщо роль 'admin'
    if (window.userRole === 'admin') {
        document.getElementById('admin-controls')?.classList.remove('hidden');
        document.getElementById('admin-panel-link')?.classList.remove('hidden');
    }

    if (allTests.length === 0) {
        elements.testListContainer.innerHTML = `
            <div class="text-center p-8 bg-white rounded-xl shadow text-gray-500">
                Keine Tests gefunden. Bitte erstellen Sie einen neuen Test.
            </div>
        `;
    } else {
        elements.testListContainer.innerHTML = allTests.map(test => {
            return generateTestItemHtml(test, test.stats);
        }).join('');
        
        attachTestActionListeners();
    }
}


/**
 * Прикріплює обробники подій до кнопок керування тестами.
 */
function attachTestActionListeners() {
    document.querySelectorAll('.btn-run').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            startTest(testId);
        });
    });

    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            window.location.href = `upload-test.html?edit=${testId}`;
        });
    });
    
    document.querySelectorAll('.btn-download').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            downloadTestFromFirestore(testId);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            const testTitle = e.currentTarget.dataset.testTitle;
            if (confirm(`Sind Sie sicher, dass Sie den Test "${testTitle}" löschen möchten?`)) {
                deleteTestFromFirestore(testId);
            }
        });
    });
}

/**
 * Завантажує тест з Firestore і ініціює скачування JSON-файлу.
 * @param {string} testId 
 */
async function downloadTestFromFirestore(testId) {
    const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testId);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const testData = docSnap.data();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(testData, null, 4));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            const fileName = `${testData.title.toLowerCase().replace(/\s+/g, '-')}-test.json`; 
            downloadAnchorNode.setAttribute("download", fileName);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else {
            alert('Fehler: Test zum Herunterladen nicht gefunden.');
        }
    } catch (error) {
        console.error("Error downloading test for JSON export:", error);
        alert(`Fehler beim Herunterladen des Tests: ${error.message}`);
    }
}

/**
 * Видаляє тест з Firestore.
 */
async function deleteTestFromFirestore(testId) {
    await deleteDoc(doc(window.db, `artifacts/${appId}/public/data/tests`, testId));
    // onSnapshot автоматично оновить список
}

/**
 * Запускає тест, зберігаючи його ID для test-page.html.
 * @param {string} testId - ID тесту, який потрібно завантажити.
 */
window.startTest = function(testId) {
    localStorage.setItem('b2_test_to_load', testId);
    window.location.href = 'test-page.html';
}

// =========================================================================
// === Логіка Сторінки Тесту (test-page.html) ===
// =========================================================================

/**
 * Завантажує тест з Firestore за ID.
 * @param {string} testId 
 */
async function loadTest(testId) {
    if (!window.db) {
         console.warn("Firestore not ready. Retrying loadTest...");
         setTimeout(() => loadTest(testId), 200);
         return;
    }

    const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testId);

    try {
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const testData = docSnap.data();
            currentTest = { ...testData, test_id: docSnap.id };
            
            // Ініціалізація
            initializeTestState(currentTest);
            renderExercise(currentExerciseIndex);
            startTimer();
        } else {
            console.error("Test document not found:", testId);
            if (elements.questionsContainer) {
                elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Fehler: Test mit ID ${testId} nicht gefunden.</div>`;
            }
        }
    } catch (error) {
        console.error("Error loading test from Firestore:", error);
        if (elements.questionsContainer) {
            elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Fehler beim Laden des Tests: ${error.message}</div>`;
        }
    }
}


/**
 * Ініціалізує стан тесту: плоский список питань, заголовок, тривалість.
 */
function initializeTestState(test) {
    // Встановлюємо заголовки
    if (elements.testTitle) elements.testTitle.textContent = `${test.title} | B2 Test`;
    if (elements.currentTestTitle) elements.currentTestTitle.textContent = test.title;

    // Ініціалізуємо таймери
    blockTimers = {};
    teilTimers = {};
    exerciseTimers = {};

    test.blocks.forEach(block => {
        blockTimers[block.block_id] = { startTime: null, timeSpent: 0, totalTime: block.time * 60 };
        block.teils.forEach(teil => {
        });
    });

    // Створюємо плоский масив вправ
    flatExercises = [];
    test.blocks.forEach(block => {
        block.teils.forEach((teil, teilIndex) => {
            teil.exercises.forEach((ex, exIndex) => {
                // --- ГАРАНТУЄМО УНІКАЛЬНІСТЬ ID ---
                // Додаємо індекси, щоб уникнути дублікатів, якщо в JSON однакові ID
                const uniqueId = `${ex.id}-${teilIndex}-${exIndex}`;

                // --- Ініціалізуємо таймери з унікальними ID ---
                teilTimers[teil.teil_id] = { startTime: null, timeSpent: 0 };
                exerciseTimers[uniqueId] = { startTime: null, timeSpent: 0 };
                // -----------------------------------------
                flatExercises.push({
                    ...ex, id: uniqueId, // Перезаписуємо ID на унікальний
                    teil_id: teil.teil_id,
                    teil_name: teil.name,
                    teil_text: teil.text, // Pass teil text as instruction
                    block_id: block.block_id,
                    block_name: block.title, // Use block.title instead of block.name
                    block_time: block.time,
                });
            });
        });
    });
    
    // Ініціалізуємо відповіді
    userAnswers = flatExercises.reduce((acc, ex) => {
        acc[ex.id] = null; // null - відповідь не дана
        return acc;
    }, {});

    // Встановлюємо тривалість
    timeLeftSeconds = test.duration_minutes * 60;
}


// Функція для переходу до наступної вправи
function nextExercise() {
    // Зберігаємо поточну відповідь перед переходом
    const currentExercise = flatExercises[currentExerciseIndex];
    if (currentExercise.type === 'text_input') {
        const inputElement = document.getElementById(`ex-${currentExercise.id}-text-input`);
        if (inputElement) userAnswers[currentExercise.id] = inputElement.value;
    }
    if (currentExerciseIndex < flatExercises.length - 1) {
        updateTimersOnNavigation(currentExerciseIndex, currentExerciseIndex + 1);
        currentExerciseIndex++;
        renderExercise(currentExerciseIndex);
    }
}

// Функція для переходу до попередньої вправи
function prevExercise() {
    // Зберігаємо поточну відповідь перед переходом
    const currentExercise = flatExercises[currentExerciseIndex];
    if (currentExercise.type === 'text_input') {
        const inputElement = document.getElementById(`ex-${currentExercise.id}-text-input`);
        if (inputElement) userAnswers[currentExercise.id] = inputElement.value;
    }
    if (currentExerciseIndex > 0) {
        updateTimersOnNavigation(currentExerciseIndex, currentExerciseIndex - 1);
        currentExerciseIndex--;
        renderExercise(currentExerciseIndex);
    }
}


function updateTimersOnNavigation(oldIndex, newIndex) {
    const now = Date.now();
    const oldExercise = flatExercises[oldIndex];
    const newExercise = flatExercises[newIndex];

    // Stop old timers (записуємо накопичений час)
    if (oldExercise) {
        if (exerciseTimers[oldExercise.id].startTime) {
            exerciseTimers[oldExercise.id].timeSpent += now - exerciseTimers[oldExercise.id].startTime;
            exerciseTimers[oldExercise.id].startTime = null;
        }
        if (oldExercise.teil_id !== newExercise.teil_id && teilTimers[oldExercise.teil_id].startTime) {
            teilTimers[oldExercise.teil_id].timeSpent += now - teilTimers[oldExercise.teil_id].startTime;
            teilTimers[oldExercise.teil_id].startTime = null;
        }
        if (oldExercise.block_id !== newExercise.block_id && blockTimers[oldExercise.block_id].startTime) {
            blockTimers[oldExercise.block_id].timeSpent += now - blockTimers[oldExercise.block_id].startTime;
            blockTimers[oldExercise.block_id].startTime = null;
        }
    }

    // Start new timers (продовжуємо з накопиченого часу, не обнуляємо timeSpent)
    if (newExercise) {
        if (exerciseTimers[newExercise.id].startTime === null) {
            exerciseTimers[newExercise.id].startTime = now;
        }
        if (oldExercise.teil_id !== newExercise.teil_id && teilTimers[newExercise.teil_id].startTime === null) {
            teilTimers[newExercise.teil_id].startTime = now;
        }
        if (oldExercise.block_id !== newExercise.block_id && blockTimers[newExercise.block_id].startTime === null) {
            blockTimers[newExercise.block_id].startTime = now;
        }
    }
}


/**
 * Генерує HTML для поточної вправи
 */
function renderExercise(index) {
    if (!flatExercises[index]) return;

    const exercise = flatExercises[index];
    const totalExercises = flatExercises.length;

    // Запускаємо таймери для нової частини/блоку/вправи, якщо ми на них перейшли
    const { block_id, teil_id, id: exercise_id } = exercise;
    const now = Date.now();

    if (blockTimers[block_id] && blockTimers[block_id].startTime === null) {
        blockTimers[block_id].startTime = now;
    }
    if (teilTimers[teil_id] && teilTimers[teil_id].startTime === null) {
        teilTimers[teil_id].startTime = now;
    }
    if (exerciseTimers[exercise_id] && exerciseTimers[exercise_id].startTime === null) {
        exerciseTimers[exercise_id].startTime = now;
    }
    
    // --- Відображення стимулу (тексту для читання/слухання) ---
    if (elements.stimulusText) {
        let mediaHtml = '';

        // Рендеримо аудіо
        if (exercise.stimuli?.audios && exercise.stimuli.audios.length > 0) {
            mediaHtml += exercise.stimuli.audios.map(audio => `
                <div class="my-4">
                    <audio controls class="w-full">
                        <source src="${audio.url}" type="audio/mpeg">
                        Ihr Browser unterstützt das Audio-Element nicht.
                    </audio>
                </div>
            `).join('');
        }

        // Рендеримо зображення
        if (exercise.stimuli?.images && exercise.stimuli.images.length > 0) {
            mediaHtml += exercise.stimuli.images.map(image => `
                <div class="my-4">
                    <img src="${image.url}" alt="Bild zur Aufgabe" class="max-w-full h-auto rounded-lg shadow-md mx-auto">
                </div>
            `).join('');
        }

        elements.stimulusText.innerHTML = `
            <div class="text-sm font-semibold text-gray-600 mb-2">Anweisung zum Teil (${exercise.teil_name || 'N/A'}):</div>
            <p class="mb-4 text-blue-800 italic">${exercise.teil_text || ''}</p>
            ${mediaHtml}
            ${(exercise.stimuli?.texts || []).map(text => `<div class="border-l-4 border-gray-200 pl-4 bg-gray-50 p-3 rounded-lg text-gray-700 whitespace-pre-wrap mt-4">${text.content}</div>`).join('')}
        `;
    }

    // --- Відображення вправи ---
    const currentAnswer = userAnswers[exercise.id];
    let exerciseHtml = `
        <div id="ex-${exercise.id}" class="bg-white p-6 rounded-xl shadow-lg transition duration-200">
            <div class="mb-2 text-sm text-gray-500">
                Block: <span class="font-semibold text-gray-700">${exercise.block_name || 'N/A'}</span> | 
                Teil: <span class="font-semibold text-gray-700">${exercise.teil_name || 'N/A'}</span>
            </div>
            <p class="text-lg font-bold text-gray-800 mb-4">
                Übung ${index + 1} von ${totalExercises}:
                <span class="font-normal text-blue-600">${exercise.text}</span>
            </p>
            <div class="space-y-3">
    `;

    if (exercise.type === 'text_input') {
        // Render a textarea for text input exercises
        exerciseHtml += `
            <textarea 
                id="ex-${exercise.id}-text-input" 
                class="w-full p-4 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" 
                rows="6" 
                placeholder="Geben Sie hier Ihre Antwort ein..."
                oninput="handleAnswer('${exercise.id}', this.value)"
            >${currentAnswer || ''}</textarea>
        `;
    } else if (Array.isArray(exercise.options)) {
        // Existing logic for multiple-choice exercises
        exercise.options.forEach((option, optionIndex) => {
            const isSelected = currentAnswer === optionIndex;
            const optionId = `ex-${exercise.id}-o-${optionIndex}`;
            
            exerciseHtml += `
                <div class="flex items-center p-4 rounded-lg border-2 cursor-pointer transition duration-150 ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:bg-gray-50'}"
                     onclick="handleAnswer('${exercise.id}', ${optionIndex})">
                    <input type="radio" id="${optionId}" name="ex-${exercise.id}" value="${optionIndex}" class="hidden" ${isSelected ? 'checked' : ''}>
                    <label for="${optionId}" class="ml-3 text-gray-700 flex-grow cursor-pointer">
                        <span class="font-semibold text-blue-800 mr-2">${String.fromCharCode(65 + optionIndex)}.</span> 
                        ${option}
                    </label>
                </div>
            `;
        });
    } else {
        // Якщо варіанти відповідей відсутні, показуємо помилку
        exerciseHtml += `<div class="text-red-500 bg-red-100 p-4 rounded-lg">Fehler: Für diese Übung wurden keine Antwortoptionen gefunden oder der Typ wurde nicht angegeben.</div>`;
    }
    
    exerciseHtml += `
            </div>
        </div>
    `;

    if (elements.questionsContainer) {
        elements.questionsContainer.innerHTML = exerciseHtml;
    }
    
    // --- Оновлення навігації та прогресу ---
    if (elements.prevBtn) elements.prevBtn.disabled = index === 0;
    if (elements.nextBtn) elements.nextBtn.disabled = index === totalExercises - 1;
    if (elements.finishBtn) elements.finishBtn.textContent = index === totalExercises - 1 ? 'Test beenden' : 'Zum Abschluss';
    
    updateProgressBar(index, totalExercises);
}

// Обробник відповіді на питання
window.handleAnswer = function(exerciseId, answer) {
    userAnswers[exerciseId] = answer;
    // For text input, we don't need to re-render the exercise immediately on every input change
    // unless we want to save drafts or update UI based on input.
    // For multiple-choice, we still re-render to update the selected radio button.
    const exercise = flatExercises.find(ex => ex.id === exerciseId);
    if (exercise && exercise.type !== 'text_input') {
        renderExercise(currentExerciseIndex); 
    }
}

// Оновлення індикатора прогресу
function updateProgressBar(currentIndex, total) {
    const progressPercent = total > 0 ? (currentIndex + 1) / total * 100 : 0;
    const progressBar = elements.progressIndicator.querySelector('div');
    if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
    }
}

// Запуск та оновлення таймера
function updateTimers() {
    timeLeftSeconds--;
    if (elements.timerDisplay) {
        elements.timerDisplay.textContent = formatTime(timeLeftSeconds);
    }

    if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval);
        finishTest(true); // Автоматичне завершення
    }

    // Update block, teil, and exercise timers
    const now = Date.now();
    const currentExercise = flatExercises[currentExerciseIndex];
    if (!currentExercise) return;

    const { block_id, teil_id, id: exercise_id } = currentExercise;

    // Block timer
    if (blockTimers[block_id]) {
        let elapsed = blockTimers[block_id].timeSpent;
        if (blockTimers[block_id].startTime !== null) {
            elapsed += now - blockTimers[block_id].startTime;
        }
        elements.blockTimerDisplay.textContent = `Block: ${formatTime(Math.floor(elapsed / 1000))} / ${formatTime(blockTimers[block_id].totalTime)}`;
    }
    // Teil timer
    if (teilTimers[teil_id]) {
        let elapsed = teilTimers[teil_id].timeSpent;
        if (teilTimers[teil_id].startTime !== null) {
            elapsed += now - teilTimers[teil_id].startTime;
        }
        elements.teilTimerDisplay.textContent = `Teil: ${formatTime(Math.floor(elapsed / 1000))}`;
    }
    // Exercise timer
    if (exerciseTimers[exercise_id]) {
        let elapsed = exerciseTimers[exercise_id].timeSpent;
        if (exerciseTimers[exercise_id].startTime !== null) {
            elapsed += now - exerciseTimers[exercise_id].startTime;
        }
        elements.exerciseTimerDisplay.textContent = `Exercise: ${formatTime(Math.floor(elapsed / 1000))}`;
    }
}

// Запуск та оновлення таймера
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(updateTimers, 1000);
}

// Функція форматування часу
function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Обчислює результати та зберігає їх у Firestore.
 * @param {boolean} isTimedOut - Чи було завершення через тайм-аут.
 */
async function finishTest(isTimedOut) {
        // Утиліта для заміни undefined на null у всіх вкладених об'єктах/масивах

        // Примусово зберігаємо відповідь з поточного текстового поля перед завершенням
        const currentExerciseBeforeFinish = flatExercises[currentExerciseIndex];
        if (currentExerciseBeforeFinish && currentExerciseBeforeFinish.type === 'text_input') {
            const inputElement = document.getElementById(`ex-${currentExerciseBeforeFinish.id}-text-input`);
            if (inputElement) userAnswers[currentExerciseBeforeFinish.id] = inputElement.value;
        }

        function replaceUndefinedWithNull(obj) {
            if (Array.isArray(obj)) {
                return obj.map(replaceUndefinedWithNull);
            } else if (obj && typeof obj === 'object') {
                const newObj = {};
                for (const key in obj) {
                    if (Object.hasOwn(obj, key)) {
                        const val = obj[key];
                        newObj[key] = val === undefined ? null : replaceUndefinedWithNull(val);
                    }
                }
                return newObj;
            }
            return obj;
        }
    if (timerInterval) clearInterval(timerInterval);
    
    // Disable finish button and show loading
    if (elements.finishBtn) {
        elements.finishBtn.disabled = true;
        elements.finishBtn.textContent = 'Antworten werden verarbeitet...';
        elements.finishBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    
    // Зупиняємо всі таймери
    const now = Date.now();
    for (const id in blockTimers) {
        const timer = blockTimers[id];
        if (timer.startTime) {
            timer.timeSpent += now - timer.startTime;
            timer.startTime = null;
        }
    }
    for (const id in teilTimers) {
        const timer = teilTimers[id];
        if (timer.startTime) {
            timer.timeSpent += now - timer.startTime;
            timer.startTime = null;
        }
    }
    for (const id in exerciseTimers) {
        const timer = exerciseTimers[id];
        if (timer.startTime) {
            timer.timeSpent += now - timer.startTime;
            timer.startTime = null;
        }
    }

    const timeSpent = currentTest.duration_minutes * 60 - timeLeftSeconds;
    let correctCount = 0;
    
    const aiExplanationPromises = [];
    const aiExplanationsMap = new Map(); // To store AI explanations by exercise ID
    const detailedResults = flatExercises.map(ex => {
        const userAnswer = userAnswers[ex.id];
        let isCorrect = false;
        // let explanation = ex.explanation || ''; // This will be handled later

        if (ex.type === 'single_choice') {
            isCorrect = userAnswer === ex.correct_answer_index;
            if (isCorrect) {
                correctCount++;
            }
        } else if (ex.type === 'text_input') {
            // For text_input, correctness is determined by AI, so we don't count it here
            // Push a promise to get AI explanation
            aiExplanationPromises.push(
                getAIExplanation(ex.task_text || ex.text, userAnswer || '', ex.expected_answer_text || '', ex.ai_instructions || '')
                    .then(aiExplanation => {
                        // Store the explanation in the map with the exercise ID as the key
                        aiExplanationsMap.set(ex.id, aiExplanation);
                    })
                    .catch(error => {
                        console.error(`Error getting AI explanation for exercise ${ex.id}:`, error);
                        aiExplanationsMap.set(ex.id, "Fehler beim Abrufen der Erklärung von der KI.");
                    })
            );
            // Set isCorrect to false for now, AI will provide feedback
            isCorrect = false; 
        }
        
        return {
            exerciseId: ex.id,
            userInput: userAnswer, // Зберігаємо ввід користувача для text_input
            isCorrect: isCorrect,
            teilId: ex.teil_id,
            blockId: ex.block_id,
            type: ex.type,
            explanation: ex.explanation || '' // Start with the default explanation
        };
    });

    // Wait for all AI explanations to complete
    if (aiExplanationPromises.length > 0) {
        if (elements.finishBtn) {
            elements.finishBtn.textContent = 'Warte auf KI...';
        }
        await Promise.all(aiExplanationPromises);
    }

    // Now, update detailedResults with AI explanations
    detailedResults.forEach(result => {
        if (result.type === 'text_input' && aiExplanationsMap.has(result.exerciseId)) {
            const aiResponseText = aiExplanationsMap.get(result.exerciseId);
            result.explanation = aiResponseText;
            result.aiResponse = aiResponseText; // Зберігаємо відповідь AI
            // Ми залишаємо isCorrect = false для вправ, що перевіряються ШІ,
            // щоб вони завжди з'являлися у списку для перегляду,
            // оскільки ШІ не повертає булеве значення, а лише текстовий відгук.
            result.isCorrect = false;
        }
    });

    let resultData = {
        testId: currentTest.test_id,
        testTitle: currentTest.title,
        timestamp: new Date().toISOString(),
        correctPoints: detailedResults.filter(r => r.isCorrect).length,
        totalExercises: flatExercises.length,
        timeSpentSeconds: timeSpent,
        isTimedOut: isTimedOut,
        passingScore: currentTest.passing_score_points,
        blockTimes: blockTimers,
        teilTimes: teilTimers,
        exerciseTimes: exerciseTimers,
        detailedResults: detailedResults, // Use updated detailed results
        testSnapshot: currentTest 
    };
    resultData = replaceUndefinedWithNull(resultData);

    try {
        if (!window.db || !window.userId) throw new Error("Firebase oder Benutzer-ID nicht verfügbar.");

        // 1. Зберігаємо детальний результат для користувача
        const resultsCollectionRef = collection(window.db, `artifacts/${appId}/users/${window.userId}/results`);
        const newResultRef = await addDoc(resultsCollectionRef, resultData);

        // 2. Зберігаємо анонімний результат для загальної статистики
        const publicResultsRef = collection(window.db, `artifacts/${appId}/public/data/public_results`);
        await addDoc(publicResultsRef, {
            testId: resultData.testId,
            correctPoints: resultData.correctPoints,
            totalExercises: resultData.totalExercises,
            timestamp: resultData.timestamp,
        });


        // 3. Переходимо на сторінку результатів
        localStorage.setItem('b2_last_result_id', newResultRef.id);
        // localStorage.setItem('b2_test_to_load', currentTest.test_id); // Це більше не потрібно, оскільки ми передаємо resultId через URL
        
        window.location.href = 'results-page.html';

    } catch (error) {
        console.error("Помилка збереження результатів у Firestore:", error);
        alert(`Fehler beim Speichern der Ergebnisse. Sie werden nicht gespeichert: ${error.message}`);
        // Все одно переходимо на сторінку результатів, використовуючи локальне сховище
        localStorage.setItem('b2_last_result_data', JSON.stringify(resultData));
        window.location.href = 'results-page.html';
    } finally {
        // Re-enable button and reset text in case of error
        if (elements.finishBtn) {
            elements.finishBtn.disabled = false;
            elements.finishBtn.textContent = 'Test beenden';
            elements.finishBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}


// =========================================================================
// === Ініціалізація та Головний Обробник ===
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;

    if (currentPath.includes('index.html') || currentPath === '/') {
        // Логіка для головної сторінки
        
        // Чекаємо готовності Firebase
        if (window.isAuthReady) {
            loadAvailableTests();
        } else {
            window.addEventListener('firestoreReady', loadAvailableTests);
        }

        // Залишаємо можливість завантаження JSON як запасний варіант
        if (elements.uploadJsonFile) {
            elements.uploadJsonFile.addEventListener('change', handleJsonUpload);
        }
        
        // Обробники для сортування
        const sortByScoreBtn = document.getElementById('sort-by-score');
        const sortByCompletionsBtn = document.getElementById('sort-by-completions');

        const completionsSortIcon = document.getElementById('completions-sort-icon');
        const scoreSortIcon = document.getElementById('score-sort-icon');

        if (sortByScoreBtn) {
            sortByScoreBtn.addEventListener('click', () => {
                if (sortOrder.score === 'desc') {
                    allTests.sort((a, b) => b.stats.avgScore - a.stats.avgScore);
                    sortOrder.score = 'asc';
                    if (scoreSortIcon) scoreSortIcon.textContent = '▲';
                } else {
                    allTests.sort((a, b) => a.stats.avgScore - b.stats.avgScore);
                    sortOrder.score = 'desc';
                    if (scoreSortIcon) scoreSortIcon.textContent = '▼';
                }
                renderAllTests();
            });
        }
        if (sortByCompletionsBtn) {
            sortByCompletionsBtn.addEventListener('click', () => {
                if (sortOrder.completions === 'desc') {
                    allTests.sort((a, b) => b.stats.completions - a.stats.completions);
                    sortOrder.completions = 'asc';
                    if (completionsSortIcon) completionsSortIcon.textContent = '▲';
                } else {
                    allTests.sort((a, b) => a.stats.completions - b.stats.completions);
                    sortOrder.completions = 'desc';
                    if (completionsSortIcon) completionsSortIcon.textContent = '▼';
                }
                renderAllTests();
            });
        }

    } else if (currentPath.includes('test-page.html')) {
        // Логіка для сторінки тесту
        const testId = localStorage.getItem('b2_test_to_load');
        
        if (testId) {
            if (window.isAuthReady) {
                loadTest(testId);
            } else {
                window.addEventListener('firestoreReady', () => loadTest(testId));
            }
        } else {
            if (elements.questionsContainer) {
                 elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Kein Test zum Starten gefunden. Bitte kehren Sie zur Hauptseite zurück.</div>`;
            }
        }
        
        // Прикріплюємо обробники подій
        if (elements.nextBtn) elements.nextBtn.addEventListener('click', nextExercise);
        if (elements.prevBtn) elements.prevBtn.addEventListener('click', prevExercise);
        if (elements.finishBtn) elements.finishBtn.addEventListener('click', () => {
            window.onbeforeunload = null;
            finishTest(false);
        });

        // Додаємо попередження при спробі покинути сторінку
        window.onbeforeunload = (e) => {
            if (currentTest && !currentTest.isFinished) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        // Додаємо слухач, щоб скасувати підписку onSnapshot при залишенні сторінки
        window.addEventListener('beforeunload', () => {
            if (unsubscribeFromTests) {
                console.log("Unsubscribing from test list listener.");
                unsubscribeFromTests();
            }
        });
    }
});


// =========================================================================
// === Запасна Логіка Завантаження JSON (якщо Firebase недоступний або потрібен імпорт) ===
// =========================================================================

async function handleJsonUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (!json.test_id || !json.title) {
                alertBox('error', 'Ungültiges JSON-Format: test_id oder title fehlt.');
                return;
            }

            if (!window.db || !window.userId) {
                alertBox('error', 'Firebase ist nicht bereit. Test kann nicht gespeichert werden.');
                return;
            }

            // Додаємо userId до тесту
            const testToSave = { ...json, userId: window.userId };

            // Зберігаємо тест у Firebase
            const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testToSave.test_id);
            await setDoc(docRef, testToSave);

            alertBox('success', `Test "${testToSave.title}" erfolgreich in Firebase hochgeladen!`);
            // Список оновиться автоматично завдяки onSnapshot

        } catch (error) {
            alertBox('error', 'Помилка розбору JSON файлу.');
        }
    };
    reader.readAsText(file);
}

function alertBox(type, message) {
    // Дуже проста реалізація alert, оскільки window.alert заборонений
    const tempDiv = document.createElement('div');
    tempDiv.className = `fixed top-0 left-1/2 transform -translate-x-1/2 mt-4 p-4 rounded-lg shadow-xl z-50 
                         ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
    tempDiv.textContent = message;
    document.body.appendChild(tempDiv);
    setTimeout(() => tempDiv.remove(), 5000);
}