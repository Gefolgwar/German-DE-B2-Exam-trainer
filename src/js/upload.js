import { doc, getDoc, setDoc, enableNetwork } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

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
    
    const bgColor = type === 'success' ? 'bg-green-100' : 'bg-red-100';
    const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';

    const messageItem = document.createElement('div');
    messageItem.className = `p-4 rounded-lg font-semibold my-2 ${bgColor} ${textColor}`;
    messageItem.innerHTML = `
        <div class="flex justify-between items-center">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 font-bold text-lg">&times;</button>
        </div>
    `;
    messageBox.appendChild(messageItem);
    messageBox.classList.remove('hidden');
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
    pageTitle: document.getElementById('upload-page-title'),
};

let currentPartIndex = 0; // Лічильник для унікальних ID частин/питань

// =========================================================================
// === Функції Генерації HTML ===
// =========================================================================

/**
 * Генерує HTML-розмітку для одного питання
 */
function createQuestionHtml(partId, questionIndex, questionData = {}) {
    const qId = questionData.id || `q-${partId}-${questionIndex}`;
    const questionText = questionData.text || "";
    const options = questionData.options && questionData.options.length > 0 ? questionData.options : ["", "", "", ""];
    const correctIndex = questionData.correct_answer_index;
    const explanation = questionData.explanation || "";
    
    return `
        <div class="question-item bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4" data-question-id="${qId}">
            <div class="flex justify-between items-center mb-3 border-b pb-2">
                <h5 class="text-lg font-semibold text-gray-700">Питання ${questionIndex}</h5>
                <button type="button" onclick="window.removeElement(this.closest('.question-item'))" class="text-red-500 hover:text-red-700 transition">
                    ❌ Видалити Питання
                </button>
            </div>

            <input type="hidden" name="question_id" value="${qId}">

            <div class="space-y-2 mb-4">
                <label class="block text-gray-700 font-medium">Текст Питання:</label>
                <textarea name="question_text" rows="2" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" required>${questionText}</textarea>
            </div>

            <div class="options-container space-y-2 mb-4">
                <label class="block text-gray-700 font-medium">Варіанти Відповідей:</label>
                ${options.map((option, idx) => `
                    <div class="flex items-center space-x-2 option-item" data-option-index="${idx}">
                        <input type="radio" name="correct_answer_index_${qId}" value="${idx}" class="text-blue-600" ${idx === correctIndex ? 'checked' : ''}>
                        <input type="text" name="option_text" class="w-full p-2 border rounded-lg" required placeholder="Варіант ${idx + 1}" value="${option}">
                        <button type="button" onclick="window.removeElement(this.parentNode)" class="text-red-500 hover:text-red-700 p-1 flex-shrink-0">❌</button>
                    </div>
                `).join('')}
            </div>
            <button type="button" onclick="addOptionToQuestion(this.closest('.question-item'))" class="text-sm text-blue-500 hover:text-blue-700 font-semibold mt-2">+ Додати Варіант Відповіді</button>

            <div class="space-y-2">
                <label class="block text-gray-700 font-medium">Пояснення (необов'язково):</label>
                <textarea name="explanation" rows="2" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500">${explanation}</textarea>
            </div>
        </div>
    `;
}

/**
 * Додає новий варіант відповіді до питання.
 */
window.addOptionToQuestion = function(questionElement) {
    const optionsContainer = questionElement.querySelector('.options-container');
    const qId = questionElement.dataset.questionId;
    const currentOptionCount = optionsContainer.querySelectorAll('.option-item').length;
    
    const newOptionHtml = `
        <div class="flex items-center space-x-2 option-item" data-option-index="${currentOptionCount}">
            <input type="radio" name="correct_answer_index_${qId}" value="${currentOptionCount}" class="text-blue-600">
            <input type="text" name="option_text" class="w-full p-2 border rounded-lg" required placeholder="Варіант ${currentOptionCount + 1}" value="">
            <button type="button" onclick="window.removeElement(this.parentNode)" class="text-red-500 hover:text-red-700 p-1 flex-shrink-0">❌</button>
        </div>
    `;
    
    optionsContainer.insertAdjacentHTML('beforeend', newOptionHtml);
}

