
import { 
  EventCandidate, 
  Reg30Report, 
  Reg30Source, 
  Reg30EventFamily, 
  Sentiment, 
  ActionRecommendation 
} from "../types";
import { analyzeReg30Event } from "./reg30GeminiService";
import { supabase } from "../lib/supabase";

/**
 * ROBUST HELPERS
 */
const s = (v: any) => (v === null || v === undefined ? "" : String(v)).trim();
const lower = (v: any) => s(v).toLowerCase();

const normalizeHeader = (h: string) =>
  (h ?? "")
    .replace(/\uFEFF/g, "")        // remove BOM
    .replace(/\r?\n/g, " ")        // remove newlines
    .replace(/\s+/g, " ")          // collapse whitespace
    .replace(/^"+|"+$/g, "")       // strip surrounding quotes
    .trim();

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

/**
 * STABLE HASH HELPER (Simplified SHA-256 substitute for client-side)
 */
const getStringHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

/**
 * DETERMINISTIC SCORING ENGINE
 */
const calculateScoreAndRecommendation = (
  family: Reg30EventFamily, 
  extracted: any, 
  confidence: number,
  mCapCr: number | null
): { impact_score: number; direction: Sentiment; recommendation: ActionRecommendation } => {
  let impact_score = 0;
  let direction: Sentiment = 'NEUTRAL';

  const getRelativeSize = (val: number) => mCapCr ? clamp((val / mCapCr) * 100 * 3, 0, 60) : 20;

  switch (family) {
    case 'ORDER_CONTRACT':
    case 'ORDER_PIPELINE': {
      direction = 'POSITIVE';
      const base = family === 'ORDER_CONTRACT' ? 10 : 8;
      const relSize = extracted.order_value_cr ? getRelativeSize(extracted.order_value_cr) : 20;
      const stageBonus = 
        extracted.stage === 'LOA' ? 15 : 
        extracted.stage === 'WO' ? 12 : 
        extracted.stage === 'NTP' ? 10 : 
        extracted.stage === 'L1' ? 8 : 5;
      const boosters = (extracted.international ? 5 : 0) + (extracted.new_customer ? 5 : 0);
      const risk = extracted.conditionality === 'HIGH' ? -15 : (extracted.conditionality === 'MEDIUM' ? -8 : 0);
      
      impact_score = base + relSize + stageBonus + boosters + risk;
      if (family === 'ORDER_PIPELINE' && !extracted.order_value_cr) {
        impact_score = Math.min(impact_score, 55);
      }
      break;
    }
    case 'CREDIT_RATING': {
      const actionNotch = extracted.rating_action === 'DOWNGRADE' 
        ? clamp(55 + 10 * (extracted.notches || 1), 0, 80)
        : (extracted.rating_action === 'UPGRADE' ? clamp(35 + 8 * (extracted.notches || 1), 0, 70) : 25);
      const outlook = (extracted.outlook_change === 'NEGATIVE' ? 10 : (extracted.outlook_change === 'POSITIVE' ? 6 : 0)) +
                      (extracted.watch === 'NEGATIVE' ? 15 : (extracted.watch === 'POSITIVE' ? 10 : 0));
      impact_score = actionNotch + outlook;
      direction = (extracted.rating_action === 'DOWNGRADE' || extracted.outlook_change === 'NEGATIVE' || extracted.watch === 'NEGATIVE') 
        ? 'NEGATIVE' : (extracted.rating_action === 'UPGRADE' || extracted.outlook_change === 'POSITIVE' || extracted.watch === 'POSITIVE' ? 'POSITIVE' : 'NEUTRAL');
      break;
    }
    case 'DILUTION_CAPITAL': {
      direction = 'NEGATIVE';
      const base = 15;
      const magnitude = extracted.dilution_pct ? clamp(extracted.dilution_pct * 4, 0, 60) : (extracted.issue_value_cr && mCapCr ? clamp((extracted.issue_value_cr / mCapCr) * 100 * 2, 0, 60) : 20);
      const quality = extracted.use_of_funds?.includes('DEBT') ? 10 : (extracted.use_of_funds?.includes('GROWTH') ? 6 : (extracted.use_of_funds?.includes('GENERAL') ? -10 : 0));
      const pricing = (extracted.discount_pct || 0) >= 10 ? -15 : ((extracted.discount_pct || 0) >= 7 ? -8 : 0);
      impact_score = base + magnitude + quality + pricing;
      break;
    }
    case 'SHAREHOLDER_RETURNS': {
      direction = 'POSITIVE';
      const base = 10;
      const buyback = (extracted.action_type === 'BUYBACK' && extracted.buyback_value_cr && mCapCr) ? clamp((extracted.buyback_value_cr / mCapCr) * 100 * 2 + ((extracted.buyback_premium_pct || 0) >= 10 ? 5 : 0), 0, 70) : 0;
      const div = (extracted.action_type === 'DIVIDEND' && extracted.dividend_yield_pct) ? clamp(extracted.dividend_yield_pct * 10 - (extracted.one_off ? 10 : 0), 0, 35) : 0;
      const bonus = (extracted.action_type === 'BONUS' || extracted.action_type === 'SPLIT') ? 20 : 0;
      impact_score = base + buyback + div + bonus;
      break;
    }
    case 'GOVERNANCE_MANAGEMENT': {
      direction = 'NEGATIVE';
      const severity = extracted.event_subtype === 'AUDITOR_RESIGN' ? 75 : (extracted.event_subtype === 'AUDIT_QUALIFICATION' ? 85 : (extracted.event_subtype === 'CFO_RESIGN' ? 60 : (extracted.event_subtype === 'CEO_RESIGN' ? 55 : 30)));
      const mods = (extracted.reason_quality === 'VAGUE' ? 10 : 0) + (extracted.effective_immediate ? 10 : 0) + (extracted.successor_named ? -10 : 0) + (extracted.forensic_audit ? 15 : 0);
      impact_score = severity + mods;
      break;
    }
    case 'LITIGATION_REGULATORY': {
      direction = 'NEGATIVE';
      const base = 20;
      const severity = extracted.stage_legal === 'ARREST_ATTACHMENT' ? 25 : (extracted.stage_legal === 'ORDER' ? 15 : (extracted.stage_legal === 'NOTICE' ? 5 : 10));
      const ops = extracted.ops_impact === 'YES' ? 20 : 0;
      impact_score = base + severity + ops;
      break;
    }
  }

  impact_score = clamp(impact_score, 0, 100);

  let recommendation: ActionRecommendation = 'IGNORE';
  if (confidence < 0.65 || (family === 'ORDER_PIPELINE' && !mCapCr)) {
    recommendation = 'NEEDS_MANUAL_REVIEW';
  } else if (impact_score >= 80 && direction === 'POSITIVE') {
    recommendation = 'ACTIONABLE_BULLISH';
  } else if (impact_score >= 80 && direction === 'NEGATIVE') {
    recommendation = 'ACTIONABLE_BEARISH_RISK';
  } else if (impact_score >= 60) {
    recommendation = 'HIGH_PRIORITY_WATCH';
  } else if (impact_score >= 40) {
    recommendation = 'TRACK';
  }

  return { impact_score, direction, recommendation };
};

