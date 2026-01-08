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
  // Using gemini-3-pro-preview for advanced reasoning
  const modelId = "gemini-3-pro-preview";

  const prompt = `
    You are a world-class senior quantitative financial analyst and macro strategist.
    
    Context for ${log.date}:
    - Nifty 50 Index (^NSEI) Close: ${log.niftyClose}
    - Nifty 50 Change: ${log.niftyChange > 0 ? '+' : ''}${log.niftyChange} points (${log.niftyChangePercent}%)
    - NASDAQ Composite (^IXIC) Change: ${log.nasdaqChangePercent}%
    - GIFT Nifty: ${log.giftNiftyClose}
    
    CRITICAL TASK:
    Perform an exhaustive causal attribution analysis.
    1. SEARCH: Use Google Search to find the top 5-7 critical financial developments affecting Indian markets on ${log.date}. Look for specific triggers like FII/DII data, global central bank cues, geopolitical events (e.g. trade war threats), and specific sector-level shocks.
    2. REASON: Correlate these events with the Nifty move.
    3. SUMMARY: Write a long, detailed, and professional summary (minimum 100 words). Explain EXACTLY why the market moved. Mention specific sectors (e.g., Metal, IT, Energy), FII outflow numbers if available, and global cues (NASDAQ/Treasury yields). 
    4. HEADLINE: Create a punchy, factual headline that summarizes the main driver.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 }, // Max thinking for deep reasoning
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "Detailed headline including indices or major drivers" },
            summary: { type: Type.STRING, description: "Exhaustive professional summary (100+ words)" },
            category: { type: Type.STRING, enum: ["Macro", "Global", "Corporate", "Geopolitical"] },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            relevanceScore: { type: Type.NUMBER, description: "Confidence score 0.0 to 1.0" }
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
      headline: result.headline || "Market Volatility Analysis",
      summary: result.summary || "Detailed attribution pending broader search indexing.",
      category: (result.category as any) || "Macro",
      sentiment: (result.sentiment as any) || 'NEUTRAL',
      relevanceScore: result.relevanceScore || 0.5,
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
    console.error("Gemini Error:", error);
    throw error;
  }
};