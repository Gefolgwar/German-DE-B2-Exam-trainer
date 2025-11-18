import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

const usersListContainer = document.getElementById("users-list-container");

async function fetchUserStats(userId) {
  const resultsRef = collection(
    db,
    `artifacts/${appId}/users/${userId}/results`
  );
  const q = query(resultsRef, orderBy("timestamp", "desc"), limit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { testsTaken: 0, lastActivity: "Немає" };
  }

  const totalSnapshot = await getDocs(collection(db, `artifacts/${appId}/users/${userId}/results`));
  const lastTest = snapshot.docs[0].data();
  
  return {
    testsTaken: totalSnapshot.size,
    lastActivity: new Date(lastTest.timestamp).toLocaleString("uk-UA"),
  };
}

async function loadUsers() {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);

  if (snapshot.empty) {
    usersListContainer.innerHTML = "<p>Користувачів не знайдено.</p>";
    return;
  }

  usersListContainer.innerHTML = ""; // Очищуємо контейнер

  for (const doc of snapshot.docs) {
    const user = doc.data();
    const userId = doc.id;
    const stats = await fetchUserStats(userId);

    const userCard = document.createElement("div");
    userCard.className = "bg-white p-4 rounded-lg shadow-md flex justify-between items-center";
    userCard.innerHTML = `
        <div>
            <div>
                <p class="font-bold text-lg">${user.email || userId}</p>
                <p class="text-sm text-gray-600">Роль: <span class="font-semibold ${user.role === 'admin' ? 'text-purple-600' : 'text-gray-700'}">${user.role || 'user'}</span></p>
            </div>
            <div class="mt-2">
                <button data-email="${user.email}" class="btn-reset-password text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded">
                    Скинути пароль
                </button>
            </div>
        </div>
        <div class="text-right">
            <p>Тестів пройдено: <span class="font-bold">${stats.testsTaken}</span></p>
            <p class="text-sm text-gray-500">Остання активність: ${stats.lastActivity}</p>
        </div>
    `;
    usersListContainer.appendChild(userCard);
  }

  // Додаємо обробники для кнопок скидання пароля
  document.querySelectorAll('.btn-reset-password').forEach(button => {
    button.addEventListener('click', async (e) => {
        const email = e.target.dataset.email;
        if (confirm(`Ви впевнені, що хочете надіслати лист для скидання пароля на ${email}?`)) {
            try {
                await sendPasswordResetEmail(auth, email);
                alert(`Лист для скидання пароля успішно надіслано на ${email}. Не забудьте перевірити спам.`);
            } catch (error) {
                console.error("Password reset error:", error);
                alert(`Не вдалося надіслати лист: ${error.message}`);
            }
        }
    });
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Перевірка, чи користувач є адміном, перш ніж завантажувати дані
    const userDocRef = doc(db, "users", user.uid);
    getDoc(userDocRef).then(userDoc => {
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            loadUsers();
        } else {
            usersListContainer.innerHTML = '<p class="text-red-600">У вас немає прав доступу до цієї сторінки.</p>';
        }
    });
  } else {
    window.location.href = "login.html";
  }
});