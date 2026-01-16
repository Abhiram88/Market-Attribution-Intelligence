
import { GoogleGenAI, Type } from "@google/genai";
import { EventCandidate, Reg30EventFamily } from "../types";

export const analyzeReg30Event = async (candidate: EventCandidate) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const systemInstruction = `
    You are an expert Indian Equity Events Analyst.
    Extract structured data from the provided corporate announcement text.
    
    EVENT FAMILY: ${candidate.event_family}
    STAGE HINT: ${candidate.stage_hint || 'None'}
    
    RULES:
    1. Summarize "what happened" in 1 plain English paragraph.
    2. Extract numeric values in Crores (CR).
    3. Identify sentiment (POSITIVE/NEGATIVE/NEUTRAL).
    4. Provide confidence (0-1) and evidence spans (<=160 chars).
  `;

  const prompt = `
    COMPANY: ${candidate.company_name} (${candidate.symbol || 'N/A'})
    SOURCE: ${candidate.source}
    RAW TEXT: ${candidate.raw_text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            confidence: { type: Type.NUMBER },
            evidence_spans: { type: Type.ARRAY, items: { type: Type.STRING } },
            extracted: {
              type: Type.OBJECT,
              properties: {
                order_value_cr: { type: Type.NUMBER },
                stage: { type: Type.STRING },
                international: { type: Type.BOOLEAN },
                new_customer: { type: Type.BOOLEAN },
                execution_years: { type: Type.NUMBER },
                conditionality: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                rating_action: { type: Type.STRING, enum: ["UPGRADE", "DOWNGRADE", "REAFFIRM"] },
                notches: { type: Type.NUMBER },
                outlook_change: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "STABLE"] },
                watch: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "STABLE"] },
                issue_value_cr: { type: Type.NUMBER },
                dilution_pct: { type: Type.NUMBER },
                discount_pct: { type: Type.NUMBER },
                use_of_funds: { type: Type.STRING },
                action_type: { type: Type.STRING, enum: ["DIVIDEND", "BUYBACK", "BONUS", "SPLIT"] },
                buyback_value_cr: { type: Type.NUMBER },
                buyback_premium_pct: { type: Type.NUMBER },
                dividend_yield_pct: { type: Type.NUMBER },
                one_off: { type: Type.BOOLEAN },
                event_subtype: { type: Type.STRING },
                reason_quality: { type: Type.STRING, enum: ["VAGUE", "CLEAR"] },
                successor_named: { type: Type.BOOLEAN },
                effective_immediate: { type: Type.BOOLEAN },
                forensic_audit: { type: Type.BOOLEAN },
                amount_cr: { type: Type.NUMBER },
                stage_legal: { type: Type.STRING },
                ops_impact: { type: Type.STRING, enum: ["YES", "NO"] }
              }
            }
          },
          required: ["summary", "sentiment", "confidence", "extracted"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Reg30 Gemini Extraction Error:", error);
    return null;
  }
};
