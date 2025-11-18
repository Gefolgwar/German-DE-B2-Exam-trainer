import { collection, onSnapshot, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Глобальний стан додатку (для test-page.html)
let currentTest = null;
let userAnswers = {}; // { questionId: selectedIndex }
let currentQuestionIndex = 0; // Індекс питання, яке зараз відображається
let flatQuestions = []; // Оптимізація: плоский масив питань
let timerInterval = null;
let timeLeftSeconds = 0;
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

    // Елементи для index.html (завантажуються лише там)
    testListContainer: document.getElementById('test-list-container'),
    uploadJsonFile: document.getElementById('upload-json-file'),
    createNewTestBtn: document.getElementById('create-new-test-btn'), 
};

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

    const actionButtons = `
        <button 
            class="btn-run bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
            data-test-id="${test.test_id}"
        >
            ▶️ Запустити
        </button>
        <button 
            class="btn-edit bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition ${!canEdit ? 'hidden' : ''}"
            data-test-id="${test.test_id}"
        >
            ✏️ Редагувати
        </button>
        <button 
            class="btn-download bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
            data-test-id="${test.test_id}"
        >
            ⬇️ Скачати
        </button>
        <button 
            class="btn-delete bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition ${!canEdit ? 'hidden' : ''}"
            data-test-id="${test.test_id}"
            data-test-title="${test.title}"
        >
            🗑️ Видалити
        </button>
    `;
    
    return `
        <div class="test-card bg-white p-5 rounded-xl shadow-md border-l-4 border-blue-500 flex justify-between items-center flex-wrap gap-4">
            <div>
                <h4 class="text-xl font-semibold text-gray-800">${test.title}</h4>
                <p class="text-sm text-gray-500 mt-1">
                    Питань: ${test.questions_total} | Хв: ${test.duration_minutes} | Прохідний бал: ${test.passing_score_points}
                </p>
                <p class="text-xs text-gray-400 mt-1">ID: ${test.test_id}</p>
                <div class="mt-2 text-xs text-gray-500">
                    <span class="inline-block bg-gray-200 rounded-full px-2 py-1">
                        Проходжень: <strong>${stats.completions}</strong>
                    </span>
                    <span class="inline-block bg-gray-200 rounded-full px-2 py-1 ml-2">
                        Середній бал: <strong>${stats.avgScore.toFixed(1)}%</strong>
                    </span>
                </div>
            </div>
            
            <div class="flex flex-wrap gap-2">
                ${actionButtons}
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
    onSnapshot(testCollectionRef, (snapshot) => {
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
            elements.testListContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка завантаження тестів: ${error.message}</div>`;
        }
    });
}

/**
 * Renders the list of all tests.
 */
function renderAllTests() {
    if (!elements.testListContainer) return;

    if (allTests.length === 0) {
        elements.testListContainer.innerHTML = `
            <div class="text-center p-8 bg-white rounded-xl shadow text-gray-500">
                Тестів не знайдено. Будь ласка, створіть новий тест.
            </div>
        `;
    } else {
        elements.testListContainer.innerHTML = allTests.map(test => {
            return generateTestItemHtml(test, test.stats);
        }).join('');
        
        if (window.userRole === 'admin') {
            document.getElementById('admin-controls')?.classList.remove('hidden');
            document.getElementById('admin-panel-link')?.classList.remove('hidden');
        }
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
            if (confirm(`Ви впевнені, що хочете видалити тест "${testTitle}"?`)) {
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
            alert('Помилка: Тест для завантаження не знайдено.');
        }
    } catch (error) {
        console.error("Error downloading test for JSON export:", error);
        alert(`Помилка завантаження тесту: ${error.message}`);
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
            renderQuestion(currentQuestionIndex);
            startTimer();
        } else {
            console.error("Test document not found:", testId);
            if (elements.questionsContainer) {
                elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка: Тест з ID ${testId} не знайдено.</div>`;
            }
        }
    } catch (error) {
        console.error("Error loading test from Firestore:", error);
        if (elements.questionsContainer) {
            elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка завантаження тесту: ${error.message}</div>`;
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

    // Створюємо плоский масив питань
    flatQuestions = [];
    test.parts.forEach(part => {
        part.questions.forEach(q => {
            flatQuestions.push({
                ...q,
                part_id: part.part_id, // Додаємо ID частини для контексту
                instruction: part.instruction, // Додаємо інструкцію для контексту
                media: part.media || {}, // Зберігаємо весь об'єкт media
            });
        });
    });
    
    // Ініціалізуємо відповіді
    userAnswers = flatQuestions.reduce((acc, q) => {
        acc[q.id] = null; // null - відповідь не дана
        return acc;
    }, {});

    // Встановлюємо тривалість
    timeLeftSeconds = test.duration_minutes * 60;
}


// Функція для переходу до наступного питання
function nextQuestion() {
    if (currentQuestionIndex < flatQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion(currentQuestionIndex);
    }
}

// Функція для переходу до попереднього питання
function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion(currentQuestionIndex);
    }
}

