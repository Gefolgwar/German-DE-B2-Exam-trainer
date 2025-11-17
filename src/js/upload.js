// --- ДОПОМІЖНІ ФУНКЦІЇ ---

/**
 * Генерує унікальний ID, якщо він не вказаний.
 */
function generateUniqueId() {
    return 'test-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/**
 * Відображає повідомлення у messageBox.
 */
function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;
    
    messageBox.textContent = message;
    messageBox.className = `p-4 rounded-lg font-semibold my-4 ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    messageBox.classList.remove('hidden');
    
    if (type === 'success') {
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 5000);
    }
}

window.removeElement = function(element) {
    if (element) {
        element.remove();
    }
}


// --- СТАН ФОРМИ ТА DOM ЕЛЕМЕНТИ ---

const elements = {
    form: document.getElementById('test-upload-form'),
    partsContainer: document.getElementById('parts-container'), 
    addPartBtn: document.getElementById('add-part-btn'), 
    formTitle: document.getElementById('form-title'),
    messageBox: document.getElementById('message-box'),
};

let partCounter = 0;
// Змінна для зберігання ID тесту, якщо ми в режимі редагування
let testToEditId = null; 

// --- УПРАВЛІННЯ ОПЦІЯМИ ТА ПИТАННЯМИ ---

/**
 * Генерує HTML для одного варіанта відповіді.
 */
function createOptionHtml(qId, optIndex, optText = '', isChecked = false) {
    const optionName = `${qId}-option-${optIndex}`;
    const radioName = `${qId}-correct`;
    
    return `
        <div class="flex items-center space-x-2 bg-white p-2 rounded-lg border option-item" data-option-index="${optIndex}">
            <input type="radio" name="${radioName}" value="${optIndex}" class="text-blue-600" ${isChecked ? 'checked' : ''}> 
            <input type="text" name="${optionName}" class="w-full p-2 border rounded-lg" required placeholder="Варіант ${optIndex + 1}" value="${optText}">
            <button type="button" onclick="removeElement(this.parentNode)" class="text-red-500 hover:text-red-700 p-1 flex-shrink-0">❌</button>
        </div>
    `;
}

/**
 * Додає новий варіант відповіді до питання.
 */
window.addOptionToQuestion = function(addBtn, optText = '') {
    const questionItem = addBtn.closest('.question-item');
    const qId = questionItem.dataset.qId;
    const optionsContainer = questionItem.querySelector('.options-container');
    
    const currentOptions = optionsContainer.querySelectorAll('.option-item'); // Corrected reference
    const newIndex = currentOptions.length;
    
    if (newIndex >= 10) {
        alert("Максимальна кількість варіантів відповідей - 10.");
        return;
    }
    
    // Новий варіант завжди додається не вибраним (isChecked=false)
    optionsContainer.insertAdjacentHTML('beforeend', createOptionHtml(qId, newIndex, optText));
}

/**
 * Генерує HTML-картку для одного питання в межах частини.
 */
function createQuestionHtml(partIndex, qIndex, questionData = {}) {
    const qId = `part-${partIndex}-q-${qIndex}`;
    
    let optionsHtml = '';

    if (questionData.options && questionData.options.length > 0) {
        optionsHtml = questionData.options.map((optText, optIndex) => 
            createOptionHtml(qId, optIndex, optText, optIndex === questionData.correct_answer_index)
        ).join('');
    } else {
        // Додаємо 4 порожні варіанти для нового питання
        // ВАЖЛИВО: Передаємо qId, щоб імена радіокнопок були правильними
        optionsHtml = [0, 1, 2, 3].map(optIndex => 
            createOptionHtml(qId, optIndex, '', false)).join('');
    }

    return `
        <div class="question-item border-t border-dashed pt-4 mt-4" data-q-id="${qId}">
            <h5 class="font-semibold text-md text-gray-700 mb-3">
                Питання ${qIndex}
                <button type="button" onclick="removeElement(this.parentNode.parentNode)" class="text-xs text-red-500 hover:text-red-700 ml-3">Видалити</button>
            </h5>
            
            <label class="block text-gray-700 font-medium">Текст питання</label>
            <textarea name="${qId}-text" class="w-full mt-1 p-2 border rounded-lg" rows="1" required placeholder="Наприклад: Вставте правильний артикль...">${questionData.text || ''}</textarea>
            
            <label class="block text-gray-700 font-medium mt-3">Пояснення правильної відповіді</label>
            <textarea name="${qId}-explanation" class="w-full mt-1 p-2 border rounded-lg" rows="1" required placeholder="Чому ця відповідь правильна?">${questionData.explanation || ''}</textarea>

            <div class="options-group mt-3 space-y-2">
                <label class="block text-gray-700 font-medium">Варіанти відповідей</label>
                <div class="options-container grid grid-cols-1 sm:grid-cols-2 gap-2" data-q-id="${qId}">
                    ${optionsHtml}
                </div>
                <button type="button" onclick="addOptionToQuestion(this)" class="text-sm text-blue-500 hover:text-blue-700 font-semibold mt-2">+ Додати Варіант Відповіді</button>
            </div>
        </div>
    `;
}

// --- ВИПРАВЛЕНА ЛОГІКА ДЛЯ МЕДІА ---

/**
 * Генерує та вставляє HTML-елемент для медіа вказаного типу.
 */
function renderMediaInput(partCardElement, type, content = '') {
    const partId = partCardElement.id;
    let container, labelText, inputName, placeholder, isTextArea = false;

    if (type === 'audio') {
        container = partCardElement.querySelector('.audio-list');
        labelText = 'Аудіо URL';
        inputName = 'audio-url';
        placeholder = 'https://raw.githubusercontent.com/.../audio.mp3';
    } else if (type === 'image') {
        container = partCardElement.querySelector('.image-list');
        labelText = 'Зображення URL';
        inputName = 'image-url';
        placeholder = 'https://raw.githubusercontent.com/.../image.jpg';
    } else if (type === 'text') {
        container = partCardElement.querySelector('.text-list');
        labelText = 'Текст для читання';
        inputName = 'text-content';
        isTextArea = true;
        placeholder = 'Текст 1\nEntdecken Sie interessante Städte...';
    } else {
        return;
    }
    
    if (!container) return;

    const currentCount = container.querySelectorAll('.media-input-group').length + 1;
    const mediaId = `${partId}-${type}-${currentCount}`;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'flex items-start space-x-2 media-input-group';
    
    let inputHtml;
    if (isTextArea) {
        inputHtml = `
            <textarea id="${mediaId}" name="${inputName}" class="w-full p-2 border rounded-lg" rows="5" placeholder="${placeholder}" required>${content}</textarea>
        `;
    } else {
        inputHtml = `
            <input type="text" id="${mediaId}" name="${inputName}" class="w-full p-2 border rounded-lg" placeholder="${placeholder}" required value="${content}">
        `;
    }

    inputWrapper.innerHTML = `
        <label for="${mediaId}" class="mt-2 text-sm text-gray-600 w-24 flex-shrink-0">${labelText}:</label>
        ${inputHtml}
        <button type="button" onclick="removeElement(this.parentNode)" class="text-red-500 hover:text-red-700 mt-2 flex-shrink-0">❌</button>
    `;

    // Вставляємо перед останньою дитиною (кнопкою "+ Додати")
    container.insertBefore(inputWrapper, container.lastElementChild);
}


/**
 * Глобальна функція для обробки натискання кнопки "Додати Медіа".
 */
window.addMediaInput = function(partId, type) {
    const partCard = document.getElementById(partId);
    if (partCard) {
        renderMediaInput(partCard, type, ''); // Створення нового, порожнього поля
    }
}


window.addQuestionToPart = function(partId) {
    const partCardElement = document.getElementById(partId);
    if (!partCardElement) return;

    const partIndex = partCardElement.dataset.partIndex;
    const questionsContainer = partCardElement.querySelector('.questions-of-part-container');
    const qCount = questionsContainer.querySelectorAll('.question-item').length + 1; 

    questionsContainer.insertAdjacentHTML('beforeend', createQuestionHtml(partIndex, qCount));
    
    questionsContainer.lastElementChild.scrollIntoView({ behavior: 'smooth' });
}


// --- УПРАВЛІННЯ ЧАСТИНАМИ ---

function createPartCard(index, partData = {}) {
    const partId = `part-${index}`;
    const card = document.createElement('div');
    card.id = partId;
    card.className = 'part-card bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-600 space-y-4';
    card.dataset.partIndex = index;

    card.innerHTML = `
        <h3 class="text-xl font-bold text-gray-800 border-b pb-2 flex justify-between items-center">
            Частина №${index}
            <button type="button" onclick="removeElement(this.parentNode.parentNode)" class="text-sm text-red-500 hover:text-red-700 transition duration-150">
                Видалити Частину
            </button>
        </h3>
        
        <div>
            <label for="${partId}-instruction" class="block text-gray-700 font-medium">Завдання / Інструкція до Частини</label>
            <textarea id="${partId}-instruction" name="${partId}-instruction" class="w-full mt-1 p-2 border rounded-lg" rows="3" required placeholder="Наприклад: Lesen Sie zuerst die zehn Überschriften...">${partData.instruction || ''}</textarea>
        </div>

        <div class="media-container space-y-4 p-4 border rounded-lg bg-gray-50">
            <h4 class="font-bold text-gray-700">🖼️ Медіа та Ресурси для Частини №${index}</h4>

            <div class="audio-list space-y-2" data-part-id="${partId}">
                <label class="block text-gray-700 font-medium">🎧 Посилання на Аудіо (URL)</label>
                <button type="button" onclick="addMediaInput('${partId}', 'audio')" class="text-sm text-blue-500 hover:text-blue-700 font-semibold">+ Додати Аудіофайл</button>
            </div>
            
            <div class="image-list space-y-2" data-part-id="${partId}">
                <label class="block text-gray-700 font-medium mt-3">📷 Посилання на Зображення (URL)</label>
                <button type="button" onclick="addMediaInput('${partId}', 'image')" class="text-sm text-blue-500 hover:text-blue-700 font-semibold">+ Додати Зображення</button>
            </div>
            
            <div class="text-list space-y-2" data-part-id="${partId}">
                <label class="block text-gray-700 font-medium mt-3">📄 Тексти для Читання</label>
                <button type="button" onclick="addMediaInput('${partId}', 'text')" class="text-sm text-blue-500 hover:text-blue-700 font-semibold">+ Додати Текст</button>
            </div>
        </div>

        <div class="questions-of-part-container space-y-4 mt-4" data-part-index="${index}">
            <h4 class="font-bold text-gray-700 pt-4 border-t">❓ Питання Частини №${index}</h4>
        </div>
        
        <div class="text-center pt-2">
            <button type="button" onclick="addQuestionToPart('${partId}')" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-1 px-4 rounded-full text-sm">
                + Додати Питання
            </button>
        </div>
    `;
    
    const questionsContainer = card.querySelector(`.questions-of-part-container`);
    if (questionsContainer) {
        if (partData.questions && partData.questions.length > 0) {
            partData.questions.forEach((qData, qIdx) => {
                questionsContainer.innerHTML += createQuestionHtml(index, qIdx + 1, qData);
            });
        } else {
            questionsContainer.innerHTML += createQuestionHtml(index, 1); 
        }
    }
    
    // БЛОК: Завантажуємо медіа
    if (partData.media) {
        if (partData.media.audio) partData.media.audio.forEach(m => renderMediaInput(card, 'audio', m.url));
        if (partData.media.images) partData.media.images.forEach(m => renderMediaInput(card, 'image', m.url));
        if (partData.media.texts) partData.media.texts.forEach(m => renderMediaInput(card, 'text', m.content));
    }


    return card;
}


function addPart() {
    // Враховуємо існуючі картки
    partCounter = elements.partsContainer.querySelectorAll('.part-card').length + 1;
    const card = createPartCard(partCounter);
    if (elements.partsContainer) {
        elements.partsContainer.appendChild(card);
    }
    card.scrollIntoView({ behavior: 'smooth' });
}


// --- ЗБІР ДАНИХ ТА ЗБЕРЕЖЕННЯ В LOCALSTORAGE ---

function saveTestToLocalStorage(testData) {
    let existingTests = localStorage.getItem('b2_custom_tests');
    existingTests = existingTests ? JSON.parse(existingTests) : [];
    
    const existingIndex = existingTests.findIndex(t => t.test_id === testData.test_id);

    if (existingIndex !== -1) {
        existingTests[existingIndex] = testData;
    } else {
        existingTests.unshift(testData); 
    }
    
    localStorage.setItem('b2_custom_tests', JSON.stringify(existingTests));
}

async function handleSubmit(e) { 
    e.preventDefault();

    showMessage('Збір та валідація даних...', 'success');

    const title = document.getElementById('test-title').value.trim();
    const durationMinutes = parseInt(document.getElementById('duration-minutes').value, 10);
    const passingScorePoints = parseInt(document.getElementById('passing-score').value, 10);

    if (isNaN(durationMinutes) || isNaN(passingScorePoints) || durationMinutes <= 0 || passingScorePoints < 0) {
        showMessage('Будь ласка, введіть коректні числові значення для тривалості та прохідного балу.', 'error');
        return;
    }
    
    const partCards = elements.partsContainer.querySelectorAll('.part-card');

    if (partCards.length === 0) {
        showMessage('Будь ласка, додайте хоча б одну частину завдання.', 'error'); 
        return;
    }

    let isValid = true;
    const parts = []; 
    let totalQuestions = 0;

    partCards.forEach((card, partIndex) => {
        if (!isValid) return; 

        const pDisplayId = partIndex + 1; 
        const partGlobalIndex = card.dataset.partIndex;
        
        const instruction = card.querySelector(`#part-${partGlobalIndex}-instruction`).value.trim();
        
        if (!instruction) {
            isValid = false;
            showMessage(`Частина №${pDisplayId}: Інструкція (Завдання) не може бути порожньою.`, 'error'); 
            return;
        }

        // --- ЗБІР МЕДІА ---
        const partMedia = { images: [], texts: [], audio: [] };

        card.querySelectorAll('.audio-list input[name="audio-url"]').forEach((input, mediaIndex) => {
            if (input.value.trim()) {
                partMedia.audio.push({ id: `audio-${mediaIndex + 1}`, url: input.value.trim() });
            }
        });
        
        card.querySelectorAll('.image-list input[name="image-url"]').forEach((input, mediaIndex) => {
            if (input.value.trim()) {
                const idChar = String.fromCharCode(65 + mediaIndex); 
                partMedia.images.push({ id: idChar, url: input.value.trim() });
            }
        });

        card.querySelectorAll('.text-list textarea[name="text-content"]').forEach((textarea, mediaIndex) => {
            if (textarea.value.trim()) {
                partMedia.texts.push({ id: `Text ${mediaIndex + 1}`, content: textarea.value.trim() });
            }
        });

        const media = {};
        if (partMedia.images.length > 0) media.images = partMedia.images;
        if (partMedia.texts.length > 0) media.texts = partMedia.texts;
        if (partMedia.audio.length > 0) media.audio = partMedia.audio;


        // --- ЗБІР ПИТАНЬ ---
        const questionsContainer = card.querySelector('.questions-of-part-container');
        const questionCards = questionsContainer.querySelectorAll('.question-item');

        if (questionCards.length === 0) {
            isValid = false;
            showMessage(`Частина №${pDisplayId}: Додайте хоча б одне питання.`, 'error'); 
            return;
        }

        const questions = [];
        
        questionCards.forEach((qCard) => {
            if (!isValid) return; 
            
            totalQuestions++; 
            
            const qDisplayId = totalQuestions; 
            
            const qId = qCard.dataset.qId;


            const qText = qCard.querySelector(`textarea[name="${qId}-text"]`).value.trim();
            const qExplanation = qCard.querySelector(`textarea[name="${qId}-explanation"]`).value.trim();
            
            if (!qText || !qExplanation) {
                isValid = false;
                showMessage(`Частина №${pDisplayId}, Питання ${qDisplayId}: Текст питання або пояснення не може бути порожнім.`, 'error'); 
                return;
            }

            const options = [];
            let correct_answer_index = -1;
            
            const optionItems = qCard.querySelectorAll('.option-item');
            
            if (optionItems.length < 2) {
                isValid = false;
                showMessage(`Частина №${pDisplayId}, Питання ${qDisplayId}: Потрібно мінімум 2 варіанти відповідей.`, 'error');
                return;
            }
            
            optionItems.forEach((optionItem, optIndex) => {
                const optionInput = optionItem.querySelector(`input[type="text"]`);
                const radioInput = optionItem.querySelector(`input[type="radio"]`);

                if (!optionInput.value.trim()) {
                    isValid = false;
                    showMessage(`Частина №${pDisplayId}, Питання ${qDisplayId}: Варіант ${optIndex + 1} не може бути порожнім.`, 'error');
                    return;
                }
                options.push(optionInput.value.trim());

                if (radioInput.checked) { 
                    correct_answer_index = optIndex;
                }
            });

            if (!isValid) return;
            
            if (correct_answer_index === -1) {
                isValid = false;
                showMessage(`Частина №${pDisplayId}, Питання ${qDisplayId}: Оберіть правильну відповідь.`, 'error');
                return;
            }
            
            questions.push({
                id: String(qDisplayId),
                text: qText,
                type: 'single_choice', 
                options: options,
                correct_answer_index: correct_answer_index,
                explanation: qExplanation
            });
        });

        if (!isValid) return;

        parts.push({
            part_id: `part-${pDisplayId}-${title.toLowerCase().split(' ')[0]}`,
            instruction: instruction,
            media: Object.keys(media).length > 0 ? media : undefined,
            questions: questions
        });
    });

    if (!isValid) {
        return; 
    }
    
    if (passingScorePoints > totalQuestions) {
         showMessage(`Прохідний бал (${passingScorePoints}) не може перевищувати загальну кількість питань (${totalQuestions}).`, 'error');
         return;
    }

    // 2. ФОРМУВАННЯ ПІДСУМКОВОГО ОБ'ЄКТУ ТА ЗБЕРЕЖЕННЯ
    const finalTest = {
        test_id: testToEditId || title.toLowerCase().replace(/\s+/g, '-').substring(0, 50) + '-' + generateUniqueId(),
        title: title,
        duration_minutes: durationMinutes,
        passing_score_points: passingScorePoints,
        questions_total: totalQuestions, 
        parts: parts
    };
    
    // ЗБЕРІГАЄМО В LOCALSTORAGE
    saveTestToLocalStorage(finalTest);

    showMessage(`Тест "${finalTest.title}" успішно ${testToEditId ? 'оновлено' : 'збережено'} у LocalStorage!`, 'success');
    
    // Очищаємо прапорець редагування та перенаправляємо
    localStorage.removeItem('b2_test_to_edit'); 
    testToEditId = null;

    setTimeout(() => {
        window.location.href = 'index.html'; // Перенаправляємо на головну
    }, 1500);
}


