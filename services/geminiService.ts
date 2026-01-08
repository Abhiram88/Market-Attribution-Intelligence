import { GoogleGenAI, Type } from "@google/genai";
import { MarketLog, NewsAttribution, Sentiment } from "../types";
import { supabase } from "../lib/supabase";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

export const analyzeMarketLog = async (log: MarketLog): Promise<NewsAttribution> => {
  const ai = getClient();
  // Using gemini-3-pro-preview for complex financial analysis
  const modelId = "gemini-3-pro-preview";

  // Refined prompt based on user requirements
  const prompt = `
    You are a high-frequency quantitative financial analyst. 
    
    Context for ${log.date}:
    - Nifty 50 Index (^NSEI): ${log.niftyChange > 0 ? '+' : ''}${log.niftyChange} points (${log.niftyChangePercent}%)
    - NASDAQ Composite (^IXIC): ${log.nasdaqChangePercent}%
    - GIFT Nifty: ${log.giftNiftyClose}
    
    CRITICAL TASK:
    The Nifty 50 moved ${Math.abs(log.niftyChange)} points, crossing our 90-point volatility threshold.
    1. Using Google Search, identify the TOP 4 Indian financial headlines from the last 24 hours relative to ${log.date}.
    2. Analyze these headlines to determine which specific event (or combination) caused this move.
    3. Categorize the attribution (Macro, Global, Corporate, or Geopolitical).
    4. Provide a professional executive summary explaining the causal link.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "The primary headline explaining the move" },
            summary: { type: Type.STRING, description: "A summary of the top 4 headlines and their causal impact" },
            category: { type: Type.STRING, enum: ["Macro", "Global", "Corporate", "Geopolitical"] },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            relevanceScore: { type: Type.NUMBER, description: "Confidence score 0.0 to 1.0" }
          },
          required: ["headline", "summary", "category", "sentiment", "relevanceScore"]
        }
      }
    });

    // Extract search grounding sources as per mandatory guidelines
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri,
      title: chunk.web?.title
    })).filter((s: any) => s.uri) || [];

    const result = JSON.parse(response.text || "{}");
    const attribution: NewsAttribution = {
      headline: result.headline || "Market Volatility Detected",
      summary: result.summary || "Attribution engine identified significant moves based on daily financial telemetry.",
      category: (result.category as any) || "Macro",
      // Fix: Use string literal 'NEUTRAL' instead of Sentiment.NEUTRAL which is a type
      sentiment: (result.sentiment as any) || 'NEUTRAL',
      relevanceScore: result.relevanceScore || 0.5,
      sources
    };

    // PERSIST TO SUPABASE
    const { error } = await supabase
      .from('news_attribution')
      .upsert({
        market_log_id: log.id,
        headline: attribution.headline,
        summary: attribution.summary,
        category: attribution.category,
        sentiment: attribution.sentiment,
        relevance_score: attribution.relevanceScore,
        // Optional: persisting sources if table schema supports it
        sources: attribution.sources
      }, {
        onConflict: 'market_log_id'
      });

    if (error) console.error("Supabase Persistence Error:", error.message);

    return attribution;

  } catch (error: any) {
    console.error("Gemini Grounding Error:", error.message || error);
    return {
      headline: "Attribution Engine Timeout",
      summary: "The engine was unable to correlate headlines in real-time. This usually happens if search data for the specific date is sparse.",
      category: "Macro",
      // Fix: Use string literal 'NEUTRAL' instead of Sentiment.NEUTRAL which is a type
      sentiment: 'NEUTRAL',
      relevanceScore: 0
    };
  }
};