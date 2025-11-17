// Глобальний стан додатку (для test-page.html)
let currentTest = null;
let userAnswers = {}; // { questionId: selectedIndex }
let currentQuestionIndex = 0; // Індекс питання, яке зараз відображається
let flatQuestions = []; // Оптимізація: плоский масив питань
let timerInterval = null;
let timeLeftSeconds = 0;
const testDurationPlaceholder = 1500; 

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
    createNewTestBtn: document.getElementById('create-new-test-btn'), // Додаємо кнопку створення
};

// =========================================================================
// === ДОПОМІЖНІ ФУНКЦІЇ ===
// =========================================================================

/**
 * Ініціює завантаження JSON-файлу (створює файл у браузері).
 */
function downloadTestFile(testData) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(testData, null, 4));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const fileName = `${testData.title.toLowerCase().replace(/\s+/g, '-')}-test.json`; 
    downloadAnchorNode.setAttribute("download", fileName);
    
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Завантажує список тестів з localStorage.
 */
function getCustomTests() {
    const testsJson = localStorage.getItem('b2_custom_tests');
    return testsJson ? JSON.parse(testsJson) : [];
}

/**
 * Зберігає оновлений список тестів у localStorage.
 */
function saveCustomTests(tests) {
    localStorage.setItem('b2_custom_tests', JSON.stringify(tests));
    renderTestList(); 
}

// --- Функції Управління Часом (ДЛЯ test-page.html) ---

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    // Встановлюємо початковий час
    timeLeftSeconds = currentTest.duration_minutes * 60;
    if (elements.timerDisplay) elements.timerDisplay.textContent = formatTime(timeLeftSeconds);

    const startTime = Date.now();
    const durationMs = timeLeftSeconds * 1000;

    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = durationMs - elapsedTime;
        timeLeftSeconds = Math.max(0, Math.floor(remainingTime / 1000));
        
        if (elements.timerDisplay) {
            elements.timerDisplay.textContent = formatTime(timeLeftSeconds);
            
            // Візуальна індикація низького часу
            if (timeLeftSeconds <= 60 && elements.timerDisplay.classList.contains('text-gray-800')) {
                 elements.timerDisplay.classList.remove('text-gray-800', 'text-blue-600');
                 elements.timerDisplay.classList.add('text-red-600');
            }
        }

        if (timeLeftSeconds <= 0) {
            clearInterval(timerInterval);
            alert('Час вийшов! Тест буде завершено.');
            finishTest(true); 
        }
    }, 1000);
}

// =========================================================================
// === ФУНКЦІОНАЛ ДЛЯ index.html (УПРАВЛІННЯ ТЕСТАМИ) ===
// =========================================================================

/**
 * Генерує HTML-картку для одного тесту.
 */
function createTestCardHtml(test) {
    // Фікс помилки з reduce (додана перевірка test.parts || [])
    const totalQuestions = test.questions_total || 
        (test.parts || []).reduce((sum, part) => sum + (part.questions ? part.questions.length : 0), 0);

    return `
        <div class="test-card bg-white p-5 rounded-xl shadow-md border-l-4 border-blue-500 flex justify-between items-center flex-wrap gap-4">
            <div>
                <h4 class="text-xl font-bold text-gray-800">${test.title}</h4>
                <p class="text-sm text-gray-500 mt-1">
                    Питань: ${totalQuestions} | Хв: ${test.duration_minutes} | Прохідний бал: ${test.passing_score_points}
                </p>
                <p class="text-xs text-gray-400 mt-1">ID: ${test.test_id}</p>
            </div>
            
            <div class="flex flex-wrap gap-2">
                <button 
                    class="btn-run bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
                    data-test-id="${test.test_id}"
                >
                    ▶️ Запустити
                </button>
                <button 
                    class="btn-edit bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
                    data-test-id="${test.test_id}"
                >
                    ✏️ Редагувати
                </button>
                <button 
                    class="btn-download bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
                    data-test-id="${test.test_id}"
                >
                    ⬇️ JSON
                </button>
                <button 
                    class="btn-delete bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition"
                    data-test-id="${test.test_id}"
                    data-test-title="${test.title}"
                >
                    🗑️ Видалити
                </button>
            </div>
        </div>
    `;
}

/**
 * Відображає список тестів на головній сторінці.
 */
