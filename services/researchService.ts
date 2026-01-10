import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { supabase } from "../lib/supabase";

const VOLATILITY_THRESHOLD = 90; 
const START_DATE = '2024-01-01';
const END_DATE = new Date().toISOString().split('T')[0];
const MAX_AI_ANALYSIS_PER_RUN = 10; 

let stopRequested = false;
let isCurrentlyRunning = false;

export const stopDeepResearch = async () => {
  stopRequested = true;
  await updateGlobalStatus('idle', 'Termination signal sent. Engine shutting down...');
};

export const verifyHistoricalTelemetry = async (date: string): Promise<{ close: number, change: number } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const prompt = `Find the OFFICIAL historical closing price and the points change for the NSE Nifty 50 Index on the date: ${date}. 
  Return only the numerical values in JSON format. If the market was closed (weekend/holiday), return zeros.`;

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
            close: { type: Type.NUMBER, description: "Closing price of Nifty 50" },
            change: { type: Type.NUMBER, description: "Point change from previous close" },
            is_holiday: { type: Type.BOOLEAN }
          },
          required: ["close", "change", "is_holiday"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (data.is_holiday || data.close === 0) return null;
    return { close: data.close, change: data.change };
  } catch (e) {
    console.error(`Telemetry verification failed for ${date}:`, e);
    return null;
  }
};

export const generateVerifiedIntelligence = async (date: string, actualChange: number, attempt = 1): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const isUp = actualChange > 0;
  const direction = isUp ? "UP (BULLISH)" : "DOWN (BEARISH)";

  const prompt = `
    Analyze the Indian Stock Market Nifty 50 Index for the date: ${date}. 
    Market Movement: ${direction} by ${Math.abs(actualChange).toFixed(2)} pts.
    
    CRITICAL TASK:
    1. REASON: Provide a CONCISE 1 to 2 sentence headline summary explaining the primary driver. This is for a table view.
    2. DEEP ANALYSIS (ai_attribution_summary): Provide an EXHAUSTIVE, professional financial report of at least 300 words. 
       - Detail macro-economic factors (US Fed, Inflation, Geopolitics).
       - Detail specific sectors and top 5 stocks that drove this specific point change.
       - Correlation between global cues and domestic sentiment on THIS specific day.
    
    STRICT ACCURACY RULES:
    - Use Google Search to verify exact news headlines from ${date}.
    - Do NOT provide generic placeholders.
    - Focus on the specific reasons for the ${Math.abs(actualChange).toFixed(0)} point move.

    SCHEMA:
    {
      "reason": "1-2 sentence punchy summary...",
      "ai_attribution_summary": "Extensive 300+ word deep-dive report...",
      "macro_reason": "Geopolitical|Monetary Policy|Inflation|Earnings|Commodities|Global Markets|Technical",
      "sentiment": "${isUp ? 'POSITIVE' : 'NEGATIVE'}",
      "score": 0-100,
      "affected_stocks": ["STOCK1", "STOCK2", "STOCK3", "STOCK4", "STOCK5"],
      "affected_sectors": ["SECTOR1", "SECTOR2"],
      "sources_used": [{"title": "News Headline", "url": "URL", "source": "News Provider"}]
    }
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    // Extra validation to ensure quality for the long analysis
    if (!parsed.ai_attribution_summary || parsed.ai_attribution_summary.length < 500) {
       console.warn("AI response too short, retrying for depth...");
       if (attempt < 2) return generateVerifiedIntelligence(date, actualChange, attempt + 1);
    }
    return parsed;
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

  if (event && intelligence.sources_used && Array.isArray(intelligence.sources_used)) {
    await supabase.from('ledger_sources').delete().eq('event_id', event.id);
    const sources = intelligence.sources_used.map((s: any) => ({
      event_id: event.id, title: s.title, url: s.url, source_name: s.source || 'Intelligence Feed'
    }));
    if (sources.length > 0) await supabase.from('ledger_sources').insert(sources);
  }

  return { ...event, sources: intelligence.sources_used };
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
    await updateGlobalStatus('running', `Initializing Audit Pipeline...`);

    const { data: existing } = await supabase.from('ledger_events').select('event_date').not('ai_attribution_summary', 'is', null);
    const cleanDates = new Set(existing?.map(r => r.event_date) || []);

    let currentDate = new Date(START_DATE);
    const stopAtDate = new Date(END_DATE);
    const workQueue: string[] = [];

    while (currentDate <= stopAtDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6 && !cleanDates.has(dateStr)) {
        workQueue.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const batch = workQueue.slice(0, MAX_AI_ANALYSIS_PER_RUN);
    
    for (const date of batch) {
      if (stopRequested) break;
      
      await updateGlobalStatus('running', `Telemetry Check: ${date}...`);
      const telemetry = await verifyHistoricalTelemetry(date);
      
      // STRICT SHORTLISTING: Only save and analyze if |change| >= 90
      if (telemetry && Math.abs(telemetry.change) >= VOLATILITY_THRESHOLD) {
        await updateGlobalStatus('running', `Alert [${telemetry.change.toFixed(0)} pts] Found: Drafting Intelligence for ${date}...`);
        const intelligence = await generateVerifiedIntelligence(date, telemetry.change);
        await commitIntelligenceToLedger(date, telemetry.close, telemetry.change, intelligence);
        successCount++;
      }
    }

    await updateGlobalStatus('completed', `Audit Batch Complete. Recorded ${successCount} high-volatility sessions.`);
  } catch (err: any) {
    await updateGlobalStatus('failed', `Engine Fault: ${err.message}`);
  } finally {
    isCurrentlyRunning = false;
  }
};