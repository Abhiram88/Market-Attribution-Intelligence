import React from 'react';
import { LedgerEvent } from '../types';

interface ResearchTableProps {
  events: LedgerEvent[];
  onViewDetails: (e: LedgerEvent) => void;
}

export const ResearchTable: React.FC<ResearchTableProps> = ({ events, onViewDetails }) => {
  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-left text-sm border-collapse min-w-[1000px] xl:min-w-0">
        <thead className="bg-slate-50/50 text-slate-400 uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-100">
          <tr>
            <th className="px-6 sm:px-10 py-6">Date</th>
            <th className="px-6 sm:px-10 py-6">Nifty Close</th>
            <th className="px-6 sm:px-10 py-6">% Change</th>
            <th className="px-6 sm:px-10 py-6">Intelligence Summary</th>
            <th className="px-6 sm:px-10 py-6">Driver</th>
            <th className="px-6 sm:px-10 py-6 text-center">Impact</th>
            <th className="px-6 sm:px-10 py-6">Affected Sectors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {events.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-10 py-32 text-center text-slate-300 font-black uppercase tracking-widest text-xs">
                Ledger empty. Run 'Verified Audit' to shortlist high-volatility events.
              </td>
            </tr>
          ) : (
            events.map((e) => {
              const prevClose = e.nifty_close - e.change_pts;
              const percentChange = (e.change_pts / prevClose) * 100;
              const isPositive = e.change_pts >= 0;

              return (
                <tr key={e.id} className="hover:bg-slate-50/60 transition-all group border-b border-slate-50 last:border-0">
                  <td className="px-6 sm:px-10 py-7">
                    <span className="flex items-center gap-2 text-[10px] font-black text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-sm whitespace-nowrap">
                      {e.event_date}
                    </span>
                  </td>
                  <td className="px-6 sm:px-10 py-7">
                    <span className="text-sm font-black text-slate-900 tracking-tighter">
                      {e.nifty_close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-6 sm:px-10 py-7">
                    <div className="inline-flex flex-col gap-0.5 font-black">
                      <span className={`text-[11px] flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '▲' : '▼'} {Math.abs(percentChange).toFixed(2)}%
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter whitespace-nowrap">
                        ({isPositive ? '+' : '-'}{Math.abs(e.change_pts).toFixed(1)} pts)
                      </span>
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-7 max-w-lg">
                    <div className="space-y-1.5">
                      <p className="text-slate-800 font-bold text-[11px] leading-snug uppercase tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                        {e.reason || "Shortlisted: Awaiting Attribution"}
                      </p>
                      {e.ai_attribution_summary && (
                        <button 
                          onClick={() => onViewDetails(e)} 
                          className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em] hover:text-indigo-700 transition-colors flex items-center gap-1"
                        >
                          Access Intelligence Dossier
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-7">
                    <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-md tracking-widest whitespace-nowrap">
                      {e.macro_reason || "OTHER"}
                    </span>
                  </td>
                  <td className="px-6 sm:px-10 py-7 text-center">
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 text-white text-[10px] font-black shadow-lg shadow-slate-900/10">
                      {e.score || 0}
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-7">
                    <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                      {e.affected_sectors && e.affected_sectors.length > 0 ? (
                        e.affected_sectors.slice(0, 4).map((s, idx) => (
                          <span key={idx} className="text-[8px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md uppercase whitespace-nowrap">
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-[8px] text-slate-300 font-bold italic uppercase">Pending</span>
                      )}
                      {e.affected_sectors && e.affected_sectors.length > 4 && (
                        <span className="text-[8px] font-bold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                          +{e.affected_sectors.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};