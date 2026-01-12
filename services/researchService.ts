
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "../lib/supabase";

const MAX_AI_ANALYSIS_PER_RUN = 50; 

let stopRequested = false;
let isCurrentlyRunning = false;

/**
 * SEEDING: Injects dates into the volatile_queue.
 * Optimized: Filters out dates already present in ledger_events before seeding.
 */
export const seedVolatileQueue = async (dates: string[]) => {
  const sanitized = dates
    .map(d => d.trim())
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (sanitized.length === 0) return;

  // 1. Fetch existing dates from the ledger to prevent seeding duplicates
  const { data: existingLedger } = await supabase
    .from('ledger_events')
    .select('event_date')
    .in('event_date', sanitized);

  const existingDates = new Set(existingLedger?.map(row => row.event_date) || []);
  const newDatesToQueue = sanitized.filter(d => !existingDates.has(d));

  if (newDatesToQueue.length === 0) {
    console.log("All uploaded dates already exist in the ledger. Skipping queue seeding.");
    return;
  }

  // 2. Upsert only the unique missing dates
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
 * PURE INTELLIGENCE FETCH
 */
export const fetchCombinedIntelligence = async (date: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    DATA EXTRACTION & ANALYSIS for NSE Nifty 50 (India)
    DATE: ${date}
    
    1. Fetch the official closing price and absolute points change for Nifty 50 on ${date}.
    2. Provide a 300-500 word technical analysis of WHY the market moved this way.
    
    JSON SCHEMA:
    {
      "close": number,
      "change": number,
      "reason": "Short headline",
      "ai_attribution_summary": "Full detailed analysis",
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
    ai_attribution_summary: data.ai_attribution_summary || "Analysis successfully synchronized.",
    affected_stocks: data.affected_stocks || [],
    affected_sectors: data.affected_sectors || [],
    llm_raw_json: data
  }, { onConflict: 'event_date' }).select().single();

  if (upsertErr) throw upsertErr;
  return event;
};

async function updateGlobalStatus(status: 'idle' | 'running' | 'completed' | 'failed', message: string) {
  try {
    await supabase.from('research_status').upsert({ id: 1, status, progress_message: message, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  } catch (e) { console.error(e); }
}

/**
 * RESEARCH ENGINE
 * STRICTLY processes the volatile_queue first.
 */
export const runDeepResearch = async () => {
  if (isCurrentlyRunning) return;
  isCurrentlyRunning = true;
  stopRequested = false;
  
  try {
    // 1. Fetch Priority Queue (from CSV)
    const { data: queue } = await supabase
      .from('volatile_queue')
      .select('event_date')
      .order('event_date', { ascending: true });

    if (queue && queue.length > 0) {
      const batch = queue.slice(0, MAX_AI_ANALYSIS_PER_RUN);
      let processed = 0;
      let skipped = 0;

      for (const item of batch) {
        if (stopRequested) break;
        const date = item.event_date.trim();

        // SECONDARY SAFETY: CHECK LEDGER FOR DUPLICATE AGAIN
        const { data: existing } = await supabase
          .from('ledger_events')
          .select('id')
          .eq('event_date', date)
          .maybeSingle();

        if (existing) {
          await updateGlobalStatus('running', `[SKIP] ${date} already in Ledger.`);
          await supabase.from('volatile_queue').delete().eq('event_date', date);
          skipped++;
          continue;
        }

        await updateGlobalStatus('running', `[QUEUE] Analyzing: ${date}...`);
        
        // Remove from queue first to prevent retry collisions
        await supabase.from('volatile_queue').delete().eq('event_date', date);

        const intelligence = await fetchCombinedIntelligence(date);
        if (intelligence) {
          await commitIntelligenceToLedger(date, intelligence);
          processed++;
        }
      }

      await updateGlobalStatus('completed', `Queue Batch Done. Processed: ${processed}, Skipped: ${skipped}.`);
      return;
    } 

    // 2. RESUME MODE (Only triggers if queue is empty)
    await updateGlobalStatus('running', `[AUTO] Scanning Ledger for gaps...`);
    const { data: lastEntry } = await supabase
      .from('ledger_events')
      .select('event_date')
      .order('event_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastEntry) {
      await updateGlobalStatus('idle', 'No queue or ledger data found.');
      return;
    }

    const nextDate = new Date(lastEntry.event_date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateStr = nextDate.toISOString().split('T')[0];

    await updateGlobalStatus('running', `[AUTO] Processing: ${dateStr}...`);
    const intel = await fetchCombinedIntelligence(dateStr);
    if (intel) await commitIntelligenceToLedger(dateStr, intel);
    
    await updateGlobalStatus('completed', `Audit cycle finished for ${dateStr}.`);

  } catch (err: any) {
    await updateGlobalStatus('failed', `Engine Fault: ${err.message}`);
  } finally {
    isCurrentlyRunning = false;
  }
};
