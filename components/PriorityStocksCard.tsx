
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBreezeQuote, getStockMappings, BreezeQuote } from '../services/breezeService';

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

export const PriorityStocksCard: React.FC = () => {
  const [priorityStocks, setPriorityStocks] = useState<PriorityStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  
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
        
        // Initialize quotes from database cache
        const initialQuotes: Record<string, StockQuote> = {};
        data.forEach((stock: any) => {
          if (stock.last_price !== null && stock.last_price !== undefined) {
            initialQuotes[stock.symbol] = {
              last_traded_price: stock.last_price,
              change: stock.change_val || 0,
              percent_change: stock.change_percent || 0,
              lastUpdated: stock.last_updated ? new Date(stock.last_updated).getTime() : Date.now(),
              isError: false,
              open: 0, high: 0, low: 0, previous_close: 0, volume: 0 // Mocking required fields
            };
          }
        });
        setQuotes(prev => ({ ...initialQuotes, ...prev }));

        const newMappings = await getStockMappings(data.map((s: any) => s.symbol));
        symbolMapRef.current = { ...symbolMapRef.current, ...newMappings };
        return data;
      }
    } catch (e) {
      console.error("Watchlist fetch failed:", e);
    }
    return [];
  };

  /**
   * HIGH-FREQUENCY POLLING ENGINE
   * Fetches latest quotes every second and persists to Supabase.
   */
  const updateQuotesBatch = async (stocks: PriorityStock[]) => {
    if (stocks.length === 0 || isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    setIsUpdating(true);

    const requestPromises = stocks.map((stock, index) => {
      const iciciCode = symbolMapRef.current[stock.symbol] || stock.symbol;
      
      return new Promise<{ symbol: string, quote?: BreezeQuote, success: boolean }>(async (resolve) => {
        // Staggered to prevent rate-limiting
        await new Promise(r => setTimeout(r, index * 50));
        
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

        // Update local state
        setQuotes(prev => ({ ...prev, [res.symbol]: quoteObj }));

        // Background persistence
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
      if (stocks.length > 0) {
        await updateQuotesBatch(stocks);
      }
    };

    init();

    // MATCHING NIFTY 1S POLLING
    pollInterval.current = setInterval(() => {
      setPriorityStocks(currentList => {
        updateQuotesBatch(currentList);
        return currentList;
      });
    }, 1000);

    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, []);

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl h-full flex flex-col group">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-100 bg-emerald-50">
            <div className={`w-1 h-1 rounded-full bg-emerald-500 animate-[pulse_0.5s_ease-in-out_infinite]`} />
            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-[0.2em]">
              LIVE TICK FEED
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter mt-1">Watchlist</h2>
        </div>
        <div className="text-right">
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active</p>
           <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tight">Sync 1000ms</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[220px] custom-scrollbar relative z-10">
        {priorityStocks.length === 0 ? (
          <div className="py-8 text-center space-y-2 opacity-40">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Empty Ledger</p>
          </div>
        ) : (
          priorityStocks.map((stock) => {
            const quote = quotes[stock.symbol];
            const isPositive = (quote?.change || 0) >= 0;
            const lastUpdateLabel = quote ? new Date(quote.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : null;

            return (
              <div key={stock.symbol} className="group relative flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-100 hover:shadow-md transition-all duration-300">
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
                    <div className="flex flex-col items-end gap-1">
                      <div className="w-12 h-3 bg-slate-200 rounded animate-pulse" />
                    </div>
                  )}
                  
                  <button 
                    onClick={() => removeStock(stock.symbol)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 transition-all rounded hover:bg-rose-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 relative z-10">
        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-tight">
          Streaming active. Staggered 50ms polling enabled.
        </p>
      </div>
    </div>
  );
};
