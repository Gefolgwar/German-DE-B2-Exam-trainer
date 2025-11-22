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
    blocksContainer: document.getElementById('blocks-container'), 
    addBlockBtn: document.getElementById('add-block-btn'),
    pageTitle: document.getElementById('upload-page-title'),
};

window.currentBlockIndex = 0; // Лічильник для унікальних ID блоків
let isFormDirty = false; // Прапорець для відстеження змін у формі

// =========================================================================
// === Функції Генерації HTML ===
// =========================================================================

/**
 * Генерує HTML-розмітку для однієї вправи
 */
function createExerciseHtml(teilId, exerciseIndex, exerciseData = {}) {
    const exId = exerciseData.id || `ex-${teilId}-${exerciseIndex}-${Math.random().toString(16).slice(2)}`;
    const exerciseText = exerciseData.text || "";
    const exerciseType = exerciseData.type || "single_choice"; // Default to single_choice
    const options = exerciseData.options && exerciseData.options.length > 0 ? exerciseData.options : ["", "", "", ""];
    const correctIndex = exerciseData.correct_answer_index;
    const explanation = exerciseData.explanation || "";
    const expectedAnswerText = exerciseData.expected_answer_text || ""; // New field for text_input type
    const taskText = exerciseData.task_text || ""; // Нове поле для завдання
    const points = exerciseData.points || 0;
    
    return `
        <div class="exercise-item bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4" data-exercise-id="${exId}" data-exercise-type="${exerciseType}">
            <div class="flex justify-between items-center mb-3 border-b pb-2">
                <h5 class="text-lg font-semibold text-gray-700">Übung ${exerciseIndex}</h5>
                <button type="button" onclick="window.removeElement(this.closest('.exercise-item'))" class="text-red-500 hover:text-red-700 transition">
                    ❌ Übung entfernen
                </button>
            </div>

            <input type="hidden" name="exercise_id" value="${exId}">

            <div class="space-y-2 mb-4">
                <label class="block text-gray-700 font-medium">Übungstext:</label>
                <textarea name="exercise_text" rows="2" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" required>${exerciseText}</textarea>
            </div>

            <div class="space-y-2 mb-4">
                <label class="block text-gray-700 font-medium">Punkte für die Übung:</label>
                <input type="number" name="exercise_points" class="w-full p-2 border rounded-lg" value="${points}" min="0" required>
            </div>

            <fieldset class="border p-4 rounded-lg space-y-4">
                <legend class="text-lg font-semibold text-gray-700 px-2">Texte / Stimuli</legend>
                <div class="texts-container space-y-2">
                    ${(exerciseData.stimuli?.texts || [{ id: 'Текст 1', content: '' }]).map((text, idx) => `
                        <div class="text-stimulus-item space-y-1">
                            <label class="block text-sm font-medium text-gray-600">Stimulus-Name ${idx + 1} (${text.id}):</label>
                            <textarea name="stimulus_content" rows="4" data-stimulus-id="${text.id}" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Geben Sie den vollständigen Lesetext ein">${text.content}</textarea>
                        </div>
                    `).join('')}
                </div>
            </fieldset>

            <fieldset class="border p-4 rounded-lg space-y-2">
                <legend class="text-lg font-semibold text-gray-700 px-2">Medien-Stimuli (Audio/Bild)</legend>
                <div class="audios-container space-y-2">
                     ${(exerciseData.stimuli?.audios || []).map(audio => `
                        <div class="media-stimulus-item flex items-center space-x-2">
                            <input type="url" name="stimulus_audio_url" class="w-full p-2 border rounded-lg" placeholder="https://.../audio.mp3" value="${audio.url}">
                            <button type="button" onclick="window.removeElement(this.closest('.media-stimulus-item'))" class="text-red-400 hover:text-red-600 transition text-sm">✕</button>
                        </div>`).join('')}
                </div>
                <button type="button" onclick="addMediaInput(this, 'audio')" class="text-sm text-blue-500 hover:text-blue-700 mt-1">➕ Audio-URL hinzufügen</button>
                
                <div class="images-container space-y-2 mt-4">
                     ${(exerciseData.stimuli?.images || []).map(image => `
                        <div class="media-stimulus-item flex items-center space-x-2">
                            <input type="url" name="stimulus_image_url" class="w-full p-2 border rounded-lg" placeholder="https://.../image.jpg" value="${image.url}">
                            <button type="button" onclick="window.removeElement(this.closest('.media-stimulus-item'))" class="text-red-400 hover:text-red-600 transition text-sm">✕</button>
                        </div>`).join('')}
                </div>
                <button type="button" onclick="addMediaInput(this, 'image')" class="text-sm text-blue-500 hover:text-blue-700 mt-1">➕ Bild-URL hinzufügen</button>
            </fieldset>

            <div class="space-y-2 mb-4">
                <label class="block text-gray-700 font-medium">Übungstyp:</label>
                <select name="exercise_type" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" onchange="window.exerciseTypeChanged(this.closest('.exercise-item'))">
                    <option value="single_choice" ${exerciseType === "single_choice" ? "selected" : ""}>Multiple-Choice</option>
                    <option value="text_input" ${exerciseType === "text_input" ? "selected" : ""}>Textfeld</option>
                </select>
            </div>

            <div class="options-section" style="display: ${exerciseType === 'single_choice' ? 'block' : 'none'};">
                <div class="options-container space-y-2 mb-4">
                    <label class="block text-gray-700 font-medium">Antwortoptionen:</label>
                    ${options.map((option, idx) => `
                        <div class="flex items-center space-x-2 option-item" data-option-index="${idx}">
                            <input type="radio" name="correct_answer_index_${exId}" value="${idx}" class="text-blue-600" ${idx === correctIndex ? 'checked' : ''}>
                            <input type="text" name="option_text" class="w-full p-2 border rounded-lg" required placeholder="Option ${idx + 1}" value="${option}">
                            <button type="button" onclick="window.removeElement(this.parentNode)" class="text-red-500 hover:text-red-700 p-1 flex-shrink-0">❌</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" onclick="addOptionToExercise(this.closest('.exercise-item'))" class="text-sm text-blue-500 hover:text-blue-700 font-semibold mt-2">+ Antwortoption hinzufügen</button>
            </div>

            <div class="expected-answer-section" style="display: ${exerciseType === 'text_input' ? 'block' : 'none'};">
                <div class="space-y-2 mb-4">
                    <label class="block text-gray-700 font-medium">Aufgabe für den Benutzer:</label>
                    <textarea name="task_text" rows="3" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Geben Sie die vollständige Aufgabe ein, die der Benutzer sehen wird. Z.B.: 'Schreiben Sie eine E-Mail an...'">${taskText}</textarea>
                </div>
                <div class="space-y-2 mb-4">
                    <label class="block text-gray-700 font-medium">Erwartete Antwort (für KI-Prüfung):</label>
                    <textarea name="expected_answer_text" rows="2" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Geben Sie die erwartete Antwort oder Schlüsselwörter ein">${expectedAnswerText}</textarea>
                </div>
                <div class="space-y-2 mb-4">
                    <label class="block text-gray-700 font-medium">Anweisungen für die KI (optional):</label>
                    <textarea name="ai_instructions" rows="3" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Z.B.: 'Bewerte die Antwort nach Grammatik und Wortschatz auf B2-Niveau.'">${exerciseData.ai_instructions || ''}</textarea>
                </div>
            </div>

            <div class="space-y-2">
                <label class="block text-gray-700 font-medium">Erklärung (optional):</label>
                <textarea name="explanation" rows="2" class="w-full p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500">${explanation}</textarea>
            </div>
        </div>
    `;
}

/**
 * Обробляє зміну типу вправи, показуючи/ховаючи відповідні поля.
 */
window.exerciseTypeChanged = function(exerciseElement) {
    const selectedType = exerciseElement.querySelector('select[name="exercise_type"]').value;
    const optionsSection = exerciseElement.querySelector('.options-section');
    const expectedAnswerSection = exerciseElement.querySelector('.expected-answer-section');

    if (selectedType === 'single_choice') {
        optionsSection.style.display = 'block';
        expectedAnswerSection.style.display = 'none';
        // Ensure required for options if switching to single_choice
        optionsSection.querySelectorAll('input[name="option_text"]').forEach(input => input.required = true);
        expectedAnswerSection.querySelectorAll('textarea').forEach(textarea => textarea.required = false);
    } else if (selectedType === 'text_input') {
        optionsSection.style.display = 'none';
        expectedAnswerSection.style.display = 'block';
        // Ensure required for expected_answer_text if switching to text_input
        optionsSection.querySelectorAll('input[name="option_text"]').forEach(input => input.required = false);
        expectedAnswerSection.querySelector('textarea[name="expected_answer_text"]').required = true;
    }
    // Update the data-exercise-type attribute for serialization
    exerciseElement.dataset.exerciseType = selectedType;
};

/**
 * Додає новий варіант відповіді до вправи.
 */
window.addOptionToExercise = function(exerciseElement) {
    const optionsContainer = exerciseElement.querySelector('.options-container');
    const exId = exerciseElement.dataset.exerciseId;
    const currentOptionCount = optionsContainer.querySelectorAll('.option-item').length;
    
    const newOptionHtml = `
        <div class="flex items-center space-x-2 option-item" data-option-index="${currentOptionCount}">
            <input type="radio" name="correct_answer_index_${exId}" value="${currentOptionCount}" class="text-blue-600">
            <input type="text" name="option_text" class="w-full p-2 border rounded-lg" required placeholder="Option ${currentOptionCount + 1}" value="">
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
 * Генерує HTML-розмітку для блоку
 */
function createBlockCard(blockIndex, blockData = {}) {
    const card = document.createElement('div');
    const blockId = blockData.block_id || generateUniqueId();
    window.currentBlockIndex = Math.max(window.currentBlockIndex, blockIndex);

    card.className = "block-card bg-white p-6 rounded-xl shadow-lg border-t-8 border-blue-500/50";
    card.dataset.blockId = blockId;
    card.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h4 class="text-2xl font-bold text-gray-800">Block ${blockIndex}</h4>
            <button type="button" onclick="window.removeElement(this.closest('.block-card'))" class="text-red-600 hover:text-red-800 font-bold transition">
                ❌ Block entfernen
            </button>
        </div>

        <input type="hidden" name="block_id" value="${blockId}">

        <div class="space-y-2">
            <label class="block text-gray-700 font-semibold">Blockname (z.B. Lesen):</label>
            <input type="text" name="block_title" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${blockData.title || ''}" required placeholder="Blockname">
        </div>
        
        <div class="space-y-2">
            <label class="block text-gray-700 font-semibold">Informationen zum Block:</label>
            <textarea name="block_text" rows="3" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" required>${blockData.text || ''}</textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="space-y-2">
                <label class="block text-gray-700 font-semibold">Zeit für den Block (Min):</label>
                <input type="number" name="block_time" class="block-duration-input w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${blockData.time || '10'}" min="1" required>
            </div>
            <div class="space-y-2">
                <label class="block text-gray-700 font-semibold">Punkte zum Bestehen:</label>
                <input type="number" name="block_points_to_pass" class="w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500" value="${blockData.points_to_pass || '1'}" min="0" required>
            </div>
            <div class="space-y-2 bg-blue-50 p-3 rounded-lg">
                <label class="block text-gray-700 font-semibold">Gesamtpunkte im Block:</label>
                <span name="block_points_display" class="text-2xl font-bold text-blue-700 block">0</span>
            </div>
        </div>

        <div class="teils-list space-y-4 border-t pt-4 mt-4">
            <h5 class="text-xl font-bold text-gray-700">Liste der Teile (Teils)</h5>
            ${(blockData.teils || []).map((teilData, teilIdx) => createTeilCard(blockId, teilIdx + 1, teilData).outerHTML).join('')}
        </div>
        
        <div class="mt-4 text-center">
            <button type="button" onclick="addTeilToBlock(this.closest('.block-card'))" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-full transition duration-150 shadow-md text-sm">
                ➕ Teil zum Block hinzufügen
            </button>
        </div>
    `;
    return card;
}

/**
 * Генерує HTML-розмітку для частини (Teil)
 */
function createTeilCard(blockId, teilIndex, teilData = {}) {
    const card = document.createElement('div');
    const teilId = teilData.teil_id || generateUniqueId();

    const exercisesHtml = (teilData.exercises || []).reduce((html, exData, exIdx) => {
        const exerciseHtml = createExerciseHtml(teilId, exIdx + 1, exData);
        const dividerHtml = `
            <div class="add-exercise-divider text-center my-2">
                <button type="button" onclick="addExerciseAfter(this)" class="bg-green-200 hover:bg-green-300 text-green-800 font-bold py-1 px-3 rounded-full text-xs transition">
                    ➕ Übung hier hinzufügen
                </button>
            </div>
        `;
        return html + exerciseHtml + dividerHtml;
    }, '');

    card.className = "teil-card bg-gray-100 p-4 rounded-lg border border-gray-300";
    card.dataset.teilId = teilId;
    card.innerHTML = `
        <div class="flex justify-between items-center mb-3 border-b pb-2">
            <h5 class="text-lg font-semibold text-gray-700">Teil ${teilIndex}</h5>
            <button type="button" onclick="window.removeElement(this.closest('.teil-card'))" class="text-red-500 hover:text-red-700 transition">
                ❌ Teil entfernen
            </button>
        </div>

        <input type="hidden" name="teil_id" value="${teilId}">

        <div class="space-y-2">
            <label class="block text-gray-700 font-medium">Teil-Name (z.B. Teil 1):</label>
            <input type="text" name="teil_name" class="w-full p-2 border rounded-lg" value="${teilData.name || ''}" required>
        </div>
        
        <div class="space-y-2">
            <label class="block text-gray-700 font-medium">Informationen zum Teil:</label>
            <textarea name="teil_text" rows="2" class="w-full p-2 border rounded-lg">${teilData.text || ''}</textarea>
        </div>

        <div class="space-y-2">
            <label class="block text-gray-700 font-medium">Punkte für den Teil (automatisch):</label>
            <span name="teil_points_display" class="text-lg font-bold text-blue-600 p-2 block">${teilData.points || '0'}</span>
            <input type="hidden" name="teil_points" value="${teilData.points || '0'}">
        </div>

        <div class="exercises-list border-t pt-4 mt-4">
            <h6 class="text-md font-bold text-gray-600 border-b pb-2 mb-2">Übungen</h6>
            ${exercisesHtml}
        </div>
        
        <div class="mt-3 text-center">
            <button type="button" onclick="addExerciseToTeil(this.closest('.teil-card'))" class="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-4 rounded-full transition duration-150 shadow-sm text-xs">
                ➕ Übung hinzufügen (am Ende)
            </button>
        </div>
    `;
    return card;
}


/**
 * Додає новий блок.
 */
function addBlock(blockData = {}) {
    window.currentBlockIndex = (window.currentBlockIndex || 0) + 1;
    const card = createBlockCard(window.currentBlockIndex, blockData);
    elements.blocksContainer.appendChild(card);
    
    // Якщо створюємо новий блок, додаємо в нього один порожній Teil
    if (!blockData.teils || blockData.teils.length === 0) {
        addTeilToBlock(card);
    }

    updateTotalDuration();
    updateAllPoints();
}

/**
 * Додає новий Teil до певного блоку.
 */
window.addTeilToBlock = function(blockCard) {
    const teilsList = blockCard.querySelector('.teils-list');
    if (!teilsList) return; // Guard against missing element
    const blockId = blockCard.dataset.blockId;
    const currentTeilCount = teilsList.querySelectorAll('.teil-card').length;
    
    const teilCard = createTeilCard(blockId, currentTeilCount + 1, {});
    teilsList.appendChild(teilCard);

    // Додаємо одну вправу до нового Teil
    addExerciseToTeil(teilCard);
    updateAllPoints();
};

/**
 * Додає нову вправу до певного Teil.
 */
window.addExerciseToTeil = function(teilCard) {
    const exercisesList = teilCard.querySelector('.exercises-list');
    if (!exercisesList) return;
    const teilId = teilCard.dataset.teilId;
    
    const newExerciseHtml = createExerciseHtml(teilId, 0, {}); // Index will be fixed by updateAllPoints
    const newDividerHtml = `
        <div class="add-exercise-divider text-center my-2">
            <button type="button" onclick="addExerciseAfter(this)" class="bg-green-200 hover:bg-green-300 text-green-800 font-bold py-1 px-3 rounded-full text-xs">
                ➕ Übung hier hinzufügen
            </button>
        </div>
    `;

    exercisesList.insertAdjacentHTML('beforeend', newExerciseHtml + newDividerHtml);
    updateAllPoints();
};

/**
 * Додає нову вправу після існуючої.
 */
window.addExerciseAfter = function(buttonElement) {
    const teilCard = buttonElement.closest('.teil-card');
    if (!teilCard) return;
    const teilId = teilCard.dataset.teilId;
    const dividerElement = buttonElement.parentElement; // This is the div.add-exercise-divider

    // Create new exercise HTML. Index will be fixed by updateAllPoints.
    const newExerciseHtmlString = createExerciseHtml(teilId, 0, {});
    const newDividerHtmlString = `
        <div class="add-exercise-divider text-center my-2">
            <button type="button" onclick="addExerciseAfter(this)" class="bg-green-200 hover:bg-green-300 text-green-800 font-bold py-1 px-3 rounded-full text-xs">
                ➕ Додати Вправу Тут
            </button>
        </div>
    `;
    
    // Insert the new exercise HTML string after the clicked divider
    dividerElement.insertAdjacentHTML('afterend', newExerciseHtmlString);

    // Get a reference to the newly inserted exercise element
    // This assumes the new exercise is the immediate next sibling after the divider
    const newExerciseElement = dividerElement.nextElementSibling;

    // Insert the new divider HTML string after the new exercise element
    if (newExerciseElement) {
        newExerciseElement.insertAdjacentHTML('afterend', newDividerHtmlString);
    }
    
    updateAllPoints();
};

/**
 * Оновлює загальну тривалість тесту на основі тривалостей частин.
 */
function updateTotalDuration() {
    let totalMinutes = 0;
    document.querySelectorAll('.block-duration-input').forEach(input => {
        totalMinutes += parseInt(input.value, 10) || 0;
    });
    const totalDurationInput = document.getElementById('duration-minutes');
    if (totalDurationInput) {
        totalDurationInput.value = totalMinutes;
    }
}

/**
 * Оновлює всі бали в формі.
 */
function updateAllPoints() {
    let totalTestPoints = 0;
    let exerciseCounter = 0;

    document.querySelectorAll('.block-card').forEach(blockCard => {
        let totalBlockPoints = 0;

        blockCard.querySelectorAll('.teil-card').forEach(teilCard => {
            let totalTeilPoints = 0;
            teilCard.querySelectorAll('.exercise-item').forEach(exerciseItem => {
                exerciseCounter++;
                // Оновлюємо наскрізний номер вправи
                const exerciseTitle = exerciseItem.querySelector('h5');
                if (exerciseTitle) {
                    exerciseTitle.textContent = `Übung ${exerciseCounter}`;
                }

                const pointsInput = exerciseItem.querySelector('input[name="exercise_points"]');
                totalTeilPoints += parseInt(pointsInput.value, 10) || 0;
            });

            // Оновлюємо бали для Teil
            const teilPointsDisplay = teilCard.querySelector('span[name="teil_points_display"]');
            const teilPointsInput = teilCard.querySelector('input[name="teil_points"]');
            if (teilPointsDisplay) teilPointsDisplay.textContent = totalTeilPoints;
            if (teilPointsInput) teilPointsInput.value = totalTeilPoints;

            totalBlockPoints += totalTeilPoints;
        });

        // Оновлюємо бали для Block
        const blockPointsDisplay = blockCard.querySelector('span[name="block_points_display"]');
        if (blockPointsDisplay) {
            blockPointsDisplay.textContent = totalBlockPoints;
        }
        
        totalTestPoints += totalBlockPoints;
    });

    // Тут можна оновити загальну кількість балів за тест, якщо є відповідне поле
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
        title: form.querySelector('#test-title').value.trim() || "Unbenannter Test",
        duration_minutes: parseInt(form.querySelector('#duration-minutes').value, 10),
        passing_score_points: parseInt(form.querySelector('#passing-score').value, 10),
        questions_total: 0, // Виправлено з exercises_total на questions_total
        blocks: [],
        userId: window.userId // Зберігаємо ID користувача, який створив тест
    };

    const blockCards = form.querySelectorAll('.block-card');
    
    blockCards.forEach(blockCard => {
        const blockId = blockCard.dataset.blockId;
        const block = {
            block_id: blockId,
            title: blockCard.querySelector('input[name="block_title"]').value.trim(),
            text: blockCard.querySelector('textarea[name="block_text"]').value.trim(),
            time: parseInt(blockCard.querySelector('input[name="block_time"]').value, 10) || 0,
            points_to_pass: parseInt(blockCard.querySelector('input[name="block_points_to_pass"]').value, 10) || 0,
            teils: []
        };

        const teilCards = blockCard.querySelectorAll('.teil-card');
        teilCards.forEach(teilCard => {
            const teilId = teilCard.dataset.teilId;
            const teil = {
                teil_id: teilId,
                name: teilCard.querySelector('input[name="teil_name"]').value.trim(),
                text: teilCard.querySelector('textarea[name="teil_text"]').value.trim(),
                points: parseInt(teilCard.querySelector('input[name="teil_points"]').value, 10) || 0,
                exercises: []
            };

            // Збір вправ
            teilCard.querySelectorAll('.exercise-item').forEach(exItem => {
                const exId = exItem.dataset.exerciseId;
                const exerciseType = exItem.querySelector('select[name="exercise_type"]').value;
                const exerciseText = exItem.querySelector('textarea[name="exercise_text"]').value.trim();
                const explanation = exItem.querySelector('textarea[name="explanation"]').value.trim();
                const taskText = exItem.querySelector('textarea[name="task_text"]').value.trim(); // Отримуємо текст завдання
                const points = parseInt(exItem.querySelector('input[name="exercise_points"]').value, 10) || 0;

                let exercise = {
                    id: exId,
                    text: exerciseText,
                    type: exerciseType,
                    points: points,
                    task_text: taskText, // Зберігаємо текст завдання
                    explanation: explanation,
                    stimuli: {}
                };

                // Збір стимулів-текстів
                exercise.stimuli.texts = [];
                exItem.querySelectorAll('.text-stimulus-item textarea[name="stimulus_content"]').forEach(textarea => {
                    exercise.stimuli.texts.push({
                        id: textarea.dataset.stimulusId || generateUniqueId(),
                        content: textarea.value.trim()
                    });
                });
                if (exercise.stimuli.texts.length === 0) delete exercise.stimuli.texts;

                // Збір стимулів-аудіо
                exercise.stimuli.audios = [];
                exItem.querySelectorAll('input[name="stimulus_audio_url"]').forEach(input => {
                    if (input.value.trim()) {
                        exercise.stimuli.audios.push({
                            id: generateUniqueId(),
                            url: input.value.trim()
                        });
                    }
                });
                if (exercise.stimuli.audios?.length === 0) delete exercise.stimuli.audios;

                // Збір стимулів-зображень
                exercise.stimuli.images = [];
                exItem.querySelectorAll('input[name="stimulus_image_url"]').forEach(input => {
                    if (input.value.trim()) {
                        exercise.stimuli.images.push({
                            id: generateUniqueId(),
                            url: input.value.trim()
                        });
                    }
                });
                if (exercise.stimuli.images?.length === 0) delete exercise.stimuli.images;

                if (Object.keys(exercise.stimuli).length === 0) {
                    delete exercise.stimuli;
                }

                if (exerciseType === 'single_choice') {
                    const optionsTexts = Array.from(exItem.querySelectorAll('.options-container input[name="option_text"]')).map(t => t.value.trim());
                    const correctRadio = exItem.querySelector(`input[name="correct_answer_index_${exId}"]:checked`);
                    
                    exercise.options = optionsTexts;
                    exercise.correct_answer_index = correctRadio ? parseInt(correctRadio.value, 10) : null;

                    if (exercise.text && optionsTexts.filter(t => t).length >= 1 && exercise.correct_answer_index !== null) {
                         teil.exercises.push(exercise);
                         test.questions_total++;
                    }
                } else if (exerciseType === 'text_input') {
                    const expectedAnswerText = exItem.querySelector('textarea[name="expected_answer_text"]').value.trim();
                    const aiInstructions = exItem.querySelector('textarea[name="ai_instructions"]').value.trim();
                    exercise.expected_answer_text = expectedAnswerText;
                    exercise.ai_instructions = aiInstructions;

                    if (exercise.text && exercise.expected_answer_text) {
                        teil.exercises.push(exercise);
                        test.questions_total++;
                    }
                }
            });

            if (teil.exercises.length > 0) {
                block.teils.push(teil);
            }
        });

        if (block.teils.length > 0) {
            test.blocks.push(block);
        }
    });
    
    return test;
}

/**
 * Обробляє подання форми, зберігаючи дані у Firestore.
 */
async function handleSubmit(event) {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    // Скидаємо прапорець, оскільки дані будуть збережені
    isFormDirty = false;

    event.preventDefault();
    showMessage("Speichervorgang gestartet...", 'success');

    if (!window.db || !window.isAuthReady) {
        showMessage("Bitte warten, bis Firebase initialisiert ist...", 'error');
        return;
    }

    // Спробуємо активувати мережу, якщо вона раптом "заснула"
    try {
        await enableNetwork(window.db);
    } catch (e) {
        console.warn("Could not enable network, might be already online.", e);
    }

    try {
        showMessage("1/3: Daten aus dem Formular sammeln und validieren...", 'success');
        const testObject = serializeFormToTestObject(event.target);

        if (testObject.questions_total === 0) {
            showMessage("Bitte fügen Sie dem Test mindestens eine Übung hinzu.", 'error');
            return;
        }

        showMessage(`2/3: Daten gesammelt. ${testObject.blocks.length} Blöcke und ${testObject.questions_total} Übungen gefunden.`, 'success');

        const testId = testObject.test_id;
        const docRef = doc(window.db, `artifacts/${appId}/public/data/tests`, testId);
        
        showMessage(`3/3: Daten werden an Firebase gesendet...`, 'success');
        // Зберігаємо об'єкт тесту у Firestore
        await setDoc(docRef, testObject, { merge: true });
        
        event.target.dataset.testId = testId; // Оновлюємо ID форми, якщо це був новий тест
        if (elements.pageTitle) {
            elements.pageTitle.textContent = `Test bearbeiten: ${testObject.title}`;
        }

        showMessage(`✅ Fertig! Test "${testObject.title}" erfolgreich in Firebase gespeichert.`, 'success');

        // Очищаємо localStorage, оскільки тепер використовуємо URL-параметр для редагування
        localStorage.removeItem('b2_test_to_edit'); 

        // Перенаправляємо на головну сторінку через 2 секунди
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error("Помилка при збереженні тесту:", error);
        showMessage(`Fehler beim Speichern des Tests: ${error.message}`, 'error');
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
    
    try {
        await enableNetwork(window.db);
    } catch (e) {
        console.warn("Could not enable network, might be already online.", e);
    }

    try {
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const testToEdit = docSnap.data();
            
            // --- Конвертація старого формату (якщо потрібно) ---
            if (testToEdit.parts && !testToEdit.blocks) {
                showMessage("Altes Testformat wird konvertiert...", 'success');
                testToEdit.blocks = testToEdit.parts.map(part => ({
                    block_id: part.part_id || generateUniqueId(),
                    title: part.title || "Konvertierter Block",
                    text: part.instruction || '',
                    time: part.duration_minutes || 10,
                    points_to_pass: part.passing_score_points || 1,
                    teils: [{
                        teil_id: generateUniqueId(),
                        name: part.title || "Hauptteil",
                        text: '',
                        points: (part.questions || []).reduce((acc, q) => acc + (q.points || 1), 0),
                        exercises: (part.questions || []).map(q => ({ ...q, points: q.points || 1 }))
                    }]
                }));
                delete testToEdit.parts;
            }

            // --- Заповнення форми ---
            elements.form.dataset.testId = testId;
            if (elements.pageTitle) {
                elements.pageTitle.textContent = `Test bearbeiten: ${testToEdit.title || ''}`;
            }
            document.getElementById('test-title').value = testToEdit.title || '';
            document.getElementById('duration-minutes').value = testToEdit.duration_minutes || 0;
            document.getElementById('passing-score').value = testToEdit.passing_score_points || 0;

            elements.blocksContainer.innerHTML = '';
            window.currentBlockIndex = 0; // Скидаємо лічильник

            // --- Рендеринг блоків ---
            const blocks = testToEdit.blocks || [];
            if (blocks.length > 0) {
                blocks.forEach((blockData, index) => {
                    addBlock(blockData);
                });
            } else {
                // Якщо блоків немає, додаємо один порожній
                addBlock();
            }
            
            // Оновлюємо відображення типів вправ після рендерингу
            document.querySelectorAll('.exercise-item').forEach(exItem => {
                window.exerciseTypeChanged(exItem);
            });
            
            updateTotalDuration();
            updateAllPoints(); // Рахуємо бали після завантаження
            showMessage(`Test "${testToEdit.title}" zum Bearbeiten geladen.`, 'success');

        } else {
            showMessage(`Fehler: Test mit ID ${testId} nicht gefunden. Es wird ein neuer erstellt.`, 'error');
            localStorage.removeItem('b2_test_to_edit'); 
            addBlock(); // Створюємо один порожній блок
        }
    } catch (error) {
        if (error.code === 'unavailable' && retries > 0) {
            console.warn(`Client is offline, retrying... (${retries} attempts left)`);
            setTimeout(() => loadTestForEditing(testId, retries - 1), 1000);
            return;
        }
        console.error("Error loading test from Firestore:", error);
        showMessage(`Fehler beim Laden des Tests zum Bearbeiten: ${error.message}`, 'error');
        addBlock(); // Створюємо порожній блок у випадку помилки
    }
}


// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // Перевизначаємо window.removeElement для додавання оновлення балів
    const originalRemoveElement = window.removeElement;
    window.removeElement = function(element) {
        if (element) {
            // If the element being removed is an exercise-item, also remove the following divider
            if (element.classList.contains('exercise-item')) {
                const nextSibling = element.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('add-exercise-divider')) {
                    nextSibling.remove();
                }
            }
            element.remove();
            updateAllPoints();
        }
    };

    if (elements.addBlockBtn) {
        elements.addBlockBtn.addEventListener('click', () => addBlock()); 
    }

    // Слухач для автоматичного оновлення
    if (elements.form) {
        elements.form.addEventListener('input', (e) => {
            isFormDirty = true;
            if (e.target) {
                // Оновлення тривалості
                if (e.target.classList.contains('block-duration-input')) {
                    updateTotalDuration();
                }
                // Оновлення балів
                if (e.target.name === 'exercise_points') {
                    updateAllPoints();
                }
                // Оновлення вигляду вправи при зміні типу
                if (e.target.name === 'exercise_type') {
                    window.exerciseTypeChanged(e.target.closest('.exercise-item'));
                }
            }
        });
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
        // Якщо не редагуємо, створюємо новий блок
        addBlock();
    }

    // Додаємо попередження при спробі покинути сторінку, якщо є незбережені зміни
    window.addEventListener('beforeunload', (e) => {
        if (isFormDirty) {
            e.preventDefault();
            e.returnValue = 'Ihre Änderungen wurden möglicherweise nicht gespeichert.'; // Для сумісності
            return 'Ihre Änderungen wurden möglicherweise nicht gespeichert.';
        }
    });
});