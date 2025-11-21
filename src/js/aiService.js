import { geminiModel } from "../firebase/config";

/**
 * Sends a prompt to the Gemini AI model to get an explanation/verification for a text input answer.
 * @param {string} questionText - The text of the question.
 * @param {string} userAnswer - The user's provided answer.
 * @param {string} expectedAnswerText - The expected correct answer or key points.
 * @param {string} [aiInstructions] - Optional additional instructions for the AI.
 * @returns {Promise<string>} - A promise that resolves with the AI's explanation.
 */
export async function getAIExplanation(questionText, userAnswer, expectedAnswerText, aiInstructions = '') {
    // Цей промпт скопійовано та адаптовано з логіки indexAI.html
    // Він більш деталізований і дає ШІ чіткіші інструкції.
    const prompt = `
        You are a helpful AI assistant for checking B2 German exam answers.
        Your goal is to provide a clear, constructive, and encouraging evaluation in Ukrainian.

        Analyze the user's answer based on the provided question and the expected answer key.

        **Evaluation Criteria:**
        1.  **Accuracy:** Does the user's answer match the key points in the expected answer?
        2.  **Completeness:** Are all parts of the question answered?
        3.  **Grammar and Vocabulary:** Briefly comment on the language level if it's relevant to the task (especially for writing tasks).

        **Your response format:**
        - Start with a clear verdict: "Правильно", "Частково правильно", or "Неправильно".
        - Provide a concise explanation.
        - If the answer is incorrect or partially correct, explain the mistake and provide the correct version or key information.
        - Maintain a supportive and friendly tone.

        Question: "${questionText}"
        User's Answer: "${userAnswer}"
        Expected Answer: "${expectedAnswerText}"
        ${aiInstructions ? `Additional Instructions: "${aiInstructions}"` : ''}

        Evaluation:
    `;

    try {
        const result = await geminiModel.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Error getting AI explanation:", error);
        return "Вибачте, сталася помилка під час отримання пояснення від ШІ.";
    }
}