// --- ФУНКЦІЯ ЗАВАНТАЖЕННЯ ДЛЯ РЕДАГУВАННЯ ---

function loadTestForEditing(testId) {
    const testsJson = localStorage.getItem('b2_custom_tests');
    if (!testsJson) return;

    const tests = JSON.parse(testsJson);
    const testToEdit = tests.find(t => t.test_id === testId);

    if (testToEdit) {
        testToEditId = testId;
        elements.formTitle.textContent = `Редагування Тесту: ${testToEdit.title}`;
        document.getElementById('test-title').value = testToEdit.title;
        document.getElementById('duration-minutes').value = testToEdit.duration_minutes;
        document.getElementById('passing-score').value = testToEdit.passing_score_points;

        elements.partsContainer.innerHTML = '';
        
        testToEdit.parts.forEach((partData, index) => {
            const partIndex = index + 1; 
            const card = createPartCard(partIndex, partData);
            elements.partsContainer.appendChild(card);
        });

        if (testToEdit.parts.length === 0) {
            addPart();
        }

        showMessage(`Тест "${testToEdit.title}" завантажено для редагування.`, 'success');

    } else {
        showMessage(`Помилка: Тест з ID ${testId} не знайдено. Створюємо новий.`, 'error');
        localStorage.removeItem('b2_test_to_edit'); 
        addPart();
    }
}


// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    if (elements.addPartBtn) {
        elements.addPartBtn.addEventListener('click', addPart); 
    }
    
    if (elements.form) {
        elements.form.addEventListener('submit', handleSubmit);
    }

    const idToEdit = localStorage.getItem('b2_test_to_edit');
    
    if (idToEdit) {
        loadTestForEditing(idToEdit);
    } else {
        if (elements.partsContainer && elements.partsContainer.children.length === 0) {
            addPart(); 
        }
    }
});