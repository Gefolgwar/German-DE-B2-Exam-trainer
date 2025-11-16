// Глобальний стан додатку
let currentTest = null;
let userAnswers = {}; // { questionId: selectedIndex }
let currentQuestionIndex = 0;
let timerInterval = null;
let timeLeftSeconds = 0;
const testDurationPlaceholder = 1500; // 25 хвилин * 60 = 1500 секунд

// --- DOM Елементи ---
const elements = {
    testTitle: document.getElementById('test-title'),
    currentTestTitle: document.getElementById('current-test-title'),
    stimulusText: document.getElementById('stimulus-text'),
    questionsContainer: document.getElementById('questions-container'),
    timerDisplay: document.getElementById('timer'),
    progressIndicator: document.getElementById('progress-indicator'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    finishBtn: document.getElementById('finish-btn'),
};

// --- Функції Управління Часом (Ф3) ---

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startTimer(durationSeconds) {
    timeLeftSeconds = durationSeconds;
    elements.timerDisplay.textContent = formatTime(timeLeftSeconds);

    timerInterval = setInterval(() => {
        timeLeftSeconds--;
        elements.timerDisplay.textContent = formatTime(timeLeftSeconds);

        if (timeLeftSeconds <= 0) {
            clearInterval(timerInterval);
            finishTest();
        }
    }, 1000);
}

// --- Функції Відображення (Ф1, Ф4) ---

function updateNavigation() {
    const totalQuestions = currentTest.questions.length;
    
    // Оновлення індикатора прогресу
    elements.progressIndicator.textContent = `Питання: ${currentQuestionIndex + 1}/${totalQuestions}`;

    // Кнопки навігації
    elements.prevBtn.disabled = currentQuestionIndex === 0;
    elements.nextBtn.disabled = currentQuestionIndex === totalQuestions - 1;

    // Кнопка 'Завершити' стає активною на останньому питанні
    elements.finishBtn.disabled = false; // Дозволяємо завершити в будь-який момент
}


function renderQuestion() {
    const q = currentTest.questions[currentQuestionIndex];
    elements.questionsContainer.innerHTML = ''; // Очищаємо контейнер
    
    // 1. Створюємо основну картку питання
    const questionCard = document.createElement('div');
    questionCard.className = 'bg-white p-6 rounded-lg shadow-lg border-l-4 border-blue-500';
    
    // Заголовок питання
    const header = document.createElement('h4');
    header.className = 'text-xl font-bold mb-4 text-gray-800';
    header.textContent = `Питання ${q.id}:`;
    
    // Текст питання
    const textP = document.createElement('p');
    textP.className = 'text-gray-700 mb-6';
    textP.textContent = q.text;

    questionCard.appendChild(header);
    questionCard.appendChild(textP);

    // 2. Рендеримо варіанти відповідей
    const form = document.createElement('div');
    form.id = `q-${q.id}-options`;
    
    q.options.forEach((optionText, index) => {
        const optionId = `q${q.id}-opt${index}`;
        
        const label = document.createElement('label');
        label.className = 'flex items-center space-x-3 p-3 mb-2 rounded-lg cursor-pointer transition duration-150 hover:bg-blue-50 border border-gray-200';
        
        const input = document.createElement('input');
        input.type = q.type === 'single_choice' ? 'radio' : 'checkbox';
        input.name = `question-${q.id}`;
        input.value = index;
        input.className = 'form-radio h-5 w-5 text-blue-600';
        
        // Перевіряємо, чи була ця відповідь обрана раніше
        if (userAnswers[q.id] === index) {
            input.checked = true;
            label.classList.add('bg-blue-100', 'border-blue-400');
        }

        const span = document.createElement('span');
        span.className = 'text-gray-800 flex-1';
        span.textContent = optionText;
        
        // Обробник кліку (Ф2)
        input.addEventListener('change', () => {
            handleAnswerChange(q.id, index);
            // Візуальне оновлення
            document.querySelectorAll(`[name="question-${q.id}"]`).forEach(el => {
                const parentLabel = el.closest('label');
                parentLabel.classList.remove('bg-blue-100', 'border-blue-400');
            });
            label.classList.add('bg-blue-100', 'border-blue-400');
        });

        label.appendChild(input);
        label.appendChild(span);
        form.appendChild(label);
    });
    
    questionCard.appendChild(form);
    elements.questionsContainer.appendChild(questionCard);

    // Оновлення стимульного тексту
    elements.stimulusText.textContent = q.stimulus;
    
    updateNavigation();
}

// --- Обробники Подій ---

function handleAnswerChange(questionId, selectedIndex) {
    // Зберігаємо відповідь користувача
    userAnswers[questionId] = selectedIndex; 
    // У майбутньому тут можна додати логіку для multiple_choice
}

function nextQuestion() {
    if (currentQuestionIndex < currentTest.questions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
    }
}

function finishTest() {
    clearInterval(timerInterval);
    // Зберігаємо результати у localStorage перед переходом
    localStorage.setItem('b2_test_results', JSON.stringify({
        testId: currentTest.test_id,
        answers: userAnswers,
        questions: currentTest.questions,
        duration: currentTest.duration_minutes * 60 - timeLeftSeconds // Час, витрачений на тест
    }));
    
    // Перенаправляємо на сторінку результатів (test-page.html поки порожня)
    window.location.href = 'results-page.html';
}

// --- Ініціалізація та Завантаження Даних ---

async function loadTest(testPath) {
    try {
        const response = await fetch(testPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        currentTest = await response.json();
        
        // Ініціалізація UI
        elements.testTitle.textContent = currentTest.title;
        elements.currentTestTitle.textContent = currentTest.title;
        
        // Скидаємо відповіді та індекс
        userAnswers = {};
        currentQuestionIndex = 0;
        
        // Запуск таймера
        startTimer(currentTest.duration_minutes * 60);

        // Відображення першого питання
        renderQuestion();

    } catch (error) {
        console.error("Помилка завантаження тесту:", error);
        elements.questionsContainer.innerHTML = `<div class="p-10 text-center text-red-600 bg-red-100 rounded-lg">Помилка завантаження тестових даних. Перевірте файл ${testPath}.</div>`;
    }
}

// --- Головна Функція (Entry Point) ---

function init() {
    // Підключення обробників навігації
    elements.nextBtn.addEventListener('click', nextQuestion);
    elements.prevBtn.addEventListener('click', prevQuestion);
    elements.finishBtn.addEventListener('click', finishTest);
    
    // Запускаємо завантаження нашого тестового JSON-файлу
    loadTest('src/data/b2-test-1.json');
}

// Ініціалізація при завантаженні DOM
if (document.getElementById('test-title')) {
    init();
}