/**
 * Додає нове поле для введення медіа (аудіо/зображення).
 */
window.addMediaInput = function(button, type) {
    const container = button.previousElementSibling;
    const placeholder = type === 'audio' ? 'https://.../audio.mp3' : 'https://.../image.jpg';
    const name = type === 'audio' ? 'stimulus_audio_url' : 'stimulus_image_url';

    const newMediaInputHtml = `
        <div class="media-stimulus-item flex items-center space-x-2">
            <input type="url" name="${name}" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="${placeholder}">
            <button type="button" onclick="window.removeElement(this.closest('.media-stimulus-item'))" class="text-red-400 hover:text-red-600 transition text-sm">✕</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', newMediaInputHtml);
}

/**
 * Генерує HTML-розмітку для частини завдання
 */
function createPartCard(partIndex, partData = {}) {
    const card = document.createElement('div');
    const partId = partData.part_id || generateUniqueId();
    currentPartIndex = Math.max(currentPartIndex, partIndex);

    card.className = "part-card bg-white p-6 rounded-xl shadow-lg border-t-8 border-blue-500/50";
    card.dataset.partId = partId;
    card.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h4 class="text-2xl font-bold text-gray-800">Частина ${partIndex}</h4>
            <button type="button" onclick="window.removeElement(this.closest('.part-card'))" class="text-red-600 hover:text-red-800 font-bold transition">
                ❌ Видалити Частину
            </button>
        </div>

        <input type="hidden" name="part_id" value="${partId}">

        <div class="space-y-2">
            <label class="block text-gray-700 font-semibold">Назва Частини (напр., Lesen Teil 1):</label>
            <input type="text" name="part_title" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${partData.title || ''}" required placeholder="Назва частини">
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
                <label class="block text-gray-700 font-semibold">Тривалість частини (хв):</label>
                <input type="number" name="part_duration_minutes" class="part-duration-input w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${partData.duration_minutes || '10'}" min="1" required>
            </div>
            <div class="space-y-2">
                <label class="block text-gray-700 font-semibold">Прохідний бал для частини:</label>
                <input type="number" name="part_passing_score" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${partData.passing_score_points || '1'}" min="0" required>
            </div>
        </div>

        <div class="space-y-4 mb-6">
            <div class="space-y-2">
                <label class="block text-gray-700 font-semibold">Загальна Інструкція до Частини:</label>
                <textarea name="instruction" rows="3" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" required>${partData.instruction || ''}</textarea>
            </div>
            
            <fieldset class="border p-4 rounded-lg space-y-4">
                <legend class="text-lg font-semibold text-gray-700 px-2">Тексти / Стимули (читання)</legend>
                <div class="texts-container space-y-2">
                    ${(partData.media?.texts || [{ id: 'Текст 1', content: '' }]).map((text, idx) => `
                        <div class="text-stimulus-item space-y-1">
                            <label class="block text-sm font-medium text-gray-600">Назва Стимулу ${idx + 1} (${text.id}):</label>
                            <textarea name="stimulus_content" rows="4" data-stimulus-id="${text.id}" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Введіть повний текст для читання">${text.content}</textarea>
                        </div>
                    `).join('')}
                </div>
            </fieldset>

            <fieldset class="border p-4 rounded-lg space-y-2">
                <legend class="text-lg font-semibold text-gray-700 px-2">Медіа-Стимули (слухання/перегляд)</legend>
                <div class="audios-container space-y-2">
                     ${(partData.media?.audios || []).map(audio => `
                        <div class="media-stimulus-item flex items-center space-x-2">
                            <input type="url" name="stimulus_audio_url" class="w-full p-2 border rounded-lg" placeholder="https://.../audio.mp3" value="${audio.url}">
                            <button type="button" onclick="window.removeElement(this.closest('.media-stimulus-item'))" class="text-red-400 hover:text-red-600 transition text-sm">✕</button>
                        </div>`).join('')}
                </div>
                <button type="button" onclick="addMediaInput(this, 'audio')" class="text-sm text-blue-500 hover:text-blue-700 mt-1">➕ Додати Аудіо URL</button>
                
                <div class="images-container space-y-2 mt-4">
                     ${(partData.media?.images || []).map(image => `
                        <div class="media-stimulus-item flex items-center space-x-2">
                            <input type="url" name="stimulus_image_url" class="w-full p-2 border rounded-lg" placeholder="https://.../image.jpg" value="${image.url}">
                            <button type="button" onclick="window.removeElement(this.closest('.media-stimulus-item'))" class="text-red-400 hover:text-red-600 transition text-sm">✕</button>
                        </div>`).join('')}
                </div>
                <button type="button" onclick="addMediaInput(this, 'image')" class="text-sm text-blue-500 hover:text-blue-700 mt-1">➕ Додати Зображення URL</button>
            </fieldset>
        </div>

        <div class="questions-list space-y-4 border-t pt-4">
            <h5 class="text-xl font-bold text-gray-700">Список Питань</h5>
            ${(partData.questions || []).map((qData, qIdx) => createQuestionHtml(partId, qIdx + 1, qData)).join('')}
        </div>
        
        <div class="mt-4 text-center">
            <button type="button" onclick="addQuestionToPart(this.closest('.part-card'))" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-full transition duration-150 shadow-md text-sm">
                ➕ Додати Питання до Частини
            </button>
        </div>
    `;
    return card;
}

