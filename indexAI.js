import { geminiModel } from "./src/firebase/config.js";

export async function run(prompt) {
  try {
    if (!geminiModel) {
      throw new Error("Gemini model is not initialized.");
    }
    
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error in run function:", error);
    return `Error: Failed to get a response from AI. ${error.message}`;
  }
}