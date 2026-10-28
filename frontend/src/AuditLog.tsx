import { motion } from 'motion/react';
import { FileText, Clock, Filter, RefreshCw, Trash2 } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

interface AuditEntry {
  timestamp: string;
  event_type: string;
  subject_id: string | null;
  details: Record<string, any>;
  legal_reference: string;
  severity: string;
}

interface AuditStats {
  total_entries: number;
  event_counts: Record<string, number>;
  severity_counts: Record<string, number>;
  first_entry: string | null;
  last_entry: string | null;
}

const severityColors: Record<string, string> = {
  INFO: 'bg-blue-50 text-blue-600 border-blue-200',
  WARNING: 'bg-amber-50 text-amber-600 border-amber-200',
  ERROR: 'bg-red-50 text-red-600 border-red-200',
  CRITICAL: 'bg-red-100 text-red-700 border-red-300',
};

const eventIcons: Record<string, string> = {
  PIPELINE_START: '🚀',
  RECORD_INGESTED: '📥',
  PII_DETECTED: '🔍',
  PII_ANONYMISED: '🔒',
  INTEGRITY_SEALED: '🛡️',
  ENCRYPTION_APPLIED: '🔐',
  RECORD_COMPLETE: '✅',
  BREACH_SCAN_START: '🔎',
  BREACH_DETECTED: '🚨',
  PIPELINE_END: '🏁',
};

export const AuditLogContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('event_type', filter);
      params.set('limit', isModal ? '50' : '200');
      const res = await fetchWithAuth(`/api/audit-log?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setEntries(json.entries || []);
      setStats(json.stats || null);
    } catch { } finally { setLoading(false); }
  };

  const clearLog = async () => {
    if (!confirm('Are you sure you want to clear the audit log? This cannot be undone.')) return;
    try {
      await fetchWithAuth('/api/audit-log/clear', { method: 'POST' });
      fetchData();
    } catch { }
  };

  useEffect(() => { fetchData(); }, [filter]);

  const eventTypes = stats?.event_counts ? Object.keys(stats.event_counts) : [];

  return (
    <div className="space-y-8">
      {!isModal && (
        <div className="flex flex-col mb-16 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Audit <span className="italic font-title text-primary-gold">Log</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            JSON-structured compliance trail — every pipeline action is logged with timestamps, legal references, and severity levels per IT Act §67C.
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Audit <span className="italic text-primary-gold">Log</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl">JSON-structured compliance trail per IT Act §67C.</p>
        </div>
      )}

      {/* Stats Strip */}
      {stats && stats.total_entries > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`grid grid-cols-2 ${isModal ? 'md:grid-cols-3' : 'md:grid-cols-5'} gap-4 mb-8`}>
          <div className="bg-white border border-primary-gold/10 p-4 text-center">
            <div className="font-title text-2xl text-primary-gold">{stats.total_entries}</div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-neutral-dark/40">Total Entries</div>
          </div>
          {Object.entries(stats.severity_counts).map(([sev, count]) => (
            <div key={sev} className="bg-white border border-primary-gold/10 p-4 text-center">
              <div className="font-title text-2xl text-primary-gold">{count}</div>
              <div className="font-mono text-[8px] uppercase tracking-widest text-neutral-dark/40">{sev}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-primary-gold/10 pb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={12} className="text-primary-gold/60" />
          <button onClick={() => setFilter('all')} className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-all ${filter === 'all' ? 'bg-primary-gold text-[#1c1a16] border-primary-gold' : 'border-primary-gold/20 text-neutral-dark/50 hover:border-primary-gold/50'}`}>All</button>
          {eventTypes.map(et => (
            <button key={et} onClick={() => setFilter(et)} className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-all ${filter === et ? 'bg-primary-gold text-[#1c1a16] border-primary-gold' : 'border-primary-gold/20 text-neutral-dark/50 hover:border-primary-gold/50'}`}>{et.replace(/_/g, ' ')}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="flex items-center gap-1 px-3 py-1.5 border border-primary-gold/20 text-primary-gold font-mono text-[8px] uppercase tracking-widest hover:bg-primary-gold/5 transition-all">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={clearLog} className="flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-500 font-mono text-[8px] uppercase tracking-widest hover:bg-red-50 transition-all">
            <Trash2 size={10} /> Clear
          </button>
        </div>
      </div>

      <div className={`border border-primary-gold/10 bg-white ${isModal ? 'max-h-[400px]' : ''} overflow-y-auto custom-scroll`}>
        {entries.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-primary-gold/10">
              <tr className="text-[10px] uppercase tracking-[0.1em] text-primary-gold/70 font-mono bg-primary-gold/5">
                <th className="px-4 py-3 font-bold whitespace-nowrap">Event Action</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Severity & ID</th>
                <th className="px-4 py-3 font-bold flex-1">Legal Basis</th>
                <th className="px-4 py-3 font-bold max-w-[200px]">Details</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap text-right">Timestamp (IST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-gold/5">
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-primary-gold/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg shrink-0">{eventIcons[entry.event_type] || '📋'}</span>
                      <span className="font-mono font-bold text-neutral-dark text-xs">{entry.event_type.replace(/_/g, ' ')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-mono text-[8px] px-1.5 py-0.5 border rounded-sm ${severityColors[entry.severity] || ''}`}>{entry.severity}</span>
                      {entry.subject_id && <span className="font-mono text-[8px] text-primary-gold bg-primary-gold/10 px-1.5 py-0.5 whitespace-nowrap">ID: {entry.subject_id}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-dark/60 text-[10px] leading-tight">
                    {entry.legal_reference}
                  </td>
                  <td className="px-4 py-3 font-mono text-[9px] text-neutral-dark/40 max-w-[200px] truncate" title={JSON.stringify(entry.details)}>
                    {JSON.stringify(entry.details)}
                  </td>
                  <td className="px-4 py-3 text-[9px] text-neutral-dark/40 font-mono text-right whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false })} IST
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <Clock size={32} className="text-primary-gold mx-auto mb-4 opacity-20" />
            <p className="font-sans text-neutral-dark/40 text-xs text-center">No logs found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function AuditLog() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="audit-log" />
      <main className="max-w-[1200px] flex-1 mx-auto px-6 py-24 w-full">
        <AuditLogContent />
      </main>
      <Footer />
    </div>
  );
}
