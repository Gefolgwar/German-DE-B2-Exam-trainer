import { collection, query, onSnapshot, orderBy, where, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const elements = {
    historyListContainer: document.getElementById('history-list-container'),
    startDateInput: document.getElementById('start-date'),
    endDateInput: document.getElementById('end-date'),
    applyFilterBtn: document.getElementById('apply-filter-btn'),
    resetFilterBtn: document.getElementById('reset-filter-btn'),
    sortByTitleBtn: document.getElementById('sort-by-title-btn'),
    sortTitleIcon: document.getElementById('sort-title-icon'),
    sortByDateBtn: document.getElementById('sort-by-date-btn'),
    progressChart: document.getElementById('progress-chart'),
    testTitleFilter: document.getElementById('test-title-filter'),
};

/**
 * Стан сортування
 */
let progressChartInstance = null;

/**
 * Зберігає активну функцію відписки від onSnapshot.
 */
let unsubscribeFromHistory = null;

/**
 * Стан сортування
 */
let currentSort = {
    field: 'timestamp',
    direction: 'desc'
};
/**
 */
window.deleteReport = async (reportId) => {
    if (!confirm('Ви впевнені, що хочете видалити цей звіт?')) return;
    if (!window.db || !window.userId) {
        alert('Помилка: Firebase не ініціалізовано або користувач не авторизований.');
        return;
    }

    try {
        const reportRef = doc(window.db, `artifacts/${appId}/users/${window.userId}/results`, reportId);
        await deleteDoc(reportRef);
        // alert('Звіт успішно видалено!'); // Можна прибрати, бо список оновиться автоматично
        loadUserHistory(elements.startDateInput.value, elements.endDateInput.value);
    } catch (error) {
        console.error('Помилка видалення звіту:', error);
        alert('Помилка при видаленні звіту: ' + error.message);
    }
};

/**
 * Форматує час у зручний для читання формат (Х год Х хв Х с).
 * @param {number} seconds - Час у секундах.
 * @returns {string} - Рядок у форматі '1 год 15 хв' або '30 с'.
 */
function formatTime(totalSeconds) {
    const seconds = Math.round(totalSeconds);
    if (seconds < 0) seconds = 0;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(remainingSeconds).padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    } else if (minutes > 0) {
        return `${minutes}:${paddedSeconds}`;
    }

    return `0:${paddedSeconds}`;
}

/**
 * Відображає графік прогресу користувача.
 * @param {Array} historyItems - Масив об'єктів історії.
 */
function renderProgressChart(historyItems) {
    if (!elements.progressChart || typeof Chart === 'undefined') {
        console.warn('Елемент canvas для графіка не знайдено або бібліотека Chart.js не завантажена.');
        return;
    }

    // Знищуємо попередній екземпляр графіка, якщо він існує
    if (progressChartInstance) {
        progressChartInstance.destroy();
    }

    // Сортуємо дані за датою за зростанням для коректного відображення на графіку
    const sortedItems = [...historyItems].sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return dateA - dateB;
    });

    const labels = sortedItems.map(item => {
        const dateObject = item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
        return dateObject.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    });

    const data = sortedItems.map(item => {
        const totalQuestions = item.totalExercises > 0 ? item.totalExercises : 1;
        const correctPoints = item.correctPoints ?? 0;
        return ((correctPoints / totalQuestions) * 100).toFixed(1);
    });

    const ctx = elements.progressChart.getContext('2d');
    progressChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Середній % правильних відповідей',
                data: data,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2,
                tension: 0.3, // Робить лінію плавнішою
                pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                pointRadius: 4,
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) { return value + '%' }
                    }
                }
            }
        }
    });
}

/**
 * Відображає історію проходжень тестів.
 * @param {Array} historyItems - Масив об'єктів історії.
 */