function renderTestList() {
    if (!elements.testListContainer) return;

    const tests = getCustomTests();
    
    if (tests.length === 0) {
        elements.testListContainer.innerHTML = `
            <div class="text-center p-8 bg-white rounded-xl shadow text-gray-600">
                <p class="text-lg font-semibold mb-2">У вас ще немає створених тестів.</p>
                <p>Скористайтеся кнопкою '➕ Створити Новий Тест' або '⬆️ Завантажити JSON'.</p>
            </div>
        `;
        return;
    }

    const html = tests.map(createTestCardHtml).join('');
    elements.testListContainer.innerHTML = html;

    attachTestActionListeners();
}


/**
 * Прикріплює обробники подій до кнопок.
 */
function attachTestActionListeners() {
    // 1. Запуск тесту
    document.querySelectorAll('.btn-run').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            localStorage.setItem('b2_test_to_load', testId);
            window.location.href = 'test-page.html';
        });
    });

    // 2. Редагування тесту
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            localStorage.setItem('b2_test_to_edit', testId);
            window.location.href = 'upload-test.html';
        });
    });
    
    // 3. Завантаження JSON (ЕКСПОРТ)
    document.querySelectorAll('.btn-download').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            const tests = getCustomTests();
            const testToDownload = tests.find(t => t.test_id === testId);
            
            if (testToDownload) {
                downloadTestFile(testToDownload);
                alert(`Файл "${testToDownload.title}" завантажується.`);
            } else {
                alert('Помилка: Тест для завантаження не знайдено.');
            }
        });
    });

    // 4. Видалення тесту
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const testId = e.currentTarget.dataset.testId;
            const testTitle = e.currentTarget.dataset.testTitle;
            if (confirm(`Ви впевнені, що хочете видалити тест "${testTitle}"?`)) {
                deleteTest(testId);
            }
        });
    });
}

/**
 * Видаляє тест із localStorage.
 */
function deleteTest(testId) {
    let tests = getCustomTests();
    const initialLength = tests.length;
    
    tests = tests.filter(test => test.test_id !== testId);

    if (tests.length < initialLength) {
        saveCustomTests(tests);
        alert('Тест успішно видалено!');
    } else {
        alert('Помилка: Тест не знайдено.');
    }
}


// =========================================================================
// === МЕХАНІЗМ ЗАВАНТАЖЕННЯ JSON-ФАЙЛІВ У LOCALSTORAGE ===
// =========================================================================

function handleJsonUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        alert('Будь ласка, завантажте файл у форматі JSON.');
        event.target.value = ''; 
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const testData = JSON.parse(e.target.result);
            
            if (!testData.test_id || !testData.title || !testData.parts) {
                 throw new Error("Неправильна структура файлу JSON.");
            }
            
            let tests = getCustomTests();
            const existingIndex = tests.findIndex(t => t.test_id === testData.test_id);
            
            if (existingIndex !== -1) {
                if (!confirm(`Тест "${testData.title}" з ID ${testData.test_id} вже існує. Замінити його?`)) {
                    event.target.value = ''; 
                    return;
                }
                tests[existingIndex] = testData; 
            } else {
                tests.unshift(testData); 
            }

            saveCustomTests(tests);
            alert(`Тест "${testData.title}" успішно завантажено та збережено!`);
            
        } catch (error) {
            console.error("Помилка обробки JSON:", error);
            alert(`Помилка завантаження файлу: ${error.message || 'Некоректний формат JSON.'}`);
        }
        event.target.value = ''; 
    };

    reader.readAsText(file);
}

// =========================================================================
// === ФУНКЦІОНАЛ ДЛЯ test-page.html (ЗАПУСК ТЕСТУ) ===
// =========================================================================

/**
 * Оновлює індикацію прогресу та навігаційні кнопки.
 */
function updateProgress() {
    if (!currentTest) return;

    const totalQuestions = currentTest.questions_total;
    const currentNumber = currentQuestionIndex + 1;
    
    // Оновлення індикатора прогресу
    if (elements.progressIndicator) {
        elements.progressIndicator.textContent = `${currentNumber}/${totalQuestions}`;
    }

    // Оновлення кнопок навігації
    if (elements.prevBtn) {
        elements.prevBtn.disabled = currentQuestionIndex === 0;
    }
    if (elements.nextBtn) {
        elements.nextBtn.disabled = currentQuestionIndex >= totalQuestions - 1;
    }

    // Маркуємо питання, на яке вже дана відповідь
    if (elements.questionsContainer) {
        const questionElement = elements.questionsContainer.querySelector('.question-card');
        if (questionElement) {
            questionElement.classList.toggle('border-l-green-500', userAnswers[currentQuestionIndex] !== undefined);
            questionElement.classList.toggle('border-l-blue-500', userAnswers[currentQuestionIndex] === undefined);
        }
    }
}

