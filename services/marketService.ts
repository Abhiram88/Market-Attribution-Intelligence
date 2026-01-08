
import { MarketLog } from '../types';
import { supabase } from '../lib/supabase';

/**
 * SIMULATED BACKEND TOOL
 * Resilient manual upsert logic for market data telemetry.
 * Updated with realistic user-provided baseline for January 2026.
 */
export const ingestLatestMarketData = async (): Promise<MarketLog> => {
  const today = new Date().toISOString().split('T')[0];
  const lastNiftyClose = 26140.75; // Based on user screenshot "Prev close"
  const currentNiftyClose = 25876.85; // Based on user screenshot "Current"
  const niftyChange = currentNiftyClose - lastNiftyClose;
  
  const payload = {
    log_date: today,
    nifty_close: currentNiftyClose,
    nifty_change: niftyChange,
    nifty_change_percent: (niftyChange / lastNiftyClose) * 100,
    nasdaq_close: 23584.27,
    nasdaq_change_percent: -1.2,
    gift_nifty_close: 25950.00,
    threshold_met: Math.abs(niftyChange) > 90
  };

  // Resilient Manual Upsert
  let finalRecord;
  const { data: existing } = await supabase
    .from('market_logs')
    .select('id')
    .eq('log_date', today)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('market_logs')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    finalRecord = data;
  } else {
    const { data, error } = await supabase
      .from('market_logs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    finalRecord = data;
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
};
