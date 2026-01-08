
import { GoogleGenAI, Type } from "@google/genai";
import { MarketLog, NewsAttribution, Sentiment } from "../types";
import { supabase } from "../lib/supabase";

export const analyzeMarketLog = async (log: MarketLog): Promise<NewsAttribution> => {
  // Always create a new instance right before making an API call for up-to-date key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const modelId = "gemini-3-pro-preview";

  const prompt = `
    You are a world-class senior quantitative financial analyst and macro strategist.
    
    Context for ${log.date}:
    - Nifty 50 Index (^NSEI) Close: ${log.niftyClose}
    - Nifty 50 Change: ${log.niftyChange > 0 ? '+' : ''}${log.niftyChange} points (${log.niftyChangePercent}%)
    - NASDAQ Composite (^IXIC) Change: ${log.nasdaqChangePercent}%
    - GIFT Nifty: ${log.giftNiftyClose}
    
    CRITICAL TASK:
    Perform an exhaustive, multi-layered causal attribution analysis. 
    
    1. SEARCH: Use Google Search to find the most significant financial developments affecting Indian markets on ${log.date}. Specifically look for:
       - Geopolitical escalations (trade wars, tariff threats, conflicts).
       - Global macro data (Fed comments, US inflation, Treasury yields).
       - Institutional flows (FII/DII net data).
       - Sector-specific shocks (Metal, IT, Energy, Banking).
    
    2. REASON: Use your thinking capabilities to connect these events to the ${log.niftyChangePercent}% move in the Nifty 50.
    
    3. SUMMARY: Provide a COMPREHENSIVE and DETAILED analysis. 
       - Aim for at least 250 words.
       - Do NOT truncate. 
       - Mention specific stock names (e.g., Hindalco, ONGC, TCS) and their price movements if relevant.
       - Include FII outflow/inflow figures if available.
       - Explain the "Why" behind the "What".
    
    4. HEADLINE: Create a factual, heavy-hitting headline summarizing the core narrative.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 4000 },
        maxOutputTokens: 8000, // Ensure there's plenty of room for the full summary
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "Detailed summary headline" },
            summary: { type: Type.STRING, description: "Full exhaustive professional summary (minimum 250 words)" },
            category: { type: Type.STRING, enum: ["Macro", "Global", "Corporate", "Geopolitical"] },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            relevanceScore: { type: Type.NUMBER, description: "Relevance score from 0 to 1" }
          },
          required: ["headline", "summary", "category", "sentiment", "relevanceScore"]
        }
      }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri,
      title: chunk.web?.title
    })).filter((s: any) => s.uri) || [];

    const result = JSON.parse(response.text || "{}");
    const attribution: NewsAttribution = {
      headline: result.headline || "Market Dynamic Analysis",
      summary: result.summary || "Detailed analysis is being compiled from real-time financial telemetry.",
      category: (result.category as any) || "Macro",
      sentiment: (result.sentiment as any) || 'NEUTRAL',
      relevanceScore: result.relevanceScore || 1.0,
      sources
    };

    const payload = {
      market_log_id: log.id,
      headline: attribution.headline,
      summary: attribution.summary,
      category: attribution.category,
      sentiment: attribution.sentiment,
      relevance_score: attribution.relevanceScore
    };

    const { data: existing } = await supabase
      .from('news_attribution')
      .select('id')
      .eq('market_log_id', log.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('news_attribution').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('news_attribution').insert(payload);
    }

    return attribution;
  } catch (error: any) {
    console.error("Gemini Analysis Pipeline Error:", error);
    if (error.message?.includes("Requested entity was not found")) {
      // This might indicate an API key issue, handled by the UI refresh logic
      throw new Error("API_KEY_ERROR");
    }
    throw error;
  }
};
