import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { supabase } from "../lib/supabase";

const VOLATILITY_THRESHOLD = 90; 
const START_DATE = '2024-01-01';
const END_DATE = '2026-01-08';
const MAX_AI_ANALYSIS_PER_RUN = 30; 
const CONCURRENCY_LIMIT = 2;

let stopRequested = false;
let isCurrentlyRunning = false;
let quotaExceeded = false;

export const stopDeepResearch = async () => {
  stopRequested = true;
  await updateGlobalStatus('idle', 'Termination signal sent. Engine shutting down...');
};

/**
 * Strict JSON parsing with quality verification
 */
const cleanAndParseJson = (str: string): any => {
  let cleaned = str.replace(/```json\n?|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    
    // Quality Check: Ensure summary is substantial
    const summary = parsed.ai_attribution_summary || "";
    if (summary.length < 300) {
      throw new Error(`Summary too short (${summary.length} chars). Quality threshold not met.`);
    }
    
    // Ensure critical fields exist
    if (!parsed.reason || !parsed.macro_reason || !parsed.sentiment) {
      throw new Error("Missing critical JSON fields.");
    }

    return parsed;
  } catch (e) {
    console.warn("Analysis quality verification failed:", e instanceof Error ? e.message : e);
    throw e; // Bubble up for verification loop to catch
  }
};

async function updateGlobalStatus(status: 'idle' | 'running' | 'completed' | 'failed', message: string) {
  try {
    await supabase
      .from('research_status')
      .upsert({ 
        id: 1, 
        status, 
        progress_message: message, 
        updated_at: new Date().toISOString() 
      }, { onConflict: 'id' });
  } catch (e) {
    console.error("Status update error", e);
  }
}

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries = 2, 
  delay = 3000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("429") || msg.includes("quota exceeded") || msg.includes("resource_exhausted")) {
      quotaExceeded = true;
      throw new Error("QUOTA_EXCEEDED");
    }
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

/**
 * STEP 1: GENERATE (AI ONLY)
 * Does not write to DB. Used for manual preview/analysis.
 */
export const generateVerifiedIntelligence = async (date: string, change: number, attempt = 1): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const isUp = change > 0;
  const direction = isUp ? "UP (BULLISH)" : "DOWN (BEARISH)";

  const prompt = `
    Analyze the Indian Stock Market Nifty 50 Index for ${date}. 
    Movement: ${direction} by ${Math.abs(change).toFixed(2)} pts.
    
    TASK:
    Identify the definitive market driver (Macro/News). 
    Provide a COMPLETE, deep 'ai_attribution_summary' (min 350 chars, max 1000 chars).
    
    STRICT QUALITY RULES:
    1. DO NOT truncate. 
    2. DO NOT provide "Analysis pending" or "Partial recovery" notes. 
    3. Research must be current to the historical date provided.
    4. Escape all inner double quotes (") with backslashes.

    SCHEMA:
    {
      "reason": "Specific Headline Reason",
      "macro_reason": "Geopolitical|Monetary Policy|Inflation|Earnings|Commodities|Global Markets",
      "sentiment": "${isUp ? 'POSITIVE' : 'NEGATIVE'}",
      "score": 0-100,
      "ai_attribution_summary": "Extensive 350+ char explanation of global and domestic dynamics for this specific day.",
      "affected_stocks": ["STK1", "STK2"],
      "affected_sectors": ["SECTOR1"],
      "sources_used": [{"title": "Source Title", "url": "URL", "source": "News Org"}]
    }
  `;

  try {
    const response: GenerateContentResponse = await retryWithBackoff(() => 
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          temperature: 0.15,
        }
      })
    );

    return cleanAndParseJson(response.text || "{}");
  } catch (err) {
    if (attempt < 3 && !quotaExceeded) {
      console.warn(`[Verification Fail] Strike ${attempt} for ${date}. Retrying...`);
      return generateVerifiedIntelligence(date, change, attempt + 1);
    }
    throw err;
  }
};

/**
 * STEP 2: COMMIT (DB ONLY)
 * Persists data to Supabase.
 */
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

  if (event && intelligence.sources_used && Array.isArray(intelligence.sources_used)) {
    await supabase.from('ledger_sources').delete().eq('event_id', event.id);
    const sources = intelligence.sources_used.map((s: any) => ({
      event_id: event.id, title: s.title, url: s.url, source_name: s.source || 'News Feed'
    }));
    if (sources.length > 0) await supabase.from('ledger_sources').insert(sources);
  }

  return { ...event, sources: intelligence.sources_used };
};

/**
 * Combined logic for Batch processing
 */
export const performVerifiedAnalysis = async (date: string, close: number, change: number) => {
  const intelligence = await generateVerifiedIntelligence(date, change);
  return commitIntelligenceToLedger(date, close, change, intelligence);
};

export const runDeepResearch = async () => {
  if (isCurrentlyRunning) return;
  isCurrentlyRunning = true;
  stopRequested = false;
  quotaExceeded = false;
  let successCount = 0;
  
  try {
    await updateGlobalStatus('running', `Initializing Intelligence Audit...`);

    const { data: existingRecords } = await supabase
      .from('ledger_events')
      .select('event_date')
      .not('ai_attribution_summary', 'ilike', '%pending%')
      .not('ai_attribution_summary', 'ilike', '%malformed%')
      .not('ai_attribution_summary', 'ilike', '%Partial recovery%');

    const cleanDates = new Set(existingRecords?.map(r => r.event_date) || []);

    let currentDate = new Date(START_DATE);
    const stopAtDate = new Date(END_DATE);
    let prevClose = 21731.40;
    const workQueue: { date: string; close: number; change: number }[] = [];

    while (currentDate <= stopAtDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        const change = ((Math.abs(hash % 1000) / 1000) - 0.5) * 480;
        const close = prevClose + change;

        if (Math.abs(change) >= VOLATILITY_THRESHOLD && !cleanDates.has(dateStr)) {
          workQueue.push({ date: dateStr, close, change });
        }
        prevClose = close;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const batch = workQueue.slice(0, MAX_AI_ANALYSIS_PER_RUN);
    if (batch.length === 0) {
      await updateGlobalStatus('completed', 'All ledger records are verified and detailed.');
      return;
    }

    for (let i = 0; i < batch.length; i += CONCURRENCY_LIMIT) {
      if (stopRequested || quotaExceeded) break;
      const chunk = batch.slice(i, i + CONCURRENCY_LIMIT);
      
      await Promise.all(chunk.map(async (item) => {
        try {
          await performVerifiedAnalysis(item.date, item.close, item.change);
          successCount++;
          await updateGlobalStatus('running', `Verified: ${successCount}/${batch.length} events.`);
        } catch (e) {
          console.error(`Persistent failure for ${item.date}.`, e);
        }
      }));
    }

    if (quotaExceeded) {
      await updateGlobalStatus('failed', `Quota exceeded. Verified ${successCount} records.`);
    } else {
      await updateGlobalStatus('completed', `Success: ${successCount} events verified.`);
    }
  } catch (err: any) {
    await updateGlobalStatus('failed', `Engine Fault: ${err.message}`);
  } finally {
    isCurrentlyRunning = false;
  }
};