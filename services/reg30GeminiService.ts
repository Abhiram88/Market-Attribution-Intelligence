
import { GoogleGenAI, Type } from "@google/genai";
import { EventCandidate } from "../types";

export const analyzeReg30Event = async (candidate: EventCandidate) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const documentBody = candidate.attachment_text ? candidate.attachment_text.substring(0, 30000) : "";

  const systemInstruction = `
    You are an expert Indian equity events analyst focused on NSE Regulation 30–style disclosures and order-pipeline events.
    You ONLY summarize and extract structured data from provided text. You do NOT browse the web.

    HARD RULES:
    1) NEVER fabricate numbers or facts. If not present, output null and add the field name to missing_fields.
    2) Use only provided raw_text/attachment_text. No external sources.
    3) Provide evidence_spans (<=160 chars each) for key extractions/classifications.
    4) CURRENCY: Convert raw INR to Crore (CR). 1 CR = 10,000,000 INR.
    5) STAGE: Must be one of: "L1" | "LOA" | "WO" | "NTP" | "MOU" | "OTHER".
    6) Output MUST be STRICT JSON only.
  `;

  const prompt = `Perform a forensic extraction on this NSE disclosure:
    Company: ${candidate.company_name}
    Symbol: ${candidate.symbol}
    Source: ${candidate.source}
    Context: ${candidate.raw_text}
    
    Document Text: ${documentBody}`;

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
            symbol: { type: Type.STRING },
            company_name: { type: Type.STRING },
            event_date: { type: Type.STRING },
            event_family: { type: Type.STRING },
            summary: { type: Type.STRING },
            direction_hint: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            confidence: { type: Type.NUMBER },
            missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                rating_action: { type: Type.STRING },
                notches: { type: Type.NUMBER },
                outlook_change: { type: Type.STRING },
                amount_cr: { type: Type.NUMBER },
                stage_legal: { type: Type.STRING },
                ops_impact: { type: Type.STRING },
                customer: { type: Type.STRING }
              }
            }
          },
          required: ["summary", "direction_hint", "confidence", "extracted", "evidence_spans", "missing_fields"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Reg30 Gemini Analysis Error:", error);
    return null;
  }
};

/**
 * Generates a tactical narrative for high-impact events.
 */
export const analyzeEventNarrative = async (inputs: any): Promise<{ event_analysis_text: string; tone: string } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const systemInstruction = `
    You are a Senior Tactical Analyst for Indian Equities.
    Generate a 4-8 line narrative explaining execution risk and tactical outlook.
    Use professional neutral tone. Focus on institutional shakeout risk and near-term triggers.
    Output MUST be STRICT JSON only.
  `;

  const prompt = `
    Analyze this corporate event for tactical traders.
    
    EVENT DATA:
    Symbol: ${inputs.symbol}
    Family: ${inputs.event_family}
    Stage: ${inputs.stage}
    Value: ₹${inputs.order_value_cr} Cr
    Customer: ${inputs.customer}
    Risk Level: ${inputs.institutional_risk}
    Policy Bias: ${inputs.policy_bias}
    Tactical Plan: ${inputs.tactical_plan}
    
    TASK: Write a 4-8 line narrative (as a single paragraph or bullet-like sentences) synthesizing these factors into a cohesive tactical outlook. Do not invent prices.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            event_analysis_text: { type: Type.STRING, description: "4-8 lines max tactical narrative" },
            tone: { type: Type.STRING }
          },
          required: ["event_analysis_text", "tone"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Narrative Generation Failure:", error);
    return null;
  }
};
