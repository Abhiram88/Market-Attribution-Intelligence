
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBreezeQuote, fetchBreezeHistorical, getStockMappings, BreezeQuote, HistoricalBar } from '../services/breezeService';
import { getMarketSessionStatus } from '../services/marketService';
import { LiquidityMetrics } from '../types';

interface StockQuote extends BreezeQuote {
  lastUpdated: number;
  isError?: boolean;
}

interface PriorityStock {
  symbol: string;
  company_name: string;
  last_price?: number;
  change_val?: number;
  change_percent?: number;
  last_updated?: string;
}

interface HistoricalCache {
  avg_vol_20d: number;
  last_fetched: number;
}

export const PriorityStocksCard: React.FC = () => {
  const [priorityStocks, setPriorityStocks] = useState<PriorityStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [historicalCache, setHistoricalCache] = useState<Record<string, HistoricalCache>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [showRawFeed, setShowRawFeed] = useState(false);
  
  const symbolMapRef = useRef<Record<string, string>>({});
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUpdatingRef = useRef(false);

  const fetchTrackedSymbols = async () => {
    try {
      const { data, error } = await supabase
        .from('priority_stocks')
        .select('*')
        .order('added_at', { ascending: false });
      
      if (!error && data) {
        setPriorityStocks(data);
        
        const initialQuotes: Record<string, StockQuote> = {};
        data.forEach((stock: any) => {
          if (stock.last_price !== null && stock.last_price !== undefined) {
            initialQuotes[stock.symbol] = {
              last_traded_price: stock.last_price,
              change: stock.change_val || 0,
              percent_change: stock.change_percent || 0,
              lastUpdated: stock.last_updated ? new Date(stock.last_updated).getTime() : Date.now(),
              isError: false,
              open: 0, high: 0, low: 0, previous_close: 0, volume: 0
            };
          }
        });
        setQuotes(prev => ({ ...initialQuotes, ...prev }));

        const newMappings = await getStockMappings(data.map((s: any) => s.symbol));
        symbolMapRef.current = { ...symbolMapRef.current, ...newMappings };
        
        // Only fetch historical if market open (or optionally always, but skip for now to save quota)
        const marketStatus = getMarketSessionStatus();
        if (marketStatus.isOpen) {
          data.forEach((stock: any) => {
            refreshHistoricalData(stock.symbol);
          });
        }

        return data;
      }
    } catch (e) {
      console.error("Watchlist fetch failed:", e);
    }
    return [];
  };

  const refreshHistoricalData = async (symbol: string) => {
    try {
      const iciciCode = symbolMapRef.current[symbol] || symbol;
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 40);

      const bars = await fetchBreezeHistorical(
        iciciCode, 
        thirtyDaysAgo.toISOString().split('T')[0], 
        today.toISOString().split('T')[0]
      );

      if (bars.length > 0) {
        const last20 = bars.slice(-20);
        const avgVol = last20.reduce((acc, bar) => acc + bar.volume, 0) / last20.length;
        setHistoricalCache(prev => ({
          ...prev,
          [symbol]: { avg_vol_20d: avgVol, last_fetched: Date.now() }
        }));
      }
    } catch (e) {
      console.warn(`Historical sync failed for ${symbol}`);
    }
  };

  const updateQuotesBatch = async (stocks: PriorityStock[]) => {
    // Market Status Guard: Don't poll if market is closed or tab is hidden
    const marketStatus = getMarketSessionStatus();
    if (!marketStatus.isOpen || document.hidden) return; 

    if (stocks.length === 0 || isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    setIsUpdating(true);

    const requestPromises = stocks.map((stock, index) => {
      const iciciCode = symbolMapRef.current[stock.symbol] || stock.symbol;
      
      return new Promise<{ symbol: string, quote?: BreezeQuote, success: boolean }>(async (resolve) => {
        await new Promise(r => setTimeout(r, index * 300));
        try {
          const quote = await fetchBreezeQuote(iciciCode);
          resolve({ symbol: stock.symbol, quote, success: true });
        } catch (error) {
          resolve({ symbol: stock.symbol, success: false });
        }
      });
    });

    const results = await Promise.all(requestPromises);

    for (const res of results) {
      if (res.success && res.quote) {
        const quoteObj = {
          ...res.quote,
          lastUpdated: Date.now(),
          isError: false
        };

        setQuotes(prev => ({ ...prev, [res.symbol]: quoteObj }));

        supabase
          .from('priority_stocks')
          .update({
            last_price: res.quote.last_traded_price,
            change_val: res.quote.change,
            change_percent: res.quote.percent_change,
            last_updated: new Date().toISOString()
          })
          .eq('symbol', res.symbol)
          .then(); 
      } else {
        setQuotes(prev => {
          if (!prev[res.symbol]) return prev;
          return {
            ...prev,
            [res.symbol]: { ...prev[res.symbol], isError: true }
          };
        });
      }
    }

    setIsUpdating(false);
    isUpdatingRef.current = false;
  };

  const calculateMetrics = (symbol: string): LiquidityMetrics | null => {
    const q = quotes[symbol];
    const h = historicalCache[symbol];
    if (!q) return null;

    const bid = q.best_bid_price || 0;
    const ask = q.best_offer_price || 0;
    const bidQty = q.best_bid_quantity || 0;
    const askQty = q.best_offer_quantity || 0;
    const mid = (bid + ask) / 2;
    
    let spread_pct: number | null = null;
    if (bid > 0 && ask > 0 && ask >= bid && mid > 0) {
      spread_pct = ((ask - bid) / mid) * 100;
    } else if ((bid > 0 || ask > 0) && getMarketSessionStatus().isOpen) {
      // Only warn if market is actually open
      console.warn(`[Microstructure] Invalid spread data for ${symbol}: Bid=${bid}, Ask=${ask}`);
    }

    const depth_ratio = (bidQty + 1) / (askQty + 1);
    
    const avgVol = h?.avg_vol_20d || null;
    const vol_ratio = (avgVol && q.volume) ? q.volume / avgVol : null;

    const close = q.last_traded_price;
    const high = q.high;
    const low = q.low;
    const open = q.open;
    const range = Math.max(high - low, 0.01);

    const wick_ratio = (high - Math.max(open, close)) / range;
    const close_pos = (close - low) / range;
    
    let regime: 'BREAKOUT' | 'DISTRIBUTION' | 'NEUTRAL' = 'NEUTRAL';
    if (wick_ratio > 0.55 && close_pos < 0.35 && vol_ratio !== null && vol_ratio > 2.5) {
        regime = 'DISTRIBUTION';
    } else if (close_pos > 0.70 && vol_ratio !== null && vol_ratio > 2.0) {
        regime = 'BREAKOUT';
    }

    let exec: 'LIMIT ONLY' | 'OK FOR MARKET' | 'AVOID' = 'LIMIT ONLY';
    if (spread_pct === null) {
      exec = 'LIMIT ONLY';
    } else if (spread_pct > 0.50) {
      exec = 'AVOID';
    } else if (spread_pct >= 0.15 && spread_pct <= 0.50) {
      exec = 'LIMIT ONLY';
    } else if (spread_pct < 0.15 && (vol_ratio === null || vol_ratio >= 1.2)) {
      exec = 'OK FOR MARKET';
    }
    
    if (vol_ratio !== null && vol_ratio < 1.0) {
      exec = 'LIMIT ONLY';
    }

    return {
      spread_pct,
      depth_ratio,
      vol_ratio: vol_ratio || 0,
      regime,
      execution_style: exec,
      bid, ask, bidQty, askQty,
      avg_vol_20d: avgVol || 0
    };
  };

  const getRecommendationHint = (metrics: LiquidityMetrics | null) => {
    const marketStatus = getMarketSessionStatus();
    if (!marketStatus.isOpen) return "Market Closed - Stats Standby";
    if (!metrics) return "Awaiting depth...";
    if (metrics.execution_style === 'AVOID') return "Avoid thin liquidity";
    if (metrics.regime === 'DISTRIBUTION') return "Sell-on-news risk; wait";
    if (metrics.regime === 'BREAKOUT') return "Momentum OK if volume holds";
    return "Watch confirmation";
  };

  const removeStock = async (symbol: string) => {
    const { error } = await supabase.from('priority_stocks').delete().eq('symbol', symbol);
    if (!error) {
      setPriorityStocks(prev => prev.filter(s => s.symbol !== symbol));
      setQuotes(prev => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
    }
  };

  useEffect(() => {
    const init = async () => {
      const stocks = await fetchTrackedSymbols();
      const marketStatus = getMarketSessionStatus();

      // Only perform proxy initial load if market is open
      if (stocks.length > 0 && marketStatus.isOpen) {
        const initialLoad = async () => {
          setIsUpdating(true);
          const requestPromises = stocks.map(async (stock, index) => {
            const iciciCode = symbolMapRef.current[stock.symbol] || stock.symbol;
            await new Promise(r => setTimeout(r, index * 200));
            try {
              const quote = await fetchBreezeQuote(iciciCode);
              return { symbol: stock.symbol, quote, success: true };
            } catch (error) {
              return { symbol: stock.symbol, success: false };
            }
          });
          const results = await Promise.all(requestPromises);
          setQuotes(prev => {
            const next = { ...prev };
            results.forEach(res => {
              if (res.success && res.quote) {
                next[res.symbol] = { ...res.quote, lastUpdated: Date.now(), isError: false };
              }
            });
            return next;
          });
          setIsUpdating(false);
        };
        
        initialLoad();
      }
    };
    init();

    // 4s polling for microstructure metrics (will be guarded inside updateQuotesBatch)
    pollInterval.current = setInterval(() => {
      setPriorityStocks(currentList => {
        const marketStatus = getMarketSessionStatus();
        if (marketStatus.isOpen) {
          updateQuotesBatch(currentList);
        }
        return currentList;
      });
    }, 4000);

    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, []);

  const marketStatus = getMarketSessionStatus();

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl h-full flex flex-col group">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-100 bg-emerald-50">
            <div className={`w-1 h-1 rounded-full ${marketStatus.isOpen ? 'bg-emerald-500 animate-[pulse_0.5s_ease-in-out_infinite]' : 'bg-slate-300'}`} />
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${marketStatus.isOpen ? 'text-emerald-600' : 'text-slate-400'}`}>
              {marketStatus.isOpen ? 'LIQUIDITY TICKER' : 'LEDGER STANDBY'}
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter mt-1">Watchlist</h2>
        </div>
        <div className="flex flex-col items-end">
           <button 
             onClick={() => setShowRawFeed(!showRawFeed)}
             className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-all ${showRawFeed ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-400 border-slate-100 hover:bg-slate-50'}`}
           >
             Raw Feed
           </button>
           <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tight mt-1">
             {marketStatus.isOpen ? 'Stagger 300ms' : 'Polling Suspended'}
           </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[350px] custom-scrollbar relative z-10">
        {priorityStocks.length === 0 ? (
          <div className="py-8 text-center space-y-2 opacity-40">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Empty Ledger</p>
          </div>
        ) : (
          priorityStocks.map((stock) => {
            const quote = quotes[stock.symbol];
            const metrics = calculateMetrics(stock.symbol);
            const isPositive = (quote?.change || 0) >= 0;
            const isExpanded = expandedSymbol === stock.symbol;

            return (
              <div key={stock.symbol} className="group relative rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-100 hover:shadow-md transition-all duration-300 overflow-hidden">
                <div 
                  className="flex items-center justify-between p-3.5 cursor-pointer"
                  onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">{stock.symbol}</span>
                      {quote?.isError && (
                        <div className="w-1 h-1 bg-amber-400 rounded-full animate-pulse" />
                      )}
                    </div>
                    <span className="text-[7px] font-bold text-slate-400 uppercase truncate max-w-[100px]">{stock.company_name}</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {quote ? (
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900 tabular-nums">
                          {quote.last_traded_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <div className={`flex items-center justify-end gap-1 text-[8px] font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span>{isPositive ? '▲' : '▼'}</span>
                          <span className="tabular-nums">{Math.abs(quote.percent_change).toFixed(2)}%</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-3 bg-slate-200 rounded animate-pulse" />
                    )}
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeStock(stock.symbol); }}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-all rounded hover:bg-rose-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 bg-white border-t border-slate-50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    {showRawFeed ? (
                      <pre className="text-[8px] font-mono bg-slate-50 p-3 rounded-xl overflow-x-auto text-slate-500 max-h-40 overflow-y-auto">
                        {JSON.stringify({ quote, metrics, historical: historicalCache[stock.symbol] }, null, 2)}
                      </pre>
                    ) : (
                      <>
                        <div className="space-y-5">
                          {/* LINE 1: MICROSTRUCTURE */}
                          <div className="grid grid-cols-3 gap-4">
                            <div className="flex flex-col gap-1.5">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Best Bid</p>
                              <p className="text-[10px] font-black text-slate-900 tabular-nums">
                                ₹{metrics?.bid?.toLocaleString() || '—'} <span className="text-slate-400 text-[8px]">({metrics?.bidQty || 0})</span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Best Ask</p>
                              <p className="text-[10px] font-black text-slate-900 tabular-nums">
                                ₹{metrics?.ask?.toLocaleString() || '—'} <span className="text-slate-400 text-[8px]">({metrics?.askQty || 0})</span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5 text-right">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Spread %</p>
                              <div>
                                <span className={`px-2 py-1 rounded text-[10px] font-black tabular-nums border inline-block ${
                                  metrics?.spread_pct === null ? 'bg-slate-50 text-slate-400 border-slate-100' :
                                  metrics.spread_pct < 0.15 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                  metrics.spread_pct < 0.50 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                }`}>
                                  {metrics?.spread_pct !== null ? metrics.spread_pct.toFixed(3) + '%' : '—'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* LINE 2: LIQUIDITY/REGIME */}
                          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-50">
                            <div className="flex flex-col gap-1.5">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Vol Today</p>
                              <p className="text-[9px] font-black text-slate-900">{(quote?.volume ? (quote.volume / 1000000).toFixed(2) : '—')}M</p>
                            </div>
                            <div className="flex flex-col gap-1.5 text-center">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Vol Ratio</p>
                              <p className={`text-[9px] font-black ${metrics?.vol_ratio ? (metrics.vol_ratio > 2 ? 'text-emerald-600' : metrics.vol_ratio < 1 ? 'text-rose-500' : 'text-slate-900') : 'text-slate-400'}`}>
                                {metrics?.vol_ratio?.toFixed(2) || '0.00'}x
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5 text-center">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Regime</p>
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-block ${
                                  metrics?.regime === 'BREAKOUT' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                  metrics?.regime === 'DISTRIBUTION' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  'bg-slate-50 text-slate-400 border-slate-100'
                                }`}>
                                  {metrics?.regime || '—'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 text-right">
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Exec Style</p>
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-block ${
                                  metrics?.execution_style === 'OK FOR MARKET' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                  metrics?.execution_style === 'AVOID' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  'bg-amber-50 text-amber-600 border-amber-100'
                                }`}>
                                  {metrics?.execution_style || '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* HINT FOOTER */}
                        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
                           <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${metrics?.execution_style === 'OK FOR MARKET' ? 'bg-emerald-500' : metrics?.execution_style === 'AVOID' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                               {getRecommendationHint(metrics)}
                             </p>
                           </div>
                           <div className="flex items-baseline gap-1">
                              <span className="text-[7px] font-black text-slate-400 uppercase">Avg Vol (20D):</span>
                              <span className="text-[8px] font-bold text-slate-600">{metrics?.avg_vol_20d ? (metrics.avg_vol_20d / 1000000).toFixed(1) : '—'}M</span>
                           </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 relative z-10">
        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-tight">
          {marketStatus.isOpen ? 'Microstructure Audit Active. Staggered 300ms polling enabled.' : 'Market Closed. Displaying last known ledger values from persistence layer.'}
        </p>
      </div>
    </div>
  );
};
