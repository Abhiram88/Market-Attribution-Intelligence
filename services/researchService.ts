import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "../lib/supabase";
import { fetchBreezeHistoricalData } from "./breezeService";

const MAX_AI_ANALYSIS_PER_RUN = 50; 

let stopRequested = false;
let isCurrentlyRunning = false;

/**
 * SEEDING: Injects dates into the volatile_queue.
 */
export const seedVolatileQueue = async (dates: string[]) => {
  const sanitized = dates
    .map(d => d.trim())
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (sanitized.length === 0) return;

  const { data: existingLedger } = await supabase
    .from('ledger_events')
    .select('event_date')
    .in('event_date', sanitized);

  const existingDates = new Set(existingLedger?.map(row => row.event_date) || []);
  const newDatesToQueue = sanitized.filter(d => !existingDates.has(d));

  if (newDatesToQueue.length === 0) return;

  const { error } = await supabase.from('volatile_queue').upsert(
    newDatesToQueue.map(d => ({ event_date: d })),
    { onConflict: 'event_date' }
  );
  
  if (error) throw new Error(error.message);
};

export const stopDeepResearch = async () => {
  stopRequested = true;
  await updateGlobalStatus('idle', 'Engine termination requested...');
};

/**
 * CAUSAL INTELLIGENCE ENGINE
 */
export const fetchCombinedIntelligence = async (date: string, technicalData?: any): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const techSummary = technicalData ? `
    TECHNICAL ANCHOR FOR ${date}:
    - Open: ${technicalData.open}
    - High: ${technicalData.high}
    - Low: ${technicalData.low}
    - Close: ${technicalData.close}
    - Volume: ${technicalData.volume}
  ` : `DATE: ${date}`;

  const prompt = `
    You are Market Attribution Intelligence (IQ), a forensic market analyst.
    Task: Explain WHY the Indian Nifty 50 moved on ${date} using grounded web search.
    
    ${techSummary}
    
    Requirements:
    1. Find causal news/events that occurred on that specific date (or late prior evening IST).
    2. Output STRICT JSON only.
    
    JSON SCHEMA:
    {
      "close": number,
      "change": number,
      "reason": "Short bold headline",
      "ai_attribution_summary": "300-500 word technical-causal analysis",
      "macro_reason": "One of [Geopolitical, Monetary Policy, Inflation, Earnings, Commodities, Global Markets, Domestic Policy, Technical]",
      "sentiment": "POSITIVE | NEGATIVE | NEUTRAL",
      "score": 0-100,
      "affected_sectors": ["sector1"],
      "affected_stocks": ["STOCK1"]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const text = response.text;
    if (!text) return null;
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      url: chunk.web?.uri,
      title: chunk.web?.title,
      source_name: chunk.web?.title,
      published_at: new Date().toISOString()
    })).filter((s: any) => s.url) || [];

    const result = JSON.parse(text);
    return { ...result, sources_used: sources };
  } catch (e) {
    console.error(`AI Analysis failed for ${date}:`, e);
    return null;
  }
}

export const commitIntelligenceToLedger = async (date: string, data: any) => {
  const { data: event, error: upsertErr } = await supabase.from('ledger_events').upsert({
    event_date: date,
    nifty_close: data.close || 0,
    change_pts: data.change || 0,
    reason: data.reason || "Market Session Data",
    macro_reason: data.macro_reason || "Technical",
    sentiment: data.sentiment || "NEUTRAL",
    score: data.score || 50,
    ai_attribution_summary: data.ai_attribution_summary || "Analysis synchronized.",
    affected_stocks: data.affected_stocks || [],
    affected_sectors: data.affected_sectors || [],
    llm_raw_json: data
  }, { onConflict: 'event_date' }).select().single();

  if (upsertErr) throw upsertErr;

  if (data.sources_used && data.sources_used.length > 0) {
    await supabase.from('ledger_sources').delete().eq('ledger_event_id', event.id);
    
    const sourcePayload = data.sources_used.map(s => ({
      ledger_event_id: event.id,
      url: s.url,
      source_name: s.source_name || s.title,
      title: s.title,
      published_at: s.published_at || new Date().toISOString()
    }));
    
    await supabase.from('ledger_sources').insert(sourcePayload);
  }

  return event;
};

async function updateGlobalStatus(status: 'idle' | 'running' | 'completed' | 'failed', message: string) {
  try {
    await supabase.from('research_status').upsert({ id: 1, status, progress_message: message, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  } catch (e) { console.error(e); }
}

export const runDeepResearch = async () => {
  if (isCurrentlyRunning) return;
  isCurrentlyRunning = true;
  stopRequested = false;

  try {
    const { data: queue } = await supabase
      .from('volatile_queue')
      .select('event_date')
      .order('event_date', { ascending: true });

    if (!queue || queue.length === 0) {
      await updateGlobalStatus('idle', 'No queue data found.');
      isCurrentlyRunning = false;
      return;
    }

    const batch = queue.slice(0, MAX_AI_ANALYSIS_PER_RUN);
    let processed = 0;

    for (const item of batch) {
      if (stopRequested) break;
      const dateStr = item.event_date.trim();

      await updateGlobalStatus('running', `[INGEST] Fetching telemetry for ${dateStr}...`);

      let technical = null;
      try {
        technical = await fetchBreezeHistoricalData(dateStr);
      } catch (e) {
        console.warn(`Historical fetch failed for ${dateStr}, proceeding with AI fallback.`);
      }

      await updateGlobalStatus('running', `[AI] Grounded reasoning for ${dateStr}...`);
      
      const intel = await fetchCombinedIntelligence(dateStr, technical);
      if (intel) {
        if (technical) {
          intel.close = technical.close;
          intel.change = technical.close - technical.open;
        }
        await commitIntelligenceToLedger(dateStr, intel);
        await supabase.from('volatile_queue').delete().eq('event_date', dateStr);
        processed++;
      }
    }

    await updateGlobalStatus('completed', `Batch finished. Processed: ${processed}`);
  } catch (err: any) {
    await updateGlobalStatus('failed', `Engine Fault: ${err.message}`);
  } finally {
    isCurrentlyRunning = false;
  }
};