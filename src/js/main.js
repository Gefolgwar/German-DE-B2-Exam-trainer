// Глобальний стан додатку
let currentTest = null;
let userAnswers = {}; // { questionId: selectedIndex }
let currentQuestionIndex = 0;
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
    startTestLink: document.getElementById('start-test-link'),
};

// --- Функції Управління Часом (Ф3) ---

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startTimer(durationSeconds) {
    if (timerInterval) clearInterval(timerInterval);
    
    timeLeftSeconds = durationSeconds;
    elements.timerDisplay.textContent = formatTime(timeLeftSeconds);

    timerInterval = setInterval(() => {
        timeLeftSeconds--;
        elements.timerDisplay.textContent = formatTime(timeLeftSeconds);

        if (timeLeftSeconds <= 0) {
            clearInterval(timerInterval);
            finishTest(true); 
        }
    }, 1000);
}

// --- Логіка UI для test-page.html ---

function renderQuestion() {
    if (!currentTest || currentQuestionIndex < 0 || currentQuestionIndex >= currentTest.questions.length) {
        return;
    }

    const question = currentTest.questions[currentQuestionIndex];
    
    // 1. Оновлення Стимулу
    if (question.stimulus) {
        elements.stimulusText.textContent = question.stimulus;
        elements.stimulusContainer.classList.remove('hidden');
    } else {
        elements.stimulusContainer.classList.add('hidden');
    }

    // 2. Генерація HTML для медіа-контенту
    let mediaHtml = ''; 
    
    // Додавання зображення (використовує URL)
    if (question.image_url) {
        mediaHtml += `
            <div class="mb-4 text-center">
                <img src="${question.image_url}" alt="Зображення до питання ${currentQuestionIndex + 1}" class="max-w-full h-auto mx-auto rounded-lg shadow-md">
            </div>
        `;
    }
    
    // Додавання аудіо (використовує URL)
    if (question.audio_url) {
        mediaHtml += `
            <div class="mb-4 text-center">
                <audio controls class="w-full max-w-sm mx-auto">
                    <source src="${question.audio_url}" type="audio/mpeg">
                    Ваш браузер не підтримує аудіо елемент.
                </audio>
            </div>
        `;
    }
    
    // 3. Створення HTML питання
    const questionHtml = `
        <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-600">
            <h3 class="text-xl font-semibold text-gray-900 mb-4">
                Питання ${currentQuestionIndex + 1} з ${currentTest.questions.length}:
                <span class="text-blue-700">${question.text}</span>
            </h3>
            
            ${mediaHtml} 
            
            <div id="options-list" class="space-y-3">
                ${question.options.map((option, index) => {
                    const isChecked = userAnswers[question.id] === index;
                    const optionId = `q-${question.id}-option-${index}`;
                    
                    return `
                        <label for="${optionId}" class="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-blue-50 transition duration-150">
                            <input 
                                type="radio" 
                                id="${optionId}" 
                                name="question-${question.id}" 
                                value="${index}" 
                                class="w-5 h-5 text-blue-600 focus:ring-blue-500"
                                ${isChecked ? 'checked' : ''}
                                onclick="handleAnswerChange(${question.id}, ${index})"
                            >
                            <span class="ml-3 text-gray-800">${String.fromCharCode(65 + index)}. ${option}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    elements.questionsContainer.innerHTML = questionHtml;

    // 4. Оновлення Навігації та Прогресу
    updateNavigation();
}

function updateNavigation() {
    const total = currentTest.questions.length;
    const current = currentQuestionIndex;

    // Кнопки
    elements.prevBtn.disabled = current === 0;
    elements.nextBtn.disabled = current === total - 1;
    
    // Прогрес
    elements.progressIndicator.textContent = `${current + 1}/${total}`;
    
    // Кнопка Завершення 
    if (current === total - 1) {
        elements.finishBtn.textContent = 'Завершити Тест';
        elements.finishBtn.classList.add('bg-green-600');
        elements.finishBtn.classList.remove('bg-gray-400');
    } else {
        elements.finishBtn.textContent = 'Завершити (достроково)';
        elements.finishBtn.classList.remove('bg-green-600');
        elements.finishBtn.classList.add('bg-gray-400');
    }
}