/**
 * Генерує HTML для поточного питання
 */
function renderQuestion(index) {
    if (!flatQuestions[index]) return;

    const question = flatQuestions[index];
    const totalQuestions = flatQuestions.length;
    
    // --- Відображення стимулу (тексту для читання/слухання) ---
    if (elements.stimulusText) {
        let mediaHtml = '';

        // Рендеримо аудіо
        if (question.media.audios && question.media.audios.length > 0) {
            mediaHtml += question.media.audios.map(audio => `
                <div class="my-4">
                    <audio controls class="w-full">
                        <source src="${audio.url}" type="audio/mpeg">
                        Ваш браузер не підтримує аудіо елемент.
                    </audio>
                </div>
            `).join('');
        }

        // Рендеримо зображення
        if (question.media.images && question.media.images.length > 0) {
            mediaHtml += question.media.images.map(image => `
                <div class="my-4">
                    <img src="${image.url}" alt="Зображення до завдання" class="max-w-full h-auto rounded-lg shadow-md mx-auto">
                </div>
            `).join('');
        }

        elements.stimulusText.innerHTML = `
            <div class="text-sm font-semibold text-gray-600 mb-2">Інструкція до частини (${question.part_id}):</div>
            <p class="mb-4 text-blue-800 italic">${question.instruction}</p>
            ${mediaHtml}
            ${(question.media.texts || []).map(text => `<div class="border-l-4 border-gray-200 pl-4 bg-gray-50 p-3 rounded-lg text-gray-700 whitespace-pre-wrap mt-4">${text.content}</div>`).join('')}
        `;
    }

    // --- Відображення питання ---
    const currentAnswer = userAnswers[question.id];
    let questionHtml = `
        <div id="q-${question.id}" class="bg-white p-6 rounded-xl shadow-lg transition duration-200">
            <p class="text-lg font-bold text-gray-800 mb-4">
                Запитання ${index + 1} з ${totalQuestions}:
                <span class="font-normal text-blue-600">${question.text}</span>
            </p>
            <div class="space-y-3">
    `;

    question.options.forEach((option, optionIndex) => {
        const isSelected = currentAnswer === optionIndex;
        const optionId = `q-${question.id}-o-${optionIndex}`;
        
        questionHtml += `
            <div class="flex items-center p-4 rounded-lg border-2 cursor-pointer transition duration-150 ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:bg-gray-50'}"
                 onclick="handleAnswer('${question.id}', ${optionIndex})">
                <input type="radio" id="${optionId}" name="q-${question.id}" value="${optionIndex}" class="hidden" ${isSelected ? 'checked' : ''}>
                <label for="${optionId}" class="ml-3 text-gray-700 flex-grow cursor-pointer">
                    <span class="font-semibold text-blue-800 mr-2">${String.fromCharCode(65 + optionIndex)}.</span> 
                    ${option}
                </label>
            </div>
        `;
    });
    
    questionHtml += `
            </div>
        </div>
    `;

    if (elements.questionsContainer) {
        elements.questionsContainer.innerHTML = questionHtml;
    }
    
    // --- Оновлення навігації та прогресу ---
    if (elements.prevBtn) elements.prevBtn.disabled = index === 0;
    if (elements.nextBtn) elements.nextBtn.disabled = index === totalQuestions - 1;
    if (elements.finishBtn) elements.finishBtn.textContent = index === totalQuestions - 1 ? 'Завершити Тест' : 'Перейти до завершення';
    
    updateProgressBar(index, totalQuestions);
}

