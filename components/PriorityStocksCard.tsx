
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBreezeQuote, getStockMappings, BreezeQuote } from '../services/breezeService';

export const PriorityStocksCard: React.FC = () => {
  const [priorityStocks, setPriorityStocks] = useState<{ symbol: string, company_name: string }[]>([]);
  const [quotes, setQuotes] = useState<Record<string, BreezeQuote>>({});
  
  // Refs for logic to avoid stale closures in setInterval
  const symbolMapRef = useRef<Record<string, string>>({});
  const failureCountsRef = useRef<Record<string, number>>({});
  const failedSymbolsRef = useRef<Set<string>>(new Set());
  
  // State for UI to show failed status
  const [permanentlyFailed, setPermanentlyFailed] = useState<Set<string>>(new Set());
  
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_FAILURES = 8;

  const fetchTrackedSymbols = async () => {
    const { data, error } = await supabase
      .from('priority_stocks')
      .select('symbol, company_name')
      .order('added_at', { ascending: false });
    
    if (!error && data) {
      setPriorityStocks(data);
      // Fetch mappings for any new symbols
      const newMappings = await getStockMappings(data.map(s => s.symbol));
      symbolMapRef.current = { ...symbolMapRef.current, ...newMappings };
      return data;
    }
    return [];
  };

  const updateQuotesBatch = async (stocks: { symbol: string }[]) => {
    if (stocks.length === 0) return;

    for (const stock of stocks) {
      // Skip if already permanently failed
      if (failedSymbolsRef.current.has(stock.symbol)) continue;

      const iciciCode = symbolMapRef.current[stock.symbol] || stock.symbol;

      try {
        const q = await fetchBreezeQuote(iciciCode);
        
        // Success: Update state and reset failure count
        setQuotes(prev => ({ ...prev, [stock.symbol]: q }));
        failureCountsRef.current[stock.symbol] = 0;
        
      } catch (e) {
        const currentFails = (failureCountsRef.current[stock.symbol] || 0) + 1;
        failureCountsRef.current[stock.symbol] = currentFails;

        if (currentFails >= MAX_FAILURES) {
          console.error(`Feed Suspended: ${stock.symbol} (API Code: ${iciciCode}) reached max errors.`);
          failedSymbolsRef.current.add(stock.symbol);
          setPermanentlyFailed(new Set(failedSymbolsRef.current));
        } else {
          console.warn(`Feed Error ${currentFails}/${MAX_FAILURES}: ${stock.symbol}`);
        }
      }
      
      // Throttle sequential requests slightly to avoid proxy saturation
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  const removeStock = async (symbol: string) => {
    const { error } = await supabase
      .from('priority_stocks')
      .delete()
      .eq('symbol', symbol);
    
    if (!error) {
      setPriorityStocks(prev => prev.filter(s => s.symbol !== symbol));
      // Cleanup tracking
      delete failureCountsRef.current[symbol];
      failedSymbolsRef.current.delete(symbol);
      setPermanentlyFailed(new Set(failedSymbolsRef.current));
    }
  };

  useEffect(() => {
    const init = async () => {
      const stocks = await fetchTrackedSymbols();
      await updateQuotesBatch(stocks);
      
      pollInterval.current = setInterval(() => {
        setPriorityStocks(currentList => {
          updateQuotesBatch(currentList);
          return currentList;
        });
      }, 5000); 
    };

    init();

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Priority Watchlist</h2>
          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Mapped Breeze Feed</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
           <div className={`w-1.5 h-1.5 rounded-full ${permanentlyFailed.size > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
             {permanentlyFailed.size > 0 ? 'Partial Stream' : 'Connected'}
           </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 max-h-[320px]">
        {priorityStocks.length === 0 ? (
          <div className="py-12 text-center space-y-3 opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
            <p className="text-[10px] font-black uppercase tracking-widest">No tracked stocks</p>
          </div>
        ) : (
          priorityStocks.map((stock) => {
            const quote = quotes[stock.symbol];
            const hasFailed = permanentlyFailed.has(stock.symbol);
            const isPositive = (quote?.change || 0) >= 0;

            return (
              <div key={stock.symbol} className={`group relative flex items-center justify-between p-5 rounded-2xl border transition-all ${
                hasFailed ? 'bg-rose-50/40 border-rose-100 opacity-80' : 'bg-slate-50 hover:bg-indigo-50/50 border-slate-100 hover:border-indigo-100'
              }`}>
                <div className="flex flex-col">
                  <span className={`text-sm font-black transition-colors ${hasFailed ? 'text-rose-900' : 'text-slate-900'}`}>{stock.symbol}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[140px]">{stock.company_name}</span>
                </div>
                
                <div className="flex items-center gap-6">
                  {hasFailed ? (
                    <div className="text-right">
                      <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">LINK ERROR</span>
                      <p className="text-[7px] text-slate-400 font-bold uppercase">Max Tries Exceeded</p>
                    </div>
                  ) : quote ? (
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900 tabular-nums">
                        {quote.last_traded_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <div className={`flex items-center justify-end gap-1 text-[9px] font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <span>{isPositive ? '▲' : '▼'}</span>
                        <span className="tabular-nums">{Math.abs(quote.percent_change).toFixed(2)}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-16 h-6 bg-slate-200 rounded-lg animate-pulse" />
                  )}
                  
                  <button 
                    onClick={() => removeStock(stock.symbol)}
                    className="p-2 text-slate-300 hover:text-rose-500 transition-all cursor-pointer"
                    title="Remove"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-tight">
          System maps symbols to ICICI Breeze codes. 8 consecutive errors trigger auto-suspension.
        </p>
      </div>
    </div>
  );
};
