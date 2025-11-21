import { geminiModel } from "../firebase/config";

/**
 * Sends a prompt to the Gemini AI model to get an explanation/verification for a text input answer.
 * @param {string} taskText - The text of the task/question for the user.
 * @param {string} userAnswer - The user's provided answer.
 * @param {string} expectedAnswerText - The expected correct answer or key points.
 * @param {string} [aiInstructions] - Optional additional instructions for the AI.
 * @returns {Promise<string>} - A promise that resolves with the AI's explanation.
 */
export async function getAIExplanation(taskText, userAnswer, expectedAnswerText, aiInstructions = '') {
    // Цей промпт скопійовано та адаптовано з логіки indexAI.html
    // Він більш деталізований і дає ШІ чіткіші інструкції.
    const prompt = `
        Du bist ein hilfreicher KI-Assistent zur Überprüfung von B2-Deutschprüfungsantworten.
        Dein Ziel ist es, eine klare, konstruktive und ermutigende Bewertung auf Deutsch zu geben.

        Analysiere die Antwort des Benutzers basierend auf der gestellten Frage und dem erwarteten Lösungsschlüssel.

        **Bewertungskriterien:**
        1.  **Genauigkeit:** Stimmt die Antwort des Benutzers mit den Kernpunkten der erwarteten Antwort überein?
        2.  **Vollständigkeit:** Werden alle Teile der Frage beantwortet?
        3.  **Grammatik und Wortschatz:** Kommentiere kurz das Sprachniveau, wenn es für die Aufgabe relevant ist (insbesondere bei Schreibaufgaben).

        **Dein Antwortformat:**
        - Beginne mit einem klaren Urteil: "Richtig", "Teilweise richtig" oder "Falsch".
        - Gib eine prägnante Erklärung.
        - Wenn die Antwort falsch oder teilweise richtig ist, erkläre den Fehler und gib die richtige Version oder wichtige Informationen an.
        - Behalte einen unterstützenden und freundlichen Ton bei.

        Task: "${taskText}"
        User's Answer: "${userAnswer}"
        Expected Answer: "${expectedAnswerText}"
        ${aiInstructions ? `Additional Instructions: "${aiInstructions}"` : ''}

        Bewertung:
    `;

    try {
        const result = await geminiModel.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Error getting AI explanation:", error);
        return "Entschuldigung, beim Abrufen der Erklärung von der KI ist ein Fehler aufgetreten.";
    }
}
