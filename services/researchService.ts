
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "../lib/supabase";

const MAX_AI_ANALYSIS_PER_RUN = 100; 

let stopRequested = false;
let isCurrentlyRunning = false;

const extractJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const cleaned = text.replace(/```json|```/gi, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      console.error("AI Response invalid JSON:", text);
      return null;
    }
  }
};

/**
 * SEEDING LOGIC: Adds unique dates to the volatile queue.
 */
export const seedVolatileQueue = async (dates: string[]) => {
  const sanitized = dates
    .map(d => d.trim())
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (sanitized.length === 0) return { added: 0, skipped: 0 };

  const { data: existingLedger } = await supabase
    .from('ledger_events')
    .select('event_date')
    .in('event_date', sanitized);

  const { data: existingQueue } = await supabase
    .from('volatile_queue')
    .select('log_date')
    .in('log_date', sanitized);

  const excludeDates = new Set([
    ...(existingLedger?.map(row => row.event_date) || []),
    ...(existingQueue?.map(row => row.log_date) || [])
  ]);

  const newDatesToQueue = sanitized.filter(d => !excludeDates.has(d));
  const skippedCount = sanitized.length - newDatesToQueue.length;

  if (newDatesToQueue.length === 0) return { added: 0, skipped: skippedCount };

  const { error } = await supabase.from('volatile_queue').upsert(
    newDatesToQueue.map(d => ({ 
      log_date: d,
      status: 'pending',
      inserted_at: new Date().toISOString()
    })),
    { onConflict: 'log_date' }
  );
  
  if (error) throw new Error(error.message);
  return { added: newDatesToQueue.length, skipped: skippedCount };
};

/**
 * DELETION LOGIC: Wipes the entire volatile_queue.
 */
export const clearVolatileQueue = async () => {
  const { error } = await supabase
    .from("volatile_queue")
    .delete()
    .gte("log_date", "1900-01-01"); 

  if (error) throw new Error(error.message);
  
  isCurrentlyRunning = false;
  stopRequested = true;
  await updateGlobalStatus('idle', 'Audit Queue Purged', null);
  return true;
};

export const stopDeepResearch = async () => {
  stopRequested = true;
  await updateGlobalStatus('idle', 'Audit Stopping...', null);
};

/**
 * CAUSAL INTELLIGENCE ENGINE (Gemini Pro)
 */
export const fetchCombinedIntelligence = async (date: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    You are Market Attribution Intelligence (IQ). 
    Perform a forensic financial audit for the Nifty 50 Index for the date: ${date}.
    
    OUTPUT SCHEMA (Strict JSON):
    {
      "event_date": "${date}",
      "nifty_close": number,
      "change_pts": number,
      "reason": "Main headline string",
      "macro_reason": "Geopolitical | Monetary Policy | Inflation | Earnings | Commodities | Global Markets | Domestic Policy | Technical",
      "sentiment": "POSITIVE | NEGATIVE | NEUTRAL",
      "score": 0-100,
      "ai_attribution_summary": "Detailed narrative",
      "affected_stocks": ["NSE symbols"],
      "affected_sectors": ["Sector names"]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    const result = extractJson(response.text || "");
    if (!result) return null;
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      url: chunk.web?.uri,
      title: chunk.web?.title,
      source_name: chunk.web?.title,
      published_at: new Date().toISOString(),
      snippet: chunk.web?.snippet || ""
    })).filter((s: any) => s.url) || [];

    return { ...result, sources_used: sources };
  } catch (e) {
    console.error(`Gemini Audit Error (${date}):`, e);
    return null;
  }
}

export const commitIntelligenceToLedger = async (data: any) => {
  const { data: event, error: upsertErr } = await supabase.from('ledger_events').upsert({
    event_date: data.event_date,
    ai_attribution_summary: data.ai_attribution_summary,
    score: data.score || 50,
    reason: data.reason,
    nifty_close: data.nifty_close || 0,
    change_pts: data.change_pts || 0,
    macro_reason: data.macro_reason || "Technical",
    sentiment: data.sentiment || "NEUTRAL",
    affected_stocks: data.affected_stocks || [],
    affected_sectors: data.affected_sectors || [],
    llm_raw_json: data
  }, { onConflict: 'event_date' }).select().single();

  if (upsertErr) throw upsertErr;

  if (data.sources_used?.length) {
    await supabase.from('ledger_sources').delete().eq('event_id', event.id);
    await supabase.from('ledger_sources').insert(data.sources_used.map((s: any) => ({
      event_id: event.id,
      url: s.url,
      source_name: s.source_name,
      title: s.title,
      published_at: s.published_at,
      snippet: s.snippet
    })));
  }

  return event;
};