/**
 * Генерує HTML для відображення медіа (аудіо/зображення/текст)
 */
function getMediaHtml(media) {
    if (!media) return '';
    let html = '';

    // Відображення аудіо
    if (media.audio && media.audio.length > 0) {
        html += media.audio.map(a => `<audio controls class="w-full my-3"><source src="${a.url}" type="audio/mp3">Ваш браузер не підтримує аудіо елемент.</audio>`).join('');
    }
    
    // Відображення зображень (якщо це частина Reading/Listening)
    if (media.images && media.images.length > 0) {
         html += media.images.map(img => `<img src="${img.url}" alt="Зображення для частини тесту" class="w-full h-auto rounded-lg my-3 object-cover">`).join('');
    }

    // Відображення тексту
    if (media.texts && media.texts.length > 0) {
        html += media.texts.map(t => `<div class="p-4 bg-gray-100 rounded-lg text-sm whitespace-pre-wrap">${t.content}</div>`).join('');
    }

    return html;
}


/**
 * Знаходить питання по глобальному індексу.
 */
function getQuestionByGlobalIndex(index) { 
    if (index >= 0 && index < flatQuestions.length) {
        return flatQuestions[index];
    }
    return null; 
} 

/**
 * Відображає поточне питання на сторінці.
 */
function renderQuestion() {
    if (!currentTest || !elements.questionsContainer) return;

    const flatQuestionData = getQuestionByGlobalIndex(currentQuestionIndex);
    if (!flatQuestionData) {
        elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка: Не знайдено даних для питання ${currentQuestionIndex + 1}.</div>`;
        return;
    }
    
    const { question, part } = flatQuestionData;
    const qId = currentQuestionIndex;


    // 2. Генеруємо питання та варіанти
    let optionsHtml = question.options.map((optionText, index) => {
        const isSelected = userAnswers[qId] === index;
        return `
            <div class="option-item flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition duration-150 
                 ${isSelected ? 'bg-blue-100 border-blue-500' : 'bg-white hover:bg-gray-50'}"
                 data-option-index="${index}" data-q-id="${qId}" onclick="selectAnswer(${qId}, ${index}, this)">
                <input type="radio" name="answer-${qId}" id="q${qId}-opt${index}" value="${index}" class="form-radio h-5 w-5 text-blue-600 pointer-events-none" ${isSelected ? 'checked' : ''}>
                <label for="q${qId}-opt${index}" class="text-gray-800 flex-grow">${String.fromCharCode(65 + index)}. ${optionText}</label>
            </div>
        `;
    }).join('');

    // Додатковий стимул (якщо є)
    const questionStimulus = question.stimulus ? `<p class="p-3 bg-yellow-50 rounded-lg mb-4 text-gray-700 font-medium">${question.stimulus}</p>` : '';

    const questionHtml = `
        <div class="question-card bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500 transition duration-300">
            <h3 class="text-xl font-bold mb-4 text-gray-800">Питання ${qId + 1} / ${currentTest.questions_total}</h3>
            ${questionStimulus}
            <p class="text-gray-800 mb-6 font-medium">${question.text}</p>
            
            <div class="options-container space-y-3">
                ${optionsHtml}
            </div>
        </div>
    `;

    // 1. Оновлення заголовків/інструкцій та медіа
    const partMediaHtml = getMediaHtml(part.media);
    const instructionHtml = `<p class="text-lg font-semibold text-gray-700">${part.instruction}</p>`;

    // Збираємо весь контент частини в правильному порядку
    if (elements.stimulusContainer) {
        elements.stimulusContainer.innerHTML = instructionHtml + partMediaHtml;
    }
    if (elements.questionsContainer) {
        elements.questionsContainer.innerHTML = questionHtml;
    }
    if (elements.currentTestTitle) {
        elements.currentTestTitle.textContent = currentTest.title;
    }

    updateProgress();
}

/**
 * Зберігає вибрану відповідь користувача.
 */
window.selectAnswer = function(qId, selectedIndex, element) {
    userAnswers[qId] = selectedIndex;

    // Оновлення UI
    element.closest('.options-container').querySelectorAll('.option-item').forEach(item => {
        item.classList.remove('bg-blue-100', 'border-blue-500');
        item.classList.add('bg-white', 'hover:bg-gray-50');
        item.querySelector('input[type="radio"]').checked = false;
    });

    element.classList.add('bg-blue-100', 'border-blue-500');
    element.querySelector('input[type="radio"]').checked = true;

    updateProgress();
}

/**
 * Перехід до наступного питання.
 */
function nextQuestion() {
    if (currentQuestionIndex < currentTest.questions_total - 1) {
        currentQuestionIndex++;
        renderQuestion();
        window.scrollTo(0, 0); // Прокручуємо до верху сторінки
    }
}

/**
 * Перехід до попереднього питання.
 */
function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
        window.scrollTo(0, 0);
    }
}

/**
 * Завершує тест та перенаправляє на сторінку результатів.
 */
function finishTest(timeExpired = false) {
    if (!confirm(timeExpired ? "Час вийшов. Завершити тест?" : "Ви впевнені, що хочете завершити тест?")) {
        return;
    }

    clearInterval(timerInterval);
    
    // Зберігаємо результати у localStorage для results-page.html
    const results = {
        testId: currentTest.test_id,
        testTitle: currentTest.title,
        duration: currentTest.duration_minutes,
        passingScore: currentTest.passing_score_points,
        questionsTotal: currentTest.questions_total,
        timeSpent: (currentTest.duration_minutes * 60) - timeLeftSeconds,
        userAnswers: userAnswers,
        testData: currentTest
    };

    localStorage.setItem('b2_test_results', JSON.stringify(results));
    window.location.href = 'results-page.html';
}


/**
 * Головна функція для завантаження та ініціалізації тесту.
 */
function loadTest(testId) {
    const tests = getCustomTests();
    const testToLoad = tests.find(t => t.test_id === testId);

    if (testToLoad) {
        currentTest = testToLoad;
        currentQuestionIndex = 0;
        userAnswers = {}; // Скидаємо відповіді

        // Оптимізація: створюємо плоский список питань для швидкого доступу
        flatQuestions = [];
        currentTest.parts.forEach(part => {
            if (part.questions) {
                part.questions.forEach(question => {
                    flatQuestions.push({ question, part });
                });
            }
        });
        
        // Встановлюємо заголовок сторінки
        if (elements.testTitle) elements.testTitle.textContent = `B2 Test: ${testToLoad.title}`;
        
        // Ініціалізуємо відображення
        renderQuestion();
        startTimer();

    } else {
        // Якщо тест не знайдено
        if (elements.questionsContainer) {
            elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка: Тест з ID ${testId} не знайдено у сховищі. Поверніться на головну сторінку.</div>`;
        }
    }
}