/**
 * Додає нову частину завдання.
 */
function addPart(partData) {
    currentPartIndex++;
    const card = createPartCard(currentPartIndex, partData);
    elements.partsContainer.appendChild(card);
    
    // Якщо створюємо нову частину, додаємо в неї одне порожнє питання
    if (!partData || !partData.questions || partData.questions.length === 0) {
        addQuestionToPart(card);
    }

    updateTotalDuration();
}

/**
 * Додає нове питання до певної частини.
 */
window.addQuestionToPart = function(partCard) {
    const questionsList = partCard.querySelector('.questions-list');
    const partId = partCard.dataset.partId;
    const currentQuestionCount = questionsList.querySelectorAll('.question-item').length;
    
    questionsList.insertAdjacentHTML('beforeend', createQuestionHtml(partId, currentQuestionCount + 1));
};

/**
 * Оновлює загальну тривалість тесту на основі тривалостей частин.
 */
function updateTotalDuration() {
    let totalMinutes = 0;
    document.querySelectorAll('.part-duration-input').forEach(input => {
        totalMinutes += parseInt(input.value, 10) || 0;
    });
    const totalDurationInput = document.getElementById('duration-minutes');
    if (totalDurationInput) {
        totalDurationInput.value = totalMinutes;
    }
}


// =========================================================================
// === Функції Збереження та Завантаження (Firebase) ===
// =========================================================================

/**
 * Збирає дані з форми та форматує їх в об'єкт тесту.
 * @param {HTMLFormElement} form - Елемент форми.
 * @returns {object} - Об'єкт тесту.
 */