// Обробник відповіді на питання
window.handleAnswer = function(questionId, selectedIndex) {
    userAnswers[questionId] = selectedIndex;
    renderQuestion(currentQuestionIndex); // Перемальовуємо, щоб оновити вибір
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
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        timeLeftSeconds--;
        if (elements.timerDisplay) {
            elements.timerDisplay.textContent = formatTime(timeLeftSeconds);
        }

        if (timeLeftSeconds <= 0) {
            clearInterval(timerInterval);
            finishTest(true); // Автоматичне завершення
        }
    }, 1000);
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
    if (timerInterval) clearInterval(timerInterval);
    
    const timeSpent = currentTest.duration_minutes * 60 - timeLeftSeconds;
    let correctCount = 0;
    
    const detailedResults = flatQuestions.map(q => {
        const userAnswerIndex = userAnswers[q.id];
        const isCorrect = userAnswerIndex === q.correct_answer_index;
        
        if (isCorrect) {
            correctCount++;
        }
        
        return {
            questionId: q.id,
            userAnswerIndex: userAnswerIndex,
            isCorrect: isCorrect
        };
    });

    const resultData = {
        testId: currentTest.test_id,
        testTitle: currentTest.title,
        timestamp: new Date().toISOString(),
        correctPoints: correctCount,
        totalQuestions: flatQuestions.length,
        timeSpentSeconds: timeSpent,
        isTimedOut: isTimedOut,
        passingScore: currentTest.passing_score_points,
        // Зберігаємо детальні результати для перегляду
        detailedResults: detailedResults,
        // Зберігаємо сам тест, щоб мати можливість переглянути його пізніше (запобігає проблемам, якщо тест буде змінено)
        testSnapshot: currentTest 
    };

    try {
        if (!window.db || !window.userId) throw new Error("Firebase або User ID недоступні.");

        // 1. Зберігаємо детальний результат для користувача
        const resultsCollectionRef = collection(window.db, `artifacts/${appId}/users/${window.userId}/results`);
        const newResultRef = await addDoc(resultsCollectionRef, resultData);

        // 2. Зберігаємо анонімний результат для загальної статистики
        const publicResultsRef = collection(window.db, `artifacts/${appId}/public/data/public_results`);
        await addDoc(publicResultsRef, {
            testId: resultData.testId,
            correctPoints: resultData.correctPoints,
            totalQuestions: resultData.totalQuestions,
            timestamp: resultData.timestamp,
        });


        // 3. Переходимо на сторінку результатів
        localStorage.setItem('b2_last_result_id', newResultRef.id);
        localStorage.setItem('b2_test_to_load', currentTest.test_id); // Зберігаємо ID тесту для `results.js`
        
        window.location.href = 'results-page.html';

    } catch (error) {
        console.error("Помилка збереження результатів у Firestore:", error);
        alert(`Помилка збереження результатів. Вони не будуть збережені: ${error.message}`);
        // Все одно переходимо на сторінку результатів, використовуючи локальне сховище
        localStorage.setItem('b2_last_result_data', JSON.stringify(resultData));
        window.location.href = 'results-page.html';
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

        // Обробник для кнопки "Створити Свій Тест" (не видаляємо localStorage, оскільки використовуємо URL-параметри для редагування)
        if (elements.createNewTestBtn) {
            elements.createNewTestBtn.addEventListener('click', (e) => {
                 // Тут можна додати логіку для очищення, але простіше покладатися на відсутність edit=ID в URL
            });
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
                 elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Не знайдено тест для запуску. Поверніться на головну сторінку.</div>`;
            }
        }
        
        // Прикріплюємо обробники подій
        if (elements.nextBtn) elements.nextBtn.addEventListener('click', nextQuestion);
        if (elements.prevBtn) elements.prevBtn.addEventListener('click', prevQuestion);
        if (elements.finishBtn) elements.finishBtn.addEventListener('click', () => finishTest(false));

        // Додаємо попередження при спробі покинути сторінку
        window.addEventListener('beforeunload', (e) => {
            if (currentTest && !currentTest.isFinished) {
                e.preventDefault();
                e.returnValue = ''; // Для сумісності з різними браузерами
                return '';
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
                alertBox('error', 'Недійсний формат JSON: відсутні test_id або title.');
                return;
            }

            if (!window.db || !window.userId) {
                alertBox('error', 'Firebase не готовий. Неможливо зберегти тест.');
                return;
            }

            // Додаємо userId до тесту
            const testToSave = { ...json, userId: window.userId };

            // Зберігаємо тест у Firestore
            const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testToSave.test_id);
            await setDoc(docRef, testToSave);

            alertBox('success', `Тест "${testToSave.title}" успішно завантажено у Firebase!`);
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