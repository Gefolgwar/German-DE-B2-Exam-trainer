// --- Допоміжні функції ---

function generateUniqueId() {
    return 'test-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// --- DOM Елементи ---
const elements = {
    form: document.getElementById('test-upload-form'),
    questionsContainer: document.getElementById('questions-container'),
    addQuestionBtn: document.getElementById('add-question-btn'),
    messageBox: document.getElementById('message-box')
};

let questionCounter = 0;

// --- Утиліти UI ---

function showMessage(message, type = 'success') {
    elements.messageBox.textContent = message;
    elements.messageBox.className = `p-4 rounded-lg font-semibold my-4 ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    elements.messageBox.classList.remove('hidden');
    // Приховати повідомлення через 5 секунд
    setTimeout(() => {
        elements.messageBox.classList.add('hidden');
    }, 5000);
}

function createQuestionCard(index) {
    const cardId = `question-${index}`;
    const card = document.createElement('div');
    card.id = cardId;
    card.className = 'question-card bg-gray-50 p-5 rounded-lg border border-gray-200 shadow-md space-y-3';
    
    // HTML-структура картки питання
    card.innerHTML = `
        <h4 class="text-lg font-bold text-gray-800 border-b pb-2 flex justify-between items-center">
            Питання №${index}
            <button type="button" data-id="${cardId}" class="remove-question-btn text-red-500 hover:text-red-700 text-sm font-normal transition duration-150">
                Видалити
            </button>
        </h4>
        
        <!-- Текст Питання -->
        <div>
            <label for="q-text-${index}" class="block text-gray-700 font-medium">Текст питання</label>
            <textarea id="q-text-${index}" class="w-full mt-1 p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" rows="2" required placeholder="Наприклад: Вставте правильний артикль..."></textarea>
        </div>

        <!-- Стимул (опціонально) -->
        <div>
            <label for="q-stimulus-${index}" class="block text-gray-700 font-medium">Стимул/Контекст (опціонально)</label>
            <textarea id="q-stimulus-${index}" class="w-full mt-1 p-2 border border-gray-300 rounded-lg" rows="1" placeholder="Наприклад: 'Der Klimawandel betrifft uns alle...'"></textarea>
        </div>

        <!-- Пояснення -->
        <div>
            <label for="q-explanation-${index}" class="block text-gray-700 font-medium">Пояснення правильної відповіді</label>
            <textarea id="q-explanation-${index}" class="w-full mt-1 p-2 border border-gray-300 rounded-lg" rows="2" required placeholder="Чому ця відповідь правильна?"></textarea>
        </div>

        <!-- Варіанти Відповідей -->
        <div class="options-group space-y-2" data-index="${index}">
            <label class="block text-gray-700 font-medium pt-2">Варіанти відповідей (4 варіанти)</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${[0, 1, 2, 3].map(optIndex => `
                    <div class="flex items-center space-x-2 bg-white p-2 rounded-lg border">
                        <input type="radio" name="correct-answer-${index}" id="q-${index}-correct-${optIndex}" value="${optIndex}" class="text-blue-600 focus:ring-blue-500" required>
                        <input type="text" id="q-${index}-option-${optIndex}" class="w-full p-2 border border-gray-300 rounded-lg" required placeholder="Варіант ${optIndex + 1}">
                    </div>
                `).join('')}
            </div>
            <p class="text-sm text-red-500 mt-1">Оберіть радіокнопку поруч з полем, щоб позначити правильну відповідь.</p>
        </div>
    `;
    
    // Додаємо обробник для кнопки видалення
    card.querySelector('.remove-question-btn').addEventListener('click', (e) => {
        e.preventDefault();
        card.remove();
        updateQuestionNumbers();
        showMessage(`Питання №${index} видалено.`, 'success');
    });

    return card;
}

function updateQuestionNumbers() {
    // Оновлення нумерації після видалення
    const cards = elements.questionsContainer.querySelectorAll('.question-card');
    cards.forEach((card, index) => {
        const newNumber = index + 1;
        // Оновлюємо заголовок
        card.querySelector('h4').firstChild.textContent = `Питання №${newNumber}`;
        
        // Оновлюємо id і name для коректної роботи радіокнопок
        card.querySelectorAll('[id^="q-"], [name^="correct-answer-"]').forEach(el => {
            const oldPrefix = el.id ? el.id.match(/q-(\d+)-|correct-answer-(\d+)/) : el.name.match(/correct-answer-(\d+)/);
            if (!oldPrefix) return;

            const oldNum = oldPrefix[1] || oldPrefix[2]; // Отримуємо старий номер
            
            // Замінюємо старий номер на новий
            const newId = (el.id || '').replace(new RegExp(`q-${oldNum}-`), `q-${newNumber}-`);
            const newName = (el.name || '').replace(new RegExp(`correct-answer-${oldNum}`), `correct-answer-${newNumber}`);

            if (el.id) el.id = newId;
            if (el.name) el.name = newName;
            
            // Оновлюємо атрибути for для label (тут не потрібно, бо label - це обгортка)
        });
    });
}

function addQuestion() {
    questionCounter++;
    const card = createQuestionCard(questionCounter);
    elements.questionsContainer.appendChild(card);
    
    // Прокрутка до нового питання
    card.scrollIntoView({ behavior: 'smooth' });
}

function handleSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('test-title').value.trim();
    const durationMinutes = parseInt(document.getElementById('duration-minutes').value, 10);
    const passingScorePoints = parseInt(document.getElementById('passing-score').value, 10);
    
    // Збір даних з питань
    const questions = [];
    let isValid = true;

    // Отримуємо всі картки питань
    const questionCards = elements.questionsContainer.querySelectorAll('.question-card');

    if (questionCards.length === 0) {
        showMessage('Будь ласка, додайте хоча б одне питання.', 'error');
        return;
    }

    // Проходимось по всіх питаннях для збору та валідації
    questionCards.forEach((card, index) => {
        if (!isValid) return; // Якщо вже виявили помилку, зупиняємось

        // Використовуємо індекс + 1 як умовний ID для відображення помилок
        const qDisplayId = index + 1; 

        // Оскільки в HTML-структурі id прив'язані до questionCounter, який зростає, 
        // тут використовуємо внутрішній логічний ID питання (наприклад, 1, 2, 3...)
        // Щоб знайти елементи, орієнтуємося на їхні унікальні атрибути, наприклад, id картки.
        
        const qTextarea = card.querySelector('textarea[id^="q-text-"]');
        const qExplanationTextarea = card.querySelector('textarea[id^="q-explanation-"]');

        const qText = qTextarea.value.trim();
        const qStimulus = card.querySelector('textarea[id^="q-stimulus-"]').value.trim();
        const qExplanation = qExplanationTextarea.value.trim();
        
        if (!qText) {
            isValid = false;
            showMessage(`Питання №${qDisplayId}: Текст питання не може бути порожнім.`, 'error');
            return;
        }
        if (!qExplanation) {
            isValid = false;
            showMessage(`Питання №${qDisplayId}: Пояснення не може бути порожнім.`, 'error');
            return;
        }
        
        const options = [];
        let correct_answer_index = -1;

        // Збір варіантів та правильної відповіді
        const optionInputs = card.querySelectorAll('input[type="text"]');
        const radioInputs = card.querySelectorAll('input[type="radio"][name^="correct-answer-"]');

        optionInputs.forEach((input, optIndex) => {
            if (!input.value.trim()) {
                isValid = false;
                showMessage(`Питання №${qDisplayId}: Варіант ${optIndex + 1} не може бути порожнім.`, 'error');
                return;
            }
            options.push(input.value.trim());

            if (radioInputs[optIndex].checked) {
                correct_answer_index = optIndex;
            }
        });

        if (!isValid) return;

        if (correct_answer_index === -1) {
            isValid = false;
            showMessage(`Питання №${qDisplayId}: Оберіть правильну відповідь.`, 'error');
            return;
        }

        // Внутрішній ID питання для збереження
        const internalQId = qDisplayId; 

        questions.push({
            id: internalQId,
            text: qText,
            stimulus: qStimulus || null, // Може бути null
            type: 'single_choice',
            options: options,
            correct_answer_index: correct_answer_index,
            explanation: qExplanation
        });
    });

    if (!isValid) {
        return; 
    }

    // Валідація прохідного балу
    if (passingScorePoints > questions.length) {
         showMessage(`Прохідний бал (${passingScorePoints}) не може перевищувати загальну кількість питань (${questions.length}).`, 'error');
         return;
    }


    // Формування об'єкту тесту
    const newTest = {
        test_id: generateUniqueId(),
        title: title,
        duration_minutes: durationMinutes,
        passing_score_points: passingScorePoints,
        questions: questions
    };

    // --- Збереження в localStorage ---
    try {
        const existingTests = JSON.parse(localStorage.getItem('b2_custom_tests')) || [];
        // Перевіряємо, чи такий тест вже існує (за назвою), хоча id унікальний.
        const existingIndex = existingTests.findIndex(t => t.title === newTest.title);
        if (existingIndex !== -1) {
            existingTests[existingIndex] = newTest; // Замінюємо старий
        } else {
            existingTests.unshift(newTest); // Додаємо новий на початок
        }
        
        // Зберігаємо оновлений список
        localStorage.setItem('b2_custom_tests', JSON.stringify(existingTests));
        
        // Зберігаємо ідентифікатор щойно створеного тесту, щоб main.js знав, який запускати
        localStorage.setItem('b2_test_to_load', newTest.test_id);

        showMessage(`Тест "${newTest.title}" успішно збережено та готовий до запуску!`, 'success');
        
        // Перенаправлення на сторінку тесту через невелику затримку
        setTimeout(() => {
            window.location.href = 'test-page.html';
        }, 1500);

    } catch (error) {
        console.error('Помилка збереження тесту:', error);
        showMessage('Помилка: Не вдалося зберегти тест у браузері.', 'error');
    }
}

// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // Початкове додавання одного питання при завантаженні
    if (elements.questionsContainer.children.length === 0) {
        addQuestion(); 
    }
    
    if (elements.addQuestionBtn) elements.addQuestionBtn.addEventListener('click', addQuestion);
    if (elements.form) elements.form.addEventListener('submit', handleSubmit);
});