async function updateGlobalStatus(status: 'idle' | 'running' | 'completed' | 'failed', stageMsg: string, activeDate: string | null) {
  // Check for session presence to satisfy NOT NULL constraint on breeze_active
  // Ensure we are definitely passing a boolean, not undefined/null
  const sessionVal = localStorage.getItem('breeze_api_session');
  const isBreezeSessionActive = sessionVal !== null && sessionVal !== undefined && sessionVal !== "";
  
  const payload = { 
    id: 1, 
    status_text: status, 
    stage: stageMsg, 
    active_date: activeDate,
    breeze_active: isBreezeSessionActive,
    updated_at: new Date().toISOString() 
  };

  try {
    // We use update first as it's cleaner for existing rows, falling back to upsert if needed
    const { error } = await supabase.from('research_status').upsert(payload, { onConflict: 'id' });
    
    if (error) {
      // Improved error visibility
      console.error("DB Status Update Error Detail:", JSON.stringify(error, null, 2));
      throw new Error(`DB Error: ${error.message}`);
    }
  } catch (e: any) { 
    console.error("Status Update Exception:", e.message || e);
    throw e; // Rethrow so the runner knows it failed
  }
}

/**
 * BACKGROUND PROCESS RUNNER
 */
export const runDeepResearch = async () => {
  if (isCurrentlyRunning) {
    console.log("RUN: Attempted to start while already running.");
    return;
  }
  
  isCurrentlyRunning = true;
  stopRequested = false;

  try {
    // 1. SIGNAL START IMMEDIATELY
    // This call must succeed for the UI to stay in 'Processing' mode
    await updateGlobalStatus('running', 'Initializing...', null);

    // 2. CLEANUP: Force delete already audited records from queue
    const { data: allInQueue } = await supabase.from('volatile_queue').select('log_date');
    if (allInQueue?.length) {
      const { data: audited } = await supabase
        .from('ledger_events')
        .select('event_date')
        .in('event_date', allInQueue.map(q => q.log_date));
      
      if (audited?.length) {
        const auditedDates = audited.map(a => a.event_date);
        console.log(`RUN: Removing ${auditedDates.length} legacy audited dates from queue.`);
        await supabase.from('volatile_queue').delete().in('log_date', auditedDates);
      }
    }

    // 3. FETCH BATCH
    const { data: targets, error: qErr } = await supabase
      .from('volatile_queue')
      .select('log_date')
      .or('status.eq.pending,status.eq.failed')
      .order('log_date', { ascending: true })
      .limit(MAX_AI_ANALYSIS_PER_RUN);

    if (qErr) throw qErr;
    if (!targets || targets.length === 0) {
      console.log("RUN: Target Queue Empty.");
      await updateGlobalStatus('idle', 'Audit complete. Ledger synchronized.', null);
      isCurrentlyRunning = false;
      return;
    }

    let processedCount = 0;
    for (let i = 0; i < targets.length; i++) {
      if (stopRequested) {
        console.log("RUN: Interrupting via Stop Signal.");
        break;
      }
      
      const dateStr = targets[i].log_date;
      const displayMsg = `Auditing: [${i+1}/${targets.length}] - ${dateStr}`;
      console.log(`RUN: ${displayMsg}`);
      
      // Update DB Status per iteration
      await updateGlobalStatus('running', displayMsg, dateStr);
      
      try {
        const intel = await fetchCombinedIntelligence(dateStr);
        if (intel) {
          await commitIntelligenceToLedger(intel);
          await supabase.from('volatile_queue').delete().eq('log_date', dateStr);
          processedCount++;
        }
      } catch (err: any) {
        console.error(`RUN: Failed record ${dateStr}:`, err);
        await supabase.from('volatile_queue').update({ status: 'failed', last_error: err.message }).eq('log_date', dateStr);
      }
    }
    
    await updateGlobalStatus('idle', stopRequested ? 'Audit Terminated' : `Success: ${processedCount} Audited.`, null);
  } catch (err: any) {
    console.error("RUN: Engine Crash:", err);
    // Attempt one final status update to signal failure
    try {
      await updateGlobalStatus('failed', `Engine Fault: ${err.message}`, null);
    } catch (e) {}
    throw err; // Re-throw to handle in UI
  } finally {
    isCurrentlyRunning = false;
  }
};
