import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// TODO: Add your API key
const API_KEY = "YOUR_API_KEY";

const genAI = new GoogleGenerativeAI(API_KEY);

export async function run(prompt) {
  try {
    // For text-only input, use the gemini-pro model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error in run function:", error);
    return `Помилка: Не вдалося отримати відповідь від AI. ${error.message}`;
  }
}