# 🇩🇪 German B2 Exam Trainer

## 🌟 Project Overview

This project is an interactive tool for preparing for the **B2 level German language exam (Goethe / Telc)**. The application uses advanced **Google Vertex AI (Gemini API)** technologies for:

- Content processing and analysis.
- Generating answers and detailed explanations for test tasks.

### ⚙️ Key Technologies

| Category                | Technologies                                                                                       |
| :---------------------- | :------------------------------------------------------------------------------------------------- |
| **Frontend**            | HTML, CSS, **JavaScript** (Vite-based setup)                                                       |
| **Backend/Integration** | **Firebase** Authentication, Cloud Firestore (for data storage), Google **Vertex AI (Gemini API)** |

---

## 🚀 Local Installation and Startup

To run the project locally, make sure you have **Node.js** and **npm** installed.

### 1. Clone the Repository

Open a terminal and clone the public repository:

```bash
git clone https://github.com/Gefolgwar/German-DE-B2-Exam-trainer.git
cd German-DE-B2-Exam-trainer
```

### 2. Install Dependencies

Встановіть усі необхідні пакети, перелічені у `package.json`:

```bash
npm install
```

### 3. Environment Variables Setup (API Keys) 🔑

For the application to function correctly, Firebase API keys are required. They are not included in the repository for security reasons.

#### A. Create Configuration File

Create a .env file from the env.example template:

```bash
cp env.example .env
```

_The .env file is ignored by Git and remains local._

Open the .env file and insert your actual Firebase credentials:

```ini
# .env
VITE_FIREBASE_API_KEY="ВАШ_КЛЮЧ_З_FIREBASE_SETTINGS"
VITE_FIREBASE_AUTH_DOMAIN="..."
# ... та інші ключі
```

### 4. Run the Project

After setup, start the local development server using Vite:

```bash
npm run dev
```
