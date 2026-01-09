
import React from 'react';
import { LedgerEvent } from '../types';

interface ResearchTableProps {
  events: LedgerEvent[];
  onViewDetails: (e: LedgerEvent) => void;
}

export const ResearchTable: React.FC<ResearchTableProps> = ({ events, onViewDetails }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse min-w-[900px]">
        <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-[0.2em] border-b border-slate-100">
          <tr>
            <th className="px-10 py-7">Timestamp</th>
            <th className="px-10 py-7">Nifty Close</th>
            <th className="px-10 py-7">Change (Pts)</th>
            <th className="px-10 py-7">AI Attribution Summary</th>
            <th className="px-10 py-7 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {events.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-10 py-32 text-center">
                <p className="font-black uppercase tracking-widest text-xs text-slate-300">No Data Available</p>
              </td>
            </tr>
          ) : (
            events.map((e) => (
              <tr key={e.id} className="hover:bg-indigo-50/20 transition-all group">
                <td className="px-10 py-8">
                  <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    {e.event_date}
                  </span>
                </td>
                <td className="px-10 py-8">
                  <span className="text-base font-black text-slate-900 tracking-tight">
                    {e.nifty_close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className={`px-10 py-8 font-black text-sm`}>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${e.change_pts >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    <span className="text-[10px]">{e.change_pts > 0 ? '▲' : '▼'}</span>
                    {Math.abs(e.change_pts).toFixed(1)}
                  </div>
                </td>
                <td className="px-10 py-8 max-w-xl">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[9px] font-black uppercase bg-slate-900 text-white px-3 py-1 rounded-lg">
                      {e.macro_reason}
                    </span>
                    <span className={`text-[9px] font-black uppercase flex items-center gap-1.5 ${
                      e.sentiment === 'POSITIVE' ? 'text-emerald-600' : 
                      e.sentiment === 'NEGATIVE' ? 'text-rose-600' : 'text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${e.sentiment === 'POSITIVE' ? 'bg-emerald-500' : e.sentiment === 'NEGATIVE' ? 'bg-rose-500' : 'bg-slate-300'}`}></span>
                      {e.sentiment}
                    </span>
                  </div>
                  <h4 className="text-slate-900 font-black text-[13px] leading-snug mb-2 group-hover:text-indigo-600 transition-colors">
                    {e.reason}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed font-medium line-clamp-2">
                    {e.ai_attribution_summary}
                  </p>
                </td>
                <td className="px-10 py-8 text-right">
                  <button 
                    onClick={() => onViewDetails(e)}
                    className="inline-flex items-center gap-3 bg-slate-900 text-white hover:bg-indigo-600 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