function renderHistory(historyItems) {
    if (!elements.historyListContainer) return;
    let historyHtml = '';
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) loadingMessage.style.display = 'none';

    if (historyItems.length === 0) {
        historyHtml = `<div class="p-10 text-center bg-yellow-50 border-2 border-yellow-200 text-yellow-800 rounded-2xl shadow-inner">
            <p class="text-xl font-semibold mb-2">Немає результатів 😔</p>
            <p class="text-gray-600">Ви ще не завершили жодного тесту або не знайдено результатів за обраними фільтрами.</p>
        </div>`;
    } else {
        historyItems.forEach((item) => {
            let dateObject = null;
            let dateString = 'Невідома дата';

            // --- Надійне визначення дати ---
            if (item.timestamp) {
                if (item.timestamp.toDate) {
                    dateObject = item.timestamp.toDate();
                } else if (item.timestamp.seconds) {
                    dateObject = new Date(item.timestamp.seconds * 1000);
                } else if (typeof item.timestamp === 'string' || typeof item.timestamp === 'number') {
                    dateObject = new Date(item.timestamp);
                }
            }

            if (dateObject instanceof Date && !isNaN(dateObject)) {
                dateString = dateObject.toLocaleString('uk-UA', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit' // Зменшено деталізацію до хвилин для компактності
                });
            }
            // ---------------------------------

            const totalQuestions = item.totalExercises || 1;
            const correctPoints = item.correctPoints || 0;
            const percent = ((correctPoints / totalQuestions) * 100).toFixed(0);
            const passingScore = item.passingScore || 70;
            const isPassed = parseInt(percent) >= passingScore;

            const borderClass = isPassed ? 'border-green-500' : 'border-red-500';
            const scoreBgClass = isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            const scoreText = isPassed ? 'Пройдено' : 'Не пройдено';
            const scoreIcon = isPassed ? '✅' : '❌';


            // --- ОНОВЛЕНИЙ HTML КАРТКИ (КОМПАКТНА ВЕРСІЯ) ---
            historyHtml += `
                <div class="bg-white p-4 rounded-xl shadow-md border-l-4 ${borderClass} flex justify-between items-center hover:shadow-lg transition duration-200">
                    
                    <div class="flex-1 min-w-0 pr-4"> 
                        
                        <h3 class="text-lg font-bold text-blue-800 truncate mb-1" title="${item.testTitle || 'Невідомий тест'}">
                            ${item.testTitle || 'Невідомий тест'}
                        </h3>
                        
                        <div class="flex flex-wrap items-center text-sm text-gray-600 gap-x-3 gap-y-1">
                            
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBgClass}">
                                ${percent}% (${correctPoints}/${totalQuestions})
                            </span>
                            
                            <span class="text-xs text-gray-500">
                                ⏱️ ${formatTime(item.timeSpentSeconds || 0)}
                            </span>

                            <span class="text-xs font-semibold ${isPassed ? 'text-green-600' : 'text-red-600'}">
                                ${scoreIcon} ${scoreText}
                            </span>
                        </div>
                        
                        <p class="text-sm text-gray-400 mt-2">
                            🗓️ <span class="font-medium text-gray-600">${dateString}</span>
                        </p>
                    </div>

                    <div class="flex flex-col gap-2 ml-4">
                        <a href="results-page.html?resultId=${item.id}" 
                           class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs shadow-md text-center transition duration-200 w-24">
                           Звіт
                        </a>
                        <button onclick="deleteReport('${item.id}')"
                                class="bg-red-500 hover:bg-red-600 text-white font-semibold py-1.5 px-3 rounded-lg text-xs shadow-md transition duration-200 w-24">
                            Видалити
                        </button>
                    </div>
                </div>`;
            // ----------------------------------------------------
        });
    }
    elements.historyListContainer.innerHTML = historyHtml;
}

/**
 * Завантажує історію проходжень тестів поточного користувача з Firestore.
 */
async function loadUserHistory(startDate, endDate, sortBy = currentSort.field, sortDir = currentSort.direction) {
    // Скасовуємо попередню підписку, якщо вона існує, щоб уникнути множинних слухачів.
    if (unsubscribeFromHistory) {
        unsubscribeFromHistory();
        unsubscribeFromHistory = null; // Скидаємо змінну
    }

    const loadingHtml = `<div id="loading-message" class="text-center p-12 bg-white rounded-xl shadow-2xl border-t-4 border-blue-500 text-gray-600 font-medium">
          <svg class="animate-spin h-6 w-6 text-blue-500 inline-block mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Завантаження історії проходжень...
        </div>`;
    elements.historyListContainer.innerHTML = loadingHtml;

    if (!window.db || !window.isAuthReady || !window.userId) {
        setTimeout(() => loadUserHistory(startDate, endDate), 500);
        return;
    }

    const historyRef = collection(window.db, `artifacts/${appId}/users/${window.userId}/results`);
    let q = query(historyRef, orderBy(sortBy, sortDir));

    // Створюємо нового слухача і зберігаємо функцію для його скасування.
    unsubscribeFromHistory = onSnapshot(q, (snapshot) => {
        let historyItems = [];
        snapshot.forEach(doc => historyItems.push({ id: doc.id, ...doc.data() }));

        // Якщо задано фільтр по датах, фільтруємо по даті картки (рік-місяць-день, локальний час)
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate + 'T00:00:00') : null;
            const end = endDate ? new Date(endDate + 'T00:00:00') : null;
            historyItems = historyItems.filter(item => {
                let dateObj = null;
                if (item.timestamp) {
                    if (item.timestamp.toDate) {
                        dateObj = item.timestamp.toDate();
                    } else if (item.timestamp.seconds) {
                        dateObj = new Date(item.timestamp.seconds * 1000);
                    } else if (typeof item.timestamp === 'string' || typeof item.timestamp === 'number') {
                        dateObj = new Date(item.timestamp);
                    }
                }
                if (!dateObj) return false;
                const cardDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
                let ok = true;
                if (start) ok = ok && (cardDate >= start);
                if (end) ok = ok && (cardDate <= end);
                return ok;
            });
        }

        // Фільтр за назвою тесту (нечутливий до регістру)
        const titleFilter = elements.testTitleFilter && elements.testTitleFilter.value ? elements.testTitleFilter.value.trim().toLowerCase() : '';
        if (titleFilter) {
            historyItems = historyItems.filter(item => {
                const title = (item.testTitle || '').toLowerCase();
                return title.includes(titleFilter);
            });
        }

        renderHistory(historyItems);
        renderProgressChart(historyItems);
    }, (error) => {
        console.error('Error fetching history from Firestore:', error);
        elements.historyListContainer.innerHTML = `<div class=\"p-10 text-center text-red-600 bg-red-100 rounded-2xl shadow-inner border-l-4 border-red-500\">Помилка завантаження історії: ${error.message}</div>`;
    });
}

