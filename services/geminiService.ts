
import { GoogleGenAI, Type } from "@google/genai";
import { MarketLog, NewsAttribution } from "../types";
import { supabase } from "../lib/supabase";

/**
 * GEMINI LIVE TELEMETRY (FALLBACK)
 * Uses Google Search to find current Nifty 50 stats when API is blocked/down.
 */
export const fetchMarketTelemetryViaGemini = async (): Promise<Partial<MarketLog>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Find the CURRENT real-time stats for the NSE Nifty 50 Index (India).
    I need: 
    1. Last Traded Price (LTP)
    2. Absolute Change (pts)
    3. Percentage Change (%)
    4. Day's High and Low
    5. Approximate Trading Volume (Million)
    
    Return ONLY valid JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Flash is faster for data lookups
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ltp: { type: Type.NUMBER },
            change: { type: Type.NUMBER },
            percent_change: { type: Type.NUMBER },
            high: { type: Type.NUMBER },
            low: { type: Type.NUMBER },
            volume: { type: Type.NUMBER }
          },
          required: ["ltp", "change", "percent_change", "high", "low"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      niftyClose: data.ltp,
      niftyChange: data.change,
      niftyChangePercent: data.percent_change,
      dayHigh: data.high,
      dayLow: data.low,
      volume: data.volume || 0,
      dataSource: 'Gemini Logic'
    };
  } catch (e) {
    console.error("Gemini Telemetry Fallback failed:", e);
    throw e;
  }
};

// Fix: Simplified return type as NewsAttribution now contains the impact fields (affected_stocks/sectors)
export const analyzeMarketLog = async (log: MarketLog): Promise<NewsAttribution> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const isUp = log.niftyChange >= 0;
  const direction = isUp ? "upward (BULLISH)" : "downward (BEARISH)";
  
  const technicalContext = `
    TECHNICAL TELEMETRY FOR ${log.date}:
    - Nifty 50 Index: ${log.niftyClose.toLocaleString()}
    - Change: ${log.niftyChange.toFixed(2)} pts (${log.niftyChangePercent.toFixed(2)}%)
    - Session Range: Low ${log.dayLow?.toLocaleString()} | High ${log.dayHigh?.toLocaleString()}
    - Trading Volume: ${log.volume?.toFixed(2)} Million
    - Trend: ${direction}
  `;

  const prompt = `
    As a Senior Quantitative Market Strategist, explain the CAUSAL REASONING for the ${direction} movement in the Nifty 50 today.
    
    ${technicalContext}
    
    TASK:
    1. Use Google Search to find specific financial news, corporate earnings, or macro-economic events from TODAY that directly correlate with these specific numbers.
    2. Provide a sophisticated, exhaustive summary (min 300 words).
    3. Identify specific Stocks and Sectors moved today.
    
    Response MUST be valid JSON.
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
            category: { type: Type.STRING, enum: ["Macro", "Global", "Corporate", "Geopolitical", "Technical"] },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            relevanceScore: { type: Type.NUMBER },
            affected_stocks: { type: Type.ARRAY, items: { type: Type.STRING } },
            affected_sectors: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["headline", "summary", "category", "sentiment", "relevanceScore", "affected_stocks", "affected_sectors"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI analysis engine returned empty.");

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri,
      title: chunk.web?.title
    })).filter((s: any) => s.uri) || [];

    const result = JSON.parse(text);
    
    // Fix: Using updated NewsAttribution interface properties
    const attribution: NewsAttribution = {
      headline: result.headline,
      summary: result.summary,
      category: result.category,
      sentiment: result.sentiment,
      relevanceScore: result.relevanceScore || 95,
      sources,
      affected_stocks: result.affected_stocks || [],
      affected_sectors: result.affected_sectors || []
    };

    const payload = {
      market_log_id: log.id,
      headline: attribution.headline,
      summary: attribution.summary,
      category: attribution.category,
      sentiment: attribution.sentiment,
      relevance_score: attribution.relevanceScore,
      meta: {
        stocks: attribution.affected_stocks,
        sectors: attribution.affected_sectors,
        technical_anchor: { close: log.niftyClose, vol: log.volume }
      }
    };

    const { data: existing } = await supabase.from('news_attribution').select('id').eq('market_log_id', log.id).maybeSingle();
    if (existing) {
      await supabase.from('news_attribution').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('news_attribution').insert(payload);
    }

    return attribution;
  } catch (error: any) {
    console.error("Gemini Pipeline Failure:", error);
    throw error;
  }
};