function serializeFormToTestObject(form) {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    const test = {
        test_id: form.dataset.testId || generateUniqueId(),
        title: form.querySelector('#test-title').value.trim() || "Без назви",
        duration_minutes: parseInt(form.querySelector('#duration-minutes').value, 10),
        passing_score_points: parseInt(form.querySelector('#passing-score').value, 10),
        questions_total: 0, // Буде оновлено пізніше
        parts: [],
        userId: window.userId // Зберігаємо ID користувача, який створив тест
    };

    const partCards = form.querySelectorAll('.part-card');
    
    partCards.forEach(partCard => {
        const partId = partCard.dataset.partId;
        const part = {
            part_id: partId,
            instruction: partCard.querySelector('textarea[name="instruction"]').value.trim(),
            title: partCard.querySelector('input[name="part_title"]').value.trim(),
            duration_minutes: parseInt(partCard.querySelector('input[name="part_duration_minutes"]').value, 10) || 0,
            passing_score_points: parseInt(partCard.querySelector('input[name="part_passing_score"]').value, 10) || 0,
            media: {},
            questions: []
        };
        
        // Збір стимулів-текстів
        part.media.texts = [];
        partCard.querySelectorAll('.text-stimulus-item textarea[name="stimulus_content"]').forEach(textarea => {
            part.media.texts.push({
                id: textarea.dataset.stimulusId || generateUniqueId(),
                content: textarea.value.trim()
            });
        });
        if (part.media.texts.length === 0) delete part.media.texts;

        // Збір стимулів-аудіо
        part.media.audios = [];
        partCard.querySelectorAll('input[name="stimulus_audio_url"]').forEach(input => {
            if (input.value.trim()) {
                part.media.audios.push({
                    id: generateUniqueId(),
                    url: input.value.trim()
                });
            }
        });
        if (part.media.audios?.length === 0) delete part.media.audios;

        // Збір стимулів-зображень
        part.media.images = [];
        partCard.querySelectorAll('input[name="stimulus_image_url"]').forEach(input => {
            if (input.value.trim()) {
                part.media.images.push({
                    id: generateUniqueId(),
                    url: input.value.trim()
                });
            }
        });
        if (part.media.images?.length === 0) delete part.media.images;

        // Якщо об'єкт media порожній, видаляємо його
        if (Object.keys(part.media).length === 0) {
            delete part.media;
        }

        // Збір питань
        partCard.querySelectorAll('.question-item').forEach(qItem => {
            const qId = qItem.dataset.questionId;
            const optionsTexts = Array.from(qItem.querySelectorAll('input[name="option_text"]')).map(t => t.value.trim());
            const correctRadio = qItem.querySelector(`input[name="correct_answer_index_${qId}"]:checked`);
            
            const question = {
                id: qId,
                text: qItem.querySelector('textarea[name="question_text"]').value.trim(),
                type: 'single_choice',
                options: optionsTexts,
                correct_answer_index: correctRadio ? parseInt(correctRadio.value, 10) : 0,
                explanation: qItem.querySelector('textarea[name="explanation"]').value.trim()
            };
            
            // Валідація: якщо є текст питання і хоча б 2 варіанти
            if (question.text && optionsTexts.filter(t => t).length >= 2) {
                 part.questions.push(question);
                 test.questions_total++;
            }
        });

        if (part.questions.length > 0) {
            test.parts.push(part);
        }
    });
    
    return test;
}

/**
 * Обробляє подання форми, зберігаючи дані у Firestore.
 */
async function handleSubmit(event) {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    event.preventDefault();
    showMessage("Розпочато процес збереження...", 'success');

    if (!window.db || !window.isAuthReady) {
        showMessage("Зачекайте, поки ініціалізується Firebase...", 'error');
        return;
    }

    // Спробуємо активувати мережу, якщо вона раптом "заснула"
    try {
        await enableNetwork(window.db);
    } catch (e) {
        console.warn("Could not enable network, might be already online.", e);
    }

    try {
        showMessage("1/3: Збір та валідація даних з форми...", 'success');
        const testObject = serializeFormToTestObject(event.target);
        
        if (testObject.questions_total === 0) {
            showMessage("Будь ласка, додайте хоча б одне питання до тесту.", 'error');
            return;
        }

        showMessage(`2/3: Дані зібрано. Знайдено ${testObject.parts.length} частин та ${testObject.questions_total} питань.`, 'success');

        const testId = testObject.test_id;
        const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testId);
        
        showMessage(`3/3: Відправка даних до Firebase...`, 'success');
        // Зберігаємо об'єкт тесту у Firestore
        await setDoc(docRef, testObject, { merge: true });
        
        event.target.dataset.testId = testId; // Оновлюємо ID форми, якщо це був новий тест
        if (elements.pageTitle) {
            elements.pageTitle.textContent = `Редагування Тесту: ${testObject.title}`;
        }

        showMessage(`✅ Готово! Тест "${testObject.title}" успішно збережено у Firebase.`, 'success');

        // Очищаємо localStorage, оскільки тепер використовуємо URL-параметр для редагування
        localStorage.removeItem('b2_test_to_edit'); 

        // Перенаправляємо на головну сторінку через 2 секунди
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error("Помилка при збереженні тесту:", error);
        showMessage(`Помилка при збереженні тесту: ${error.message}`, 'error');
    }
}

