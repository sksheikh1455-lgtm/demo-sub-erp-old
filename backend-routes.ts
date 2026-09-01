import { Router } from "express";
import { GoogleGenAI } from "@google/genai";

export const backendOrchestratorRouter = Router();

backendOrchestratorRouter.post("/gemini/advice", async (req, res) => {
  const { summary } = req.body;
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "AI Insights require a Gemini API Key. Please configure VITE_GEMINI_API_KEY in the environment." });
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a financial advisor. Given this summary, provide brief actionable advice in 2-3 sentences: ${summary}`
    });
    res.json({ text: response.text || "No advice generated." });
  } catch (error: any) {
    console.error("Error getting financial advice:", error);
    res.status(500).json({ error: "Could not generate advice at this time." });
  }
});

backendOrchestratorRouter.post("/gemini/categorize", async (req, res) => {
  const { description, accounts } = req.body;
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "No API key" });
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const accountListStr = accounts.map((a: any) => `${a.id}: ${a.name} (${a.type})`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Given this transaction description: "${description}"
      And this list of accounts:
      ${accountListStr}
      
      Return ONLY the JSON object with the most appropriate accountId for this transaction: {"accountId": "the-id"}`
    });
    const text = response.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      res.json(JSON.parse(match[0]));
    } else {
      res.status(500).json({ error: "Failed to parse JSON" });
    }
  } catch (error: any) {
    console.error("Error categorizing transaction:", error);
    res.status(500).json({ error: "Failed to categorize" });
  }
});