/**
 * PARSING LOGIC
 */
export const parseNseCsv = (text: string, source: Reg30Source): EventCandidate[] => {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(normalizeHeader);
  const candidates: EventCandidate[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => s(v).replace(/^"+|"+$/g, ""));
    if (values.length < headers.length) continue;

    const row: any = {};
    headers.forEach((h, idx) => row[h] = values[idx]);

    let symbol = s(row['SYMBOL'] || row['Symbol'] || null);
    let company_name = s(row['COMPANY NAME'] || row['Company Name'] || row['Issuer'] || 'Unknown');
    let raw_text = '';
    let category = '';
    let family: Reg30EventFamily | undefined;
    
    let dateStr = s(row['DATE'] || row['Date'] || row['EX-DATE'] || row['RECORD DATE'] || '');
    if (!dateStr || dateStr === "-") dateStr = new Date().toISOString().split('T')[0];
    
    if (source === 'XBRL') {
      category = s(row['EVENT/SUBJECT']);
      raw_text = `${category} | ${s(row['ATTACHMENT'])}`;
      
      const sub = lower(category);
      if (sub.includes('award') || sub.includes('bagging') || sub.includes('contract')) family = 'ORDER_CONTRACT';
      else if (sub.includes('issuance') || sub.includes('allotment') || sub.includes('capital')) family = 'DILUTION_CAPITAL';
      else if (sub.includes('dividend') || sub.includes('buyback') || sub.includes('bonus')) family = 'SHAREHOLDER_RETURNS';
      else if (sub.includes('director') || sub.includes('auditor') || sub.includes('kmp')) family = 'GOVERNANCE_MANAGEMENT';
      else if (sub.includes('fraud') || sub.includes('default') || sub.includes('litigation')) family = 'LITIGATION_REGULATORY';
    } else if (source === 'CorporateActions') {
      category = s(row['PURPOSE']);
      raw_text = category;
      family = 'SHAREHOLDER_RETURNS';
    } else if (source === 'CreditRating') {
      category = s(row['RATING ACTION']);
      raw_text = [
        s(row["COMPANY NAME"]),
        s(row["NAME OF CREDIT RATING AGENCY"]),
        `Rating: ${s(row["CREDIT RATING"])}`,
        `Outlook: ${s(row["OUTLOOK"])}`,
        `Action: ${s(row["RATING ACTION"])}`,
        `Date: ${s(row["DATE"])}`
      ].filter(Boolean).join(" | ");
      family = 'CREDIT_RATING';
    }

    if (family) {
      candidates.push({
        id: Math.random().toString(36).substr(2, 9),
        source,
        event_date: dateStr,
        event_date_time: dateStr,
        symbol: symbol || null,
        company_name,
        category,
        raw_text,
        event_family: family,
        link: s(row['ATTACHMENT'] || row['Link'] || row['XBRL FILE NAME'])
      });
    }
  }

  return candidates;
};

