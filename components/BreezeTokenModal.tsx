import React, { useState } from 'react';
import { setDailyBreezeSession } from '../services/breezeService';

interface BreezeTokenModalProps {
  onSave: () => void;
  onClose: () => void;
}

export const BreezeTokenModal: React.FC<BreezeTokenModalProps> = ({ onSave, onClose }) => {
  const [proxyUrl, setProxyUrl] = useState(localStorage.getItem('breeze_proxy_url') || '');
  const [adminKey, setAdminKey] = useState(localStorage.getItem('breeze_proxy_key') || '');
  const [apiSession, setApiSession] = useState(localStorage.getItem('breeze_api_session') || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyUrl.trim()) return setError("Gateway URL is required.");
    if (!apiSession.trim()) return setError("Daily Session Token is required.");

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Persist base config
      localStorage.setItem('breeze_proxy_url', proxyUrl.trim().replace(/\/$/, ""));
      if (adminKey) localStorage.setItem('breeze_proxy_key', adminKey.trim());
      localStorage.setItem('breeze_api_session', apiSession.trim());

      // 2. Transmit session to proxy
      await setDailyBreezeSession(apiSession.trim(), adminKey.trim());
      
      onSave();
    } catch (err: any) {
      setError(err.message || "Gateway Connection Failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="p-8 bg-indigo-600 text-white">
          <h2 className="text-2xl font-black tracking-tight uppercase">Breeze Gateway Sync</h2>
          <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
            Daily Intelligence Link Required
          </p>
        </div>
        
        <form onSubmit={handleUpdateSession} className="p-8 space-y-6">
          <div className="space-y-4">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[11px] font-bold uppercase">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gateway Endpoint</label>
              <input
                type="url"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="https://breeze-proxy-xyz.run.app"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Key (Optional)</label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Matches PROXY_API_KEY"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Daily API Session</label>
              <textarea
                required
                rows={2}
                value={apiSession}
                onChange={(e) => setApiSession(e.target.value)}
                placeholder="Paste the session token from ICICI portal..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest transition-all">Dismiss</button>
            <button 
              type="submit" 
              disabled={isProcessing}
              className="flex-1 px-6 py-4 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-50"
            >
              {isProcessing ? "Connecting..." : "Sync Gateway"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};