/**
 * Завантажує тест для редагування з Firestore.
 * @param {string} testId - ID тесту для завантаження.
 */
async function loadTestForEditing(testId, retries = 3) {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    if (!window.db) {
         console.warn("Firestore not ready. Retrying loadTestForEditing...");
         setTimeout(() => loadTestForEditing(testId), 200);
         return;
    }

    const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testId);
    
    // Спробуємо активувати мережу перед завантаженням
    try {
        await enableNetwork(window.db);
    } catch (e) {
        console.warn("Could not enable network, might be already online.", e);
    }

    try {
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const testToEdit = docSnap.data();
            
            // Встановлення основних полів
            elements.form.dataset.testId = testId;
            if (elements.pageTitle) {
                elements.pageTitle.textContent = `Редагування Тесту: ${testToEdit.title}`;
            }
            document.getElementById('test-title').value = testToEdit.title;
            document.getElementById('duration-minutes').value = testToEdit.duration_minutes;
            document.getElementById('passing-score').value = testToEdit.passing_score_points;
            // Загальний прохідний бал тепер може бути декоративним або використовуватися для загального статусу

            elements.partsContainer.innerHTML = '';
            currentPartIndex = 0; // Скидаємо лічильник

            // Додавання частин
            testToEdit.parts.forEach((partData, index) => {
                const partIndex = index + 1; 
                const card = createPartCard(partIndex, partData);
                elements.partsContainer.appendChild(card);
            });
            updateTotalDuration();

            showMessage(`Тест "${testToEdit.title}" завантажено для редагування.`, 'success');

        } else {
            showMessage(`Помилка: Тест з ID ${testId} не знайдено. Створюємо новий.`, 'error');
            localStorage.removeItem('b2_test_to_edit'); 
            addPart();
        }
    } catch (error) {
        // Додаємо механізм повторних спроб для помилки "offline"
        if (error.code === 'unavailable' && retries > 0) {
            console.warn(`Client is offline, retrying... (${retries} attempts left)`);
            setTimeout(() => loadTestForEditing(testId, retries - 1), 1000); // Чекаємо 1 секунду
            return;
        }
        console.error("Error loading test from Firestore:", error);
        showMessage(`Помилка завантаження тесту для редагування: ${error.message}`, 'error');
        addPart();
    }
}


// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    if (elements.addPartBtn) {
        elements.addPartBtn.addEventListener('click', () => addPart({})); 
    }

    // Слухач для автоматичного оновлення загальної тривалості
    if (elements.partsContainer) {
        elements.partsContainer.addEventListener('input', (e) => {
            if (e.target && e.target.classList.contains('part-duration-input')) {
                updateTotalDuration();
            }
        });
    }
    
    if (elements.form) {
        elements.form.addEventListener('submit', handleSubmit);
    }
    
    // Перевіряємо URL-параметр для редагування
    const urlParams = new URLSearchParams(window.location.search);
    const idToEdit = urlParams.get('edit') || localStorage.getItem('b2_test_to_edit');

    if (idToEdit) {
        if (window.isAuthReady) {
            loadTestForEditing(idToEdit);
        } else {
            window.addEventListener('firestoreReady', () => loadTestForEditing(idToEdit));
        }
    } else {
        // Якщо не редагуємо, створюємо нову частину
        addPart();
    }
});