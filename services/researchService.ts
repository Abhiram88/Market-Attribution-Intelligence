import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { supabase } from "../lib/supabase";

const MAX_AI_ANALYSIS_PER_RUN = 10; 

let stopRequested = false;
let isCurrentlyRunning = false;

/**
 * SEEDING LOGIC: Injects dates into the volatile_queue table.
 * Uses upsert to handle existing dates gracefully.
 */
export const seedVolatileQueue = async (dates: string[]) => {
  const { error } = await supabase.from('volatile_queue').upsert(
    dates.map(d => ({ event_date: d })),
    { onConflict: 'event_date' }
  );
  if (error) {
    console.error("Queue seeding failed:", error);
    throw new Error(error.message || "Failed to seed the volatile queue.");
  }
};

export const stopDeepResearch = async () => {
  stopRequested = true;
  await updateGlobalStatus('idle', 'Engine termination requested...');
};

export const verifyHistoricalTelemetry = async (date: string): Promise<{ close: number, change: number } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const prompt = `NSE Nifty 50 Index OFFICIAL closing and point change for: ${date}. 
  Return JSON: { "close": number, "change": number, "is_holiday": boolean }. 
  If market was closed, set is_holiday to true.`;

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
            close: { type: Type.NUMBER },
            change: { type: Type.NUMBER },
            is_holiday: { type: Type.BOOLEAN }
          },
          required: ["close", "change", "is_holiday"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (data.is_holiday || !data.close) return null;
    return { close: data.close, change: data.change };
  } catch (e) {
    console.error(`Telemetry verification failed for ${date}:`, e);
    return null;
  }
};

export const generateVerifiedIntelligence = async (date: string, actualChange: number, attempt = 1): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const prompt = `
    Analyze the Indian Stock Market (Nifty 50) for ${date}. 
    Move: ${actualChange > 0 ? 'UP' : 'DOWN'} by ${Math.abs(actualChange).toFixed(2)} pts.
    
    Provide:
    1. reason: A 1-sentence headline.
    2. ai_attribution_summary: 300+ word deep analysis using Google Search news from that specific day.
    3. macro_reason: One of [Geopolitical, Monetary Policy, Inflation, Earnings, Commodities, Global Markets, Domestic Policy, Technical].
    4. sentiment: [POSITIVE, NEGATIVE, NEUTRAL].
    5. score: 0-100 impact score.
    6. affected_sectors: Array of sectors.
    7. affected_stocks: Array of top 5 stocks.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (err) {
    if (attempt < 2) return generateVerifiedIntelligence(date, actualChange, attempt + 1);
    throw err;
  }
};

export const commitIntelligenceToLedger = async (date: string, close: number, change: number, intelligence: any) => {
  const { data: event, error: upsertErr } = await supabase.from('ledger_events').upsert({
    event_date: date,
    nifty_close: close,
    change_pts: change,
    reason: intelligence.reason,
    macro_reason: intelligence.macro_reason,
    sentiment: intelligence.sentiment,
    score: intelligence.score,
    ai_attribution_summary: intelligence.ai_attribution_summary,
    affected_stocks: intelligence.affected_stocks || [],
    affected_sectors: intelligence.affected_sectors || [],
    llm_raw_json: intelligence
  }, { onConflict: 'event_date' }).select().single();

  if (upsertErr) throw upsertErr;
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
  let successCount = 0;
  
  try {
    await updateGlobalStatus('running', `Checking for pending dates in queue...`);

    // 1. Get processed dates
    const { data: completed } = await supabase
      .from('ledger_events')
      .select('event_date')
      .not('ai_attribution_summary', 'is', null);
    
    const completedSet = new Set(completed?.map(r => r.event_date) || []);

    // 2. Get full queue
    const { data: queue, error: queueErr } = await supabase
      .from('volatile_queue')
      .select('event_date')
      .order('event_date', { ascending: true });
    
    if (queueErr) throw new Error(queueErr.message);

    // 3. Find missing dates (the Delta)
    const pendingDates = queue
      .map(q => q.event_date)
      .filter(date => !completedSet.has(date))
      .slice(0, MAX_AI_ANALYSIS_PER_RUN);

    if (pendingDates.length === 0) {
      await updateGlobalStatus('completed', 'Queue fully processed. No pending dates.');
      return;
    }

    await updateGlobalStatus('running', `Resuming from ${pendingDates[0]}...`);

    for (const date of pendingDates) {
      if (stopRequested) break;
      
      await updateGlobalStatus('running', `Verifying Telemetry: ${date}...`);
      const telemetry = await verifyHistoricalTelemetry(date);
      
      if (telemetry) {
        await updateGlobalStatus('running', `Analyzing Intelligence: ${date}...`);
        const intelligence = await generateVerifiedIntelligence(date, telemetry.change);
        await commitIntelligenceToLedger(date, telemetry.close, telemetry.change, intelligence);
        successCount++;
      } else {
        // Record as a holiday in the ledger to avoid re-checking every run
        await supabase.from('ledger_events').upsert({
          event_date: date,
          reason: "Market Closed / Holiday",
          ai_attribution_summary: "N/A - Trading session not found."
        }, { onConflict: 'event_date' });
      }
    }

    await updateGlobalStatus('completed', `Audit Batch Complete. Analyzed ${successCount} dates.`);
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err);
    await updateGlobalStatus('failed', `Engine Halted: ${msg}`);
  } finally {
    isCurrentlyRunning = false;
  }
};