// --- Ініціалізація ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Ініціалізація Flatpickr (перевірка наявності для уникнення помилок)
    if (typeof flatpickr !== 'undefined') {
        flatpickr('#start-date', { dateFormat: 'Y-m-d', locale: 'uk', allowInput: true, placeholder: "Оберіть початкову дату" });
        flatpickr('#end-date', { dateFormat: 'Y-m-d', locale: 'uk', allowInput: true, placeholder: "Оберіть кінцеву дату" });
    }

    // 2. Завантаження даних
    const initialLoad = () => {
        const startDate = elements.startDateInput ? elements.startDateInput.value : '';
        const endDate = elements.endDateInput ? elements.endDateInput.value : '';
        
        // Встановлюємо дати у Flatpickr при першому завантаженні (якщо вони є)
        if (elements.startDateInput && elements.startDateInput._flatpickr && startDate) {
            elements.startDateInput._flatpickr.setDate(startDate, true);
        }
        if (elements.endDateInput && elements.endDateInput._flatpickr && endDate) {
            elements.endDateInput._flatpickr.setDate(endDate, true);
        }
        
        loadUserHistory(startDate, endDate);
    }
    
    if (window.isAuthReady) {
        initialLoad();
    } else {
        window.addEventListener('firestoreReady', initialLoad);
    }

    // 3. Обробники для кнопок фільтрації
    if (elements.applyFilterBtn) {
        elements.applyFilterBtn.addEventListener('click', () => {
            loadUserHistory(elements.startDateInput.value, elements.endDateInput.value, currentSort.field, currentSort.direction);
        });
    }

    if (elements.resetFilterBtn) {
        elements.resetFilterBtn.addEventListener('click', () => {
            if (elements.startDateInput && elements.startDateInput._flatpickr) elements.startDateInput._flatpickr.clear();
            if (elements.endDateInput && elements.endDateInput._flatpickr) elements.endDateInput._flatpickr.clear();
            if (elements.testTitleFilter) elements.testTitleFilter.value = '';
            loadUserHistory(null, null, currentSort.field, currentSort.direction);
        });
    }

    // Фільтрація по назві тесту при зміні поля
    if (elements.testTitleFilter) {
        elements.testTitleFilter.addEventListener('input', () => {
            loadUserHistory(elements.startDateInput.value, elements.endDateInput.value, currentSort.field, currentSort.direction);
        });
    }

    // 4. Обробник для сортування за назвою
    if (elements.sortByTitleBtn) {
        elements.sortByTitleBtn.addEventListener('click', () => {
            if (currentSort.field === 'testTitle') {
                // Змінюємо напрямок, якщо вже сортуємо за назвою
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                // Переключаємось на сортування за назвою
                currentSort.field = 'testTitle';
                currentSort.direction = 'asc';
            }

            // Оновлюємо іконку
            if (elements.sortTitleIcon) {
                elements.sortTitleIcon.textContent = currentSort.direction === 'asc' ? '🔼' : '🔽';
            }
            loadUserHistory(elements.startDateInput.value, elements.endDateInput.value, currentSort.field, currentSort.direction);
        });
    }

    // 5. Обробник для сортування за датою (повернення до сортування за замовчуванням)
    if (elements.sortByDateBtn) {
        elements.sortByDateBtn.addEventListener('click', () => {
            if (currentSort.field === 'timestamp') {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = 'timestamp';
                currentSort.direction = 'desc'; // За замовчуванням - новіші зверху
            }

            // Можна також оновити іконку для дати, якщо вона є
            loadUserHistory(elements.startDateInput.value, elements.endDateInput.value, currentSort.field, currentSort.direction);
        });
    }
});