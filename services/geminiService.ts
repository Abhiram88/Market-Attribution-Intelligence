import { GoogleGenAI, Type } from "@google/genai";
import { MarketLog, NewsAttribution } from "../types";
import { supabase } from "../lib/supabase";

export const analyzeMarketLog = async (log: MarketLog): Promise<NewsAttribution> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const modelId = "gemini-3-pro-preview";

  const isUp = log.niftyChange >= 0;
  const direction = isUp ? "UP (BULLISH)" : "DOWN (BEARISH)";

  const prompt = `
    You are a world-class senior quantitative financial analyst.
    
    Context for ${log.date}:
    - Nifty 50 Index was ${direction} by ${Math.abs(log.niftyChange).toFixed(2)} points (${log.niftyChangePercent}%).
    
    TASK:
    Analyze the market conditions for this date using Google Search.
    Your summary MUST explain the ${direction} movement. 
    If the index fell, highlight the negative drivers. If it rose, highlight the positive drivers.
    
    Response must be professional, exhaustive (min 250 words), and include relevant sector/stock impacts.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 4000 },
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["Macro", "Global", "Corporate", "Geopolitical"] },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            relevanceScore: { type: Type.NUMBER }
          },
          required: ["headline", "summary", "category", "sentiment", "relevanceScore"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Telemetry analysis yielded no results.");

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri,
      title: chunk.web?.title
    })).filter((s: any) => s.uri) || [];

    const result = JSON.parse(text || "{}");
    
    // Forced alignment logic
    const validatedSentiment = isUp ? 'POSITIVE' : 'NEGATIVE';

    const attribution: NewsAttribution = {
      headline: result.headline || "Market Dynamics Report",
      summary: result.summary || "Attribution data stream interrupted. Re-analyzing telemetry...",
      category: (result.category as any) || "Macro",
      sentiment: validatedSentiment,
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
    console.error("Gemini Pipeline Failure:", error);
    
    const errorMsg = error?.message || "";
    if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
      throw new Error("QUOTA_EXCEEDED: The Daily Attribution Engine has reached its search limit. No more reports can be generated until tomorrow.");
    }
    
    throw error;
  }
};