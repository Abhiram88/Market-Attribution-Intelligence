
import React, { useState } from 'react';
import { fetchAttachmentText } from '../services/reg30Service';
import { analyzeReg30Event } from '../services/reg30GeminiService';

interface SimulationModalProps {
  onClose: () => void;
}

export const SimulationModal: React.FC<SimulationModalProps> = ({ onClose }) => {
  const [url, setUrl] = useState('https://nsearchives.nseindia.com/corporate/ixbrl/ANN_AWARD_BAGGING_135302_16012026144036_iXBRL_WEB.html');
  const [isProcessing, setIsProcessing] = useState(false);
  const [log, setLog] = useState<{ msg: string; type: 'info' | 'success' | 'error' | 'ai' }[]>([]);
  const [result, setResult] = useState<any | null>(null);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'ai' = 'info') => {
    setLog(prev => [...prev, { msg, type }]);
  };

  const runSimulation = async () => {
    setIsProcessing(true);
    setLog([]);
    setResult(null);
    addLog("Initializing forensic audit simulation...", "info");

    try {
      const DEFAULT_BREEZE_PROXY = "https://breeze-proxy-919207294606.us-west1.run.app";
      const proxyBase = localStorage.getItem('breeze_proxy_url') || DEFAULT_BREEZE_PROXY;
      const proxyEndpoint = `${proxyBase.trim().replace(/\/$/, "")}/api/attachment/parse`;

      addLog(`Handshake: ${proxyEndpoint}`, "info");
      addLog("Streaming iXBRL/PDF content through forensic gateway...", "info");
      
      const text = await fetchAttachmentText(url);
      
      if (!text || text.length < 100) {
        addLog("Fatal Error: Buffer empty. Check NSE accessibility or Proxy configuration.", "error");
        setIsProcessing(false);
        return;
      }
      addLog(`Handshake Complete: Buffered ${text.length} characters.`, "success");

      addLog("Booting Gemini 3 Pro Forensic Module...", "ai");
      const candidate: any = {
        company_name: "TARGET_ENTITY",
        symbol: "TARGET",
        category: "REGULATORY_DISCLOSURE",
        raw_text: "Simulation Environment",
        attachment_text: text,
        event_family: "ORDER_CONTRACT"
      };

      const aiResult = await analyzeReg30Event(candidate);
      if (aiResult) {
        addLog("Data synthesis finalized. Generating Dossier.", "success");
        setResult(aiResult);
      } else {
        addLog("Engine Fault: Model failed to parse disclosure logic.", "error");
      }
    } catch (err: any) {
      addLog(`System Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="p-10 bg-indigo-600 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">Intelligence Debugger</h2>
            <p className="text-indigo-100 text-[10px] font-black uppercase tracking-[0.3em] mt-3 opacity-70">Expert Event Analysis Protocol v3.1</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-colors border border-white/20">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/50">
           {/* INPUT */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-3">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Disclosure iXBRL Artifact (URL)</label>
             <div className="flex gap-4">
               <input 
                 type="text" 
                 className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-mono outline-none focus:ring-4 ring-indigo-500/5 transition-all"
                 value={url}
                 onChange={e => setUrl(e.target.value)}
               />
               <button 
                 onClick={runSimulation}
                 disabled={isProcessing}
                 className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-600 transition-all shadow-xl active:scale-95 disabled:opacity-20"
               >
                 {isProcessing ? "Analyzing..." : "Analyze Artifact"}
               </button>
             </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* AUDIT LOG (LEFT) */}
              <div className="lg:col-span-4 bg-white p-8 rounded-[3rem] border border-slate-200 space-y-6 shadow-sm">
                 <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Process Log</h3>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                 </div>
                 <div className="space-y-4">
                   {log.length === 0 && <div className="py-12 text-center text-[11px] text-slate-300 italic">No cycles executed. Waiting for input.</div>}
                   {log.map((l, i) => (
                     <div key={i} className={`flex gap-3 text-[11px] font-bold leading-relaxed animate-in slide-in-from-left-2 ${
                       l.type === 'success' ? 'text-emerald-600' : 
                       l.type === 'error' ? 'text-rose-600' : 
                       l.type === 'ai' ? 'text-indigo-600' : 'text-slate-500'
                     }`}>
                       <span className="opacity-20 shrink-0">{(i+1).toString().padStart(2, '0')}</span>
                       <span className="break-all">{l.msg}</span>
                     </div>
                   ))}
                 </div>
              </div>

              {/* DOSSIER PREVIEW (RIGHT) */}
              <div className="lg:col-span-8 space-y-8">
                 {result ? (
                   <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                      {/* STATS OVERVIEW */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stage</p>
                          <p className="text-xl font-black text-slate-900">{result.extracted?.stage || 'N/A'}</p>
                        </div>
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Order Value</p>
                          <p className="text-xl font-black text-indigo-600">{result.extracted?.order_value_cr?.toFixed(2) || '0.00'} Cr</p>
                        </div>
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Confidence</p>
                          <p className="text-xl font-black text-slate-900">{Math.round(result.confidence * 100)}%</p>
                        </div>
                        <div className={`p-6 rounded-[2rem] border shadow-sm ${
                          result.direction_hint === 'POSITIVE' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'
                        }`}>
                          <p className="text-[9px] font-black uppercase opacity-60">Bias</p>
                          <p className="text-xl font-black">{result.direction_hint}</p>
                        </div>
                      </div>

                      {/* SUMMARY */}
                      <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                         <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                           Forensic Narrative
                           <div className="h-[1px] flex-1 bg-slate-100"></div>
                         </h3>
                         <p className="text-sm font-medium text-slate-600 leading-relaxed">
                           {result.summary}
                         </p>
                      </div>

                      {/* AUDIT TRAIL / EVIDENCE */}
                      <div className="bg-[#0a0f18] p-10 rounded-[3rem] shadow-2xl text-white space-y-6">
                         <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Verified Evidence Spans</h3>
                         <div className="space-y-3">
                           {result.evidence_spans?.map((span: string, idx: number) => (
                             <div key={idx} className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all group">
                                <span className="text-indigo-500 font-mono text-[10px] shrink-0">[{idx+1}]</span>
                                <p className="text-[11px] text-slate-300 font-medium italic group-hover:text-white transition-colors">"{span}"</p>
                             </div>
                           ))}
                         </div>
                      </div>

                      {/* MISSING FIELDS */}
                      {result.missing_fields?.length > 0 && (
                        <div className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100 space-y-4">
                           <h3 className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" /></svg>
                             Intelligence Gaps Detected
                           </h3>
                           <div className="flex flex-wrap gap-2">
                             {result.missing_fields.map((field: string) => (
                               <span key={field} className="px-3 py-1 bg-white border border-amber-200 text-amber-600 text-[9px] font-black uppercase rounded-lg">
                                 {field.replace(/_/g, ' ')}
                               </span>
                             ))}
                           </div>
                        </div>
                      )}
                   </div>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center p-20 bg-slate-100/30 border-4 border-dashed border-slate-200 rounded-[4rem] text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 opacity-50"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125z" /></svg>
                      <p className="text-sm font-black uppercase tracking-widest">Awaiting Forensic Handshake</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-50">Upload an artifact URL to begin audit</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