/**
 * LIVE SEARCH LOGIC
 */
export const searchOrderPipeline = async (symbols: string[]): Promise<EventCandidate[]> => {
  const mockFeed = [
    { title: "Larsen & Toubro emerges as L1 bidder for high-speed rail", description: "L&T has emerged as the lowest bidder for a massive infrastructure project worth over 5000 Cr.", link: "https://news.example.com/lt-l1", date: new Date().toISOString() },
    { title: "BHEL receives Work Order from NTPC", description: "BHEL has been awarded a contract for boiler installation.", link: "https://news.example.com/bhel-wo", date: new Date().toISOString() }
  ];

  const candidates: EventCandidate[] = [];
  const stages = [
    { key: 'LOA', patterns: ["loa", "letter of award", "letter of acceptance"] },
    { key: 'NTP', patterns: ["notice to proceed", "ntp"] },
    { key: 'L1', patterns: ["l1 bidder", "lowest bidder", "emerged as l1"] },
    { key: 'WO', patterns: ["work order", "wo received", "purchase order"] }
  ];

  for (const item of mockFeed) {
    const text = lower(item.title + " " + item.description);
    for (const stage of stages) {
      if (stage.patterns.some(p => text.includes(p))) {
        candidates.push({
          id: Math.random().toString(36).substr(2, 9),
          source: 'RSSNews',
          event_date: item.date.split('T')[0],
          event_date_time: item.date,
          symbol: null, 
          company_name: item.title.split(' ')[0], 
          category: `Detected ${stage.key}`,
          raw_text: `${item.title} | ${item.description}`,
          stage_hint: stage.key,
          event_family: 'ORDER_PIPELINE',
          link: item.link
        });
        break;
      }
    }
  }

  return candidates;
};

/**
 * PERSISTENCE LOGIC
 */
export const fetchAnalyzedEvents = async (limit = 500): Promise<Reg30Report[]> => {
  const { data, error } = await supabase
    .from('analyzed_events')
    .select('*')
    .order('event_date', { ascending: false })
    .order('impact_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Fetch Analysis Failed:", error);
    return [];
  }

  return data.map(item => ({
    id: item.id,
    event_date: item.event_date,
    symbol: item.symbol,
    company_name: item.company_name,
    source: item.source as Reg30Source,
    event_family: item.event_family as Reg30EventFamily,
    stage: item.stage,
    summary: item.summary,
    impact_score: item.impact_score,
    direction: item.direction as Sentiment,
    confidence: item.confidence,
    recommendation: item.action_recommendation as ActionRecommendation,
    link: item.source_link,
    extracted_data: item.extracted_json,
    evidence_spans: item.evidence_spans || []
  }));
};

export const clearReg30History = async () => {
  await supabase.from('analyzed_events').delete().gte('event_date', '1900-01-01');
  await supabase.from('event_candidates').delete().gte('event_date', '1900-01-01');
  await supabase.from('ingestion_runs').delete().gte('started_at', '1900-01-01');
};

/**
 * FINAL BATCH RUNNER WITH PERSISTENCE
 */
