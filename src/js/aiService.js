import { geminiModel } from "../firebase/config";

/**
 * Sends a prompt to the Gemini AI model to get an explanation/verification for a text input answer.
 * @param {string} questionText - The text of the question.
 * @param {string} userAnswer - The user's provided answer.
 * @param {string} expectedAnswerText - The expected correct answer or key points.
 * @returns {Promise<string>} - A promise that resolves with the AI's explanation.
 */
export async function getAIExplanation(questionText, userAnswer, expectedAnswerText) {
    const prompt = `
        You are an AI assistant designed to evaluate user answers for B2 German exam questions.
        The user provided the following question and their answer. You also have the expected answer.
        Your task is to:
        1. Compare the user's answer with the expected answer.
        2. Provide constructive feedback on the user's answer, highlighting strengths and weaknesses.
        3. If the user's answer is incorrect, explain why and provide the correct information based on the expected answer.
        4. If the user's answer is correct, confirm it and offer additional insights if possible.
        5. Keep the explanation concise and directly related to the question and answers.
        6. Respond in Ukrainian.

        Question: "${questionText}"
        User's Answer: "${userAnswer}"
        Expected Answer: "${expectedAnswerText}"

        Please provide your evaluation and explanation:
    `;

    try {
        const result = await geminiModel.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Error getting AI explanation:", error);
        return "Вибачте, сталася помилка під час отримання пояснення від ШІ.";
    }
}