// --- Обробники Подій ---

window.handleAnswerChange = function(questionId, selectedIndex) {
    userAnswers[questionId] = selectedIndex;
}

function nextQuestion() {
    if (currentQuestionIndex < currentTest.questions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function finishTest(isAutoFinish = false) {
    if (timerInterval) clearInterval(timerInterval);
    
    if (!isAutoFinish && !confirm('Ви впевнені, що хочете завершити тест?')) {
        startTimer(timeLeftSeconds); 
        return;
    }

    const timeSpent = currentTest.duration_minutes * 60 - timeLeftSeconds;

    const resultsData = {
        testId: currentTest.test_id,
        title: currentTest.title,
        questions: currentTest.questions,
        answers: userAnswers,
        timeSpent: timeSpent,
        totalDuration: currentTest.duration_minutes * 60,
        passingScore: currentTest.passing_score_points
    };

    try {
        localStorage.setItem('b2_test_results', JSON.stringify(resultsData));
        window.location.href = 'results-page.html';
    } catch (error) {
        console.error("Помилка збереження результатів:", error);
        alert("Помилка: Не вдалося зберегти результати тесту.");
    }
}

// --- Завантаження Тесту (test-page.html) ---

async function loadTest(testPathOrId) {
    let testData = null;
    
    if (testPathOrId.startsWith('test-')) {
        try {
            const customTests = JSON.parse(localStorage.getItem('b2_custom_tests')) || [];
            testData = customTests.find(t => t.test_id === testPathOrId);
        } catch (e) {
            console.error('Помилка читання custom_tests:', e);
        }
    } 
    
    if (!testData) {
        try {
            const response = await fetch(testPathOrId);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            testData = await response.json();
        } catch (error) {
            console.error("Помилка завантаження тесту:", error);
            elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка завантаження тестових даних. Перевірте файл або ID тесту.</div>`;
            return;
        }
    }
    
    if (!testData) {
        elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка: Тест не знайдено. Поверніться на головну.</div>`;
        return;
    }

    currentTest = testData;
    
    elements.testTitle.textContent = currentTest.title;
    elements.currentTestTitle.textContent = currentTest.title;
    
    userAnswers = {};
    currentQuestionIndex = 0;
    
    startTimer(currentTest.duration_minutes * 60);

    renderQuestion();
}


// НОВА ФУНКЦІЯ: Видалення тесту
window.deleteTest = function(testId, testTitle) {
    if (!confirm(`Ви впевнені, що хочете видалити тест "${testTitle}"? Цю дію не можна скасувати.`)) {
        return;
    }

    try {
        let existingTests = JSON.parse(localStorage.getItem('b2_custom_tests')) || [];
        
        // Фільтруємо масив, залишаючи всі тести, крім того, який потрібно видалити
        const updatedTests = existingTests.filter(t => t.test_id !== testId);

        // Зберігаємо оновлений масив
        localStorage.setItem('b2_custom_tests', JSON.stringify(updatedTests));

        // Перезавантажуємо список UI
        loadTestList(); 

        alert(`Тест "${testTitle}" успішно видалено.`);

    } catch (e) {
        console.error('Помилка видалення тесту:', e);
        alert('Помилка: Не вдалося видалити тест.');
    }
}

// --- Логіка index.html: Відображення списку тестів (ОНОВЛЕНО) ---

async function loadTestList() {
    if (!elements.testListContainer) return;

    let availableTests = [];
    const standardTestPath = 'b2-test-1.json';
    
    // 1. Стандартний тест (з файлу)
    try {
        const response = await fetch(standardTestPath);
        if (response.ok) {
            const standardTest = await response.json();
            availableTests.push({ ...standardTest, isCustom: false, path: standardTestPath }); 
        }
    } catch (e) {
        console.warn("Не вдалося завантажити стандартний тест b2-test-1.json", e);
    }
    
    // 2. Користувацькі тести (з localStorage)
    try {
        const customTests = JSON.parse(localStorage.getItem('b2_custom_tests')) || [];
        customTests.forEach(t => availableTests.push({ ...t, isCustom: true, path: t.test_id }));
    } catch (e) {
        console.error('Помилка читання custom_tests:', e);
    }
    
    if (availableTests.length === 0) {
        elements.testListContainer.innerHTML = `
            <div class="p-10 text-center text-gray-500 bg-white rounded-lg shadow-inner">
                Наразі немає доступних тестів. Будь ласка, створіть власний!
            </div>
        `;
        return;
    }

    // Рендеринг списку тестів
    elements.testListContainer.innerHTML = availableTests.map(test => `
        <div class="test-card flex items-center justify-between p-5 bg-white rounded-xl shadow-lg border-l-4 ${test.isCustom ? 'border-purple-500' : 'border-blue-500'} hover:shadow-xl transition duration-300">
            <div>
                <h4 class="text-xl font-bold text-gray-800">
                    ${test.title} 
                    ${test.isCustom ? '<span class="ml-2 text-sm bg-purple-100 text-purple-700 py-1 px-3 rounded-full font-semibold">Власний</span>' : ''}
                </h4>
                <p class="text-gray-600 mt-1">
                    ${test.questions.length} питань | ${test.duration_minutes} хв | Прохідний бал: ${test.passing_score_points}
                </p>
            </div>
            <div class="flex space-x-3">
                ${test.isCustom ? `
                    <button 
                        type="button"
                        data-test-id="${test.test_id}" 
                        data-test-title="${test.title}"
                        class="delete-test-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-full transition duration-300 transform hover:scale-105"
                    >
                        🗑️ Видалити
                    </button>
                    <a 
                        href="#" 
                        data-test-id="${test.test_id}" 
                        class="edit-test-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-full transition duration-300 transform hover:scale-105"
                    >
                        📝 Редагувати
                    </a>
                ` : ''}
                <a 
                    href="#" 
                    data-test-path="${test.path}" 
                    class="start-test-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-full transition duration-300 transform hover:scale-105"
                >
                    Почати Тест
                </a>
            </div>
        </div>
    `).join('');
    
    // Додавання обробників подій до кнопок
    elements.testListContainer.querySelectorAll('.start-test-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const testPath = e.currentTarget.dataset.testPath;
            localStorage.setItem('b2_test_to_load', testPath);
            window.location.href = 'test-page.html';
        });
    });

    // Обробник для Редагування
    elements.testListContainer.querySelectorAll('.edit-test-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const testId = e.currentTarget.dataset.testId;
            localStorage.setItem('b2_test_to_edit', testId); 
            window.location.href = 'upload-test.html'; 
        });
    });

    // НОВИЙ Обробник для Видалення
    elements.testListContainer.querySelectorAll('.delete-test-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const testId = e.currentTarget.dataset.testId;
            const testTitle = e.currentTarget.dataset.testTitle;
            // Викликаємо нову глобальну функцію
            deleteTest(testId, testTitle); 
        });
    });
}


// --- Головна Функція (Entry Point) ---

function init() {
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('test-page.html')) {
        const testPathOrId = localStorage.getItem('b2_test_to_load');
        if (testPathOrId) {
            loadTest(testPathOrId);
        } else {
            elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Не знайдено тест для запуску. Поверніться на головну сторінку.</div>`;
            if (elements.timerDisplay) elements.timerDisplay.textContent = '00:00';
            if (elements.progressIndicator) elements.progressIndicator.textContent = '0/0';
        }
        
        if (elements.nextBtn) elements.nextBtn.addEventListener('click', nextQuestion);
        if (elements.prevBtn) elements.prevBtn.addEventListener('click', prevQuestion);
        if (elements.finishBtn) elements.finishBtn.addEventListener('click', finishTest);

    } else if (currentPath.includes('index.html') || currentPath === '/') {
        loadTestList();
    }
}

document.addEventListener('DOMContentLoaded', init);