export const runReg30Analysis = async (
  candidates: EventCandidate[], 
  onProgress: (msg: string) => void,
  runType: 'CSV' | 'LIVE_SEARCH' = 'CSV',
  maxCalls = 50
): Promise<Reg30Report[]> => {
  // 1. Create Ingestion Run
  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ run_type: runType, status: 'RUNNING' })
    .select()
    .single();

  if (runError) throw runError;

  onProgress("Deduplicating candidates...");
  const seen = new Set();
  const unique = candidates.filter(c => {
    const key = `${c.symbol || c.company_name}-${c.event_family}-${c.raw_text.substring(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxCalls);

  // 2. Save Candidates (Batch Insert)
  if (unique.length > 0) {
    await supabase.from('event_candidates').insert(
      unique.map(c => ({
        ingestion_run_id: run.id,
        source: c.source,
        event_date: c.event_date,
        event_datetime: c.event_date_time,
        symbol: c.symbol,
        company_name: c.company_name,
        event_family: c.event_family,
        stage_hint: c.stage_hint,
        category: c.category,
        raw_text: c.raw_text,
        link: c.link,
        dedupe_key: `${c.symbol || c.company_name}-${c.event_family}-${c.event_date}`
      }))
    );
  }

  const reports: Reg30Report[] = [];
  let done = 0;

  for (const c of unique) {
    onProgress(`Analyzing ${++done}/${unique.length}: ${c.company_name}...`);
    
    // Gemini Caching Logic
    const cacheKey = getStringHash(`${c.event_family}-${c.stage_hint || ''}-${c.raw_text}`);
    const { data: cachedResponse } = await supabase
      .from('gemini_cache')
      .select('response_json')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    let aiResult;
    if (cachedResponse) {
      aiResult = cachedResponse.response_json;
    } else {
      aiResult = await analyzeReg30Event(c);
      if (aiResult) {
        // Save to cache for future re-runs
        await supabase.from('gemini_cache').upsert({ cache_key: cacheKey, response_json: aiResult });
      }
    }

    if (aiResult) {
      const mockMCap = 10000; // Simplified M-Cap assumption for scoring
      const scoring = calculateScoreAndRecommendation(
        c.event_family!, 
        aiResult.extracted, 
        aiResult.confidence, 
        mockMCap
      );

      const report: Reg30Report = {
        id: Math.random().toString(36).substr(2, 9),
        event_date: c.event_date,
        symbol: c.symbol,
        company_name: c.company_name,
        source: c.source,
        event_family: c.event_family!,
        stage: aiResult.extracted.stage,
        summary: aiResult.summary,
        impact_score: scoring.impact_score,
        direction: scoring.direction,
        confidence: aiResult.confidence,
        recommendation: scoring.recommendation,
        link: c.link,
        extracted_data: aiResult.extracted,
        evidence_spans: aiResult.evidence_spans
      };

      // 3. PERSISTENCE: Create Stable Fingerprint for Upsert
      // lower(symbol or company_name) + '|' + event_family + '|' + (stage or '') + '|' + event_date + '|' + hash(normalized_summary)
      const fingerprint = lower(`${c.symbol || c.company_name}|${c.event_family}|${aiResult.extracted.stage || ''}|${c.event_date}|${getStringHash(aiResult.summary)}`);
      
      const { error: upsertErr } = await supabase.from('analyzed_events').upsert({
        ingestion_run_id: run.id,
        event_date: c.event_date,
        event_datetime: c.event_date_time,
        symbol: c.symbol,
        company_name: c.company_name,
        source: c.source,
        event_family: c.event_family,
        stage: aiResult.extracted.stage,
        summary: aiResult.summary,
        direction: scoring.direction,
        confidence: aiResult.confidence,
        impact_score: scoring.impact_score,
        action_recommendation: scoring.recommendation,
        extracted_json: aiResult.extracted,
        evidence_spans: aiResult.evidence_spans,
        source_link: c.link,
        event_fingerprint: fingerprint,
        market_cap_cr: mockMCap
      }, { onConflict: 'event_fingerprint' });

      if (upsertErr) {
        console.error("Persist Analysis Error:", upsertErr);
      }

      reports.push(report);
    }
  }

  // 4. Mark Run Completion
  await supabase.from('ingestion_runs').update({ 
    status: 'SUCCESS', 
    completed_at: new Date().toISOString() 
  }).eq('id', run.id);

  return reports;
};
