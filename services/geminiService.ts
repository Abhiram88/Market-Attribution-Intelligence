
import { GoogleGenAI, Type } from "@google/genai";
import { MarketLog, NewsAttribution } from "../types";
import { supabase } from "../lib/supabase";

export const analyzeMarketLog = async (log: MarketLog): Promise<NewsAttribution> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const isUp = log.niftyChange >= 0;
  const direction = isUp ? "upward (BULLISH)" : "downward (BEARISH)";
  
  const technicalContext = `
    TECHNICAL TELEMETRY FOR ${log.date}:
    - Nifty 50 Index: ${log.niftyClose.toLocaleString()}
    - Change: ${log.niftyChange.toFixed(2)} pts (${log.niftyChangePercent.toFixed(2)}%)
    - Trend: ${direction}
  `;

  const prompt = `
    As a Senior Quantitative Market Strategist, explain the CAUSAL REASONING for the ${direction} movement in the Nifty 50 today.
    
    ${technicalContext}
    
    TASK:
    1. Use Google Search to find specific news from TODAY (${log.date}).
    2. Provide a sophisticated narrative (min 300 words).
    3. Identify specific Stocks and Sectors.
    
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
            narrative: { type: Type.STRING },
            category: { type: Type.STRING },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            impact_score: { type: Type.NUMBER },
            affected_stocks: { type: Type.ARRAY, items: { type: Type.STRING } },
            affected_sectors: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["headline", "narrative", "sentiment", "impact_score", "affected_stocks", "affected_sectors"]
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
    
    const attribution: NewsAttribution = {
      headline: result.headline,
      narrative: result.narrative,
      category: result.category,
      sentiment: result.sentiment,
      impact_score: result.impact_score || 95,
      sources,
      affected_stocks: result.affected_stocks || [],
      affected_sectors: result.affected_sectors || []
    };

    const payload = {
      market_log_id: log.id,
      headline: attribution.headline,
      narrative: attribution.narrative,
      impact_score: attribution.impact_score,
      model: modelId,
      impact_json: {
        stocks: attribution.affected_stocks,
        sectors: attribution.affected_sectors,
        category: attribution.category,
        sentiment: attribution.sentiment
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

/**
 * Perform symbol-specific intelligence synthesis
 */
export const analyzeStockIntelligence = async (symbol: string, date: string): Promise<NewsAttribution> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-3-pro-preview";

  const prompt = `
    As a Senior Equity Analyst, perform a FORENSIC AUDIT for the NSE stock symbol: ${symbol} for the date: ${date}.
    
    OBJECTIVES:
    1. First, determine the price movement of ${symbol} for today (${date}). Is it moving UPWARD or DOWNWARD?
    2. Find the specific reasons for this move. If it's falling, exactly why is it falling? If it's rising, what's driving it? (Earnings, Order Wins, Corporate Actions, Sectoral pressure, etc.)
    3. Obtain at least 2-3 recent analyst recommendations (calls) for ${symbol} from reputable financial sources (Brokerages like ICICI Securities, Kotak, Jefferies, etc.). Include Rating and Target Price if available.
    4. Synthesize a 300+ word causal narrative explaining why the stock moved.
    5. Provide a punchy headline and sentiment bias.
    
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
            narrative: { type: Type.STRING },
            category: { type: Type.STRING },
            sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
            impact_score: { type: Type.NUMBER },
            affected_stocks: { type: Type.ARRAY, items: { type: Type.STRING } },
            affected_sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
            analyst_calls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  rating: { type: Type.STRING },
                  target: { type: Type.STRING },
                  source: { type: Type.STRING }
                },
                required: ["rating", "source"]
              }
            }
          },
          required: ["headline", "narrative", "sentiment", "impact_score", "analyst_calls"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Stock AI engine returned empty.");

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri,
      title: chunk.web?.title
    })).filter((s: any) => s.uri) || [];

    const result = JSON.parse(text);
    
    return {
      headline: result.headline,
      narrative: result.narrative,
      category: result.category,
      sentiment: result.sentiment,
      impact_score: result.impact_score || 90,
      sources,
      affected_stocks: [symbol],
      affected_sectors: result.affected_sectors || [],
      analyst_calls: result.analyst_calls || []
    };
  } catch (error: any) {
    console.error("Stock Intelligence Failure:", error);
    throw error;
  }
};
