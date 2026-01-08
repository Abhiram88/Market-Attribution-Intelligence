import React from 'react';
import { MarketLog } from '../types';

interface AttributionTableProps {
  logs: MarketLog[]; // This explicitly tells TypeScript what the prop is
}

export const AttributionTable: React.FC<AttributionTableProps> = ({ logs }) => {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-800 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs font-bold">
          <tr>
            <th className="px-6 py-4">Timestamp</th>
            <th className="px-6 py-4">Nifty Close</th>
            <th className="px-6 py-4">Change (Pts)</th>
            <th className="px-6 py-4">AI Attribution Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
              <td className="px-6 py-4 font-mono">{log.date}</td>
              <td className="px-6 py-4 font-bold">{log.niftyClose.toLocaleString()}</td>
              <td className={`px-6 py-4 font-bold ${log.niftyChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {log.niftyChange > 0 ? '+' : ''}{log.niftyChange.toFixed(2)}
              </td>
              <td className="px-6 py-4 text-slate-300">
                {log.attribution?.summary || (log.thresholdMet ? "🔄 Analysis Pending..." : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};