// --- Головна Функція Ініціалізації (Entry Point) ---

function init() {
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('index.html') || currentPath === '/') {
        // Логіка для головної сторінки
        renderTestList();
        if(elements.uploadJsonFile) {
            elements.uploadJsonFile.addEventListener('change', handleJsonUpload);
        }

        // Очищуємо localStorage перед створенням нового тесту
        if (elements.createNewTestBtn) {
            elements.createNewTestBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Зупиняємо стандартний перехід за посиланням
                localStorage.removeItem('b2_test_to_edit');
                window.location.href = e.currentTarget.href; // Переходимо на сторінку створення
            });
        }
        
    } else if (currentPath.includes('test-page.html')) {
        // Логіка для сторінки тесту
        const testId = localStorage.getItem('b2_test_to_load');
        if (testId) {
            loadTest(testId);
        } else {
            if (elements.questionsContainer) {
                 elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Не знайдено тест для запуску. Поверніться на головну сторінку.</div>`;
            }
        }
        
        // Прикріплюємо обробники подій
        if (elements.nextBtn) elements.nextBtn.addEventListener('click', nextQuestion);
        if (elements.prevBtn) elements.prevBtn.addEventListener('click', prevQuestion);
        if (elements.finishBtn) elements.finishBtn.addEventListener('click', () => finishTest(false));
    }
}

document.addEventListener('DOMContentLoaded', init);

// Обробник для bfcache (коли користувач повертається на сторінку кнопкою "назад")
window.addEventListener('pageshow', function(event) {
    // event.persisted буде true, якщо сторінка завантажена з bfcache
    if (event.persisted) {
        window.location.reload();
    }
});