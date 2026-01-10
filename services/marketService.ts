import { MarketLog } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * INTELLIGENT DATA INGESTION
 * Uses Google Search Grounding to fetch real-time market telemetry.
 * This eliminates the 'constant value' issue by performing live lookups.
 */
export const fetchRealtimeMarketTelemetry = async (): Promise<MarketLog> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const today = new Date().toISOString().split('T')[0];

  const prompt = `
    Find the latest closing or current prices for:
    1. NSE Nifty 50 Index (India)
    2. NASDAQ Composite (US)
    3. GIFT Nifty (formerly SGX Nifty)
    
    Also find the points change and percentage change for Nifty 50 compared to its previous close.
    Return the data in the specified JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nifty_close: { type: Type.NUMBER },
            nifty_change: { type: Type.NUMBER },
            nifty_change_percent: { type: Type.NUMBER },
            nasdaq_close: { type: Type.NUMBER },
            nasdaq_change_percent: { type: Type.NUMBER },
            gift_nifty_close: { type: Type.NUMBER }
          },
          required: ["nifty_close", "nifty_change", "nifty_change_percent", "nasdaq_close", "gift_nifty_close"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Intelligence Engine.");
    
    const data = JSON.parse(text);
    
    const payload = {
      log_date: today,
      nifty_close: data.nifty_close,
      nifty_change: data.nifty_change,
      nifty_change_percent: data.nifty_change_percent,
      nasdaq_close: data.nasdaq_close,
      nasdaq_change_percent: data.nasdaq_change_percent || 0,
      gift_nifty_close: data.gift_nifty_close,
      threshold_met: Math.abs(data.nifty_change) > 90
    };

    let finalRecord;
    const { data: existing } = await supabase
      .from('market_logs')
      .select('id')
      .eq('log_date', today)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('market_logs')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      finalRecord = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from('market_logs')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      finalRecord = inserted;
    }

    return {
      id: finalRecord.id,
      date: finalRecord.log_date,
      niftyClose: finalRecord.nifty_close,
      niftyChange: finalRecord.nifty_change,
      niftyChangePercent: finalRecord.nifty_change_percent,
      nasdaqClose: finalRecord.nasdaq_close,
      nasdaqChangePercent: finalRecord.nasdaq_change_percent,
      giftNiftyClose: finalRecord.gift_nifty_close,
      thresholdMet: finalRecord.threshold_met,
      isAnalyzing: false
    };
  } catch (error: any) {
    console.error("Realtime Telemetry Ingestion Failed:", error);
    
    // Specific error handling for Quota/Rate limits
    const errorMsg = error?.message || "";
    if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
      throw new Error("QUOTA_EXCEEDED: The Intelligence Engine has reached its daily search limit. Please try again tomorrow.");
    }
    
    throw error;
  }
};