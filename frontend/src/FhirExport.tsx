import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, FileJson } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { errorDetail, fetchWithAuth } from './api';
import { SAMPLE_HL7 } from './samples';

interface FhirBundle {
  resourceType: string;
  type?: string;
  entry?: { resource?: { resourceType?: string } }[];
  meta?: { tag?: { code?: string; display?: string }[] };
}

function resourceCounts(bundle: FhirBundle): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of bundle.entry || []) {
    const kind = entry.resource?.resourceType || 'Unknown';
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

export const FhirExportContent = ({ isModal = false, hl7Text = '' }: { isModal?: boolean; hl7Text?: string }) => {
  const [hl7, setHl7] = useState(hl7Text || SAMPLE_HL7);
  const [bundle, setBundle] = useState<FhirBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hl7Text) setHl7(hl7Text);
  }, [hl7Text]);

  const exportBundle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/fhir/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hl7 }),
      });
      if (!res.ok) {
        setBundle(null);
        setError(await errorDetail(res));
        return;
      }
      setBundle(await res.json());
    } catch {
      setError('Backend not running. Start the FastAPI server to export FHIR.');
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'message.fhir.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const counts = bundle ? resourceCounts(bundle) : null;
  const seal = bundle?.meta?.tag?.[0];

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-12 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            FHIR R4 <span className="italic font-title text-primary-gold">Export</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Turn a sealed HL7 v2 message into a FHIR R4 collection Bundle. Pseudonyms stay pseudonyms, and the ZSH integrity seal rides along as a meta tag.
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="font-title text-3xl mb-4">FHIR R4 <span className="italic text-primary-gold">Export</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl">Patient, Observation, and DiagnosticReport from the message on screen.</p>
        </div>
      )}

      <div className="bg-white border border-primary-gold/10 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="fhir-hl7" className="font-mono text-[10px] uppercase tracking-widest text-primary-gold">HL7 message</label>
          <button type="button" onClick={() => setHl7(SAMPLE_HL7)} className="font-mono text-[10px] uppercase tracking-widest text-neutral-dark/50 hover:text-primary-gold">
            Load sample
          </button>
        </div>
        <textarea
          id="fhir-hl7"
          value={hl7}
          onChange={(event) => setHl7(event.target.value)}
          rows={isModal ? 8 : 10}
          className="w-full border border-primary-gold/20 bg-bg-light px-3 py-3 font-mono text-[11px] leading-relaxed outline-none focus:border-primary-gold"
        />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportBundle} disabled={loading || !hl7.trim()} className="px-6 py-3 bg-primary-gold text-[#1c1a16] font-mono text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
            <FileJson size={14} /> {loading ? 'Exporting...' : 'Export FHIR R4'}
          </button>
          <button type="button" onClick={download} disabled={!bundle} className="px-6 py-3 border border-primary-gold/30 text-primary-gold font-mono text-[10px] uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
            <Download size={14} /> Download JSON
          </button>
        </div>
        {error && <p className="font-sans text-[12px] text-red-600">{error}</p>}
      </div>

      {bundle && counts && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(counts).map(([kind, count]) => (
              <div key={kind} className="bg-white border border-primary-gold/10 p-5 text-center">
                <div className="font-title text-3xl text-primary-gold">{count}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/50">{kind}</div>
              </div>
            ))}
            <div className="bg-white border border-primary-gold/10 p-5 text-center">
              <div className="font-title text-lg text-primary-gold truncate">{seal?.code || '—'}</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/50">ZSH seal</div>
            </div>
          </div>
          {seal?.display && (
            <p className="font-mono text-[10px] text-neutral-dark/50 break-all">Seal {seal.display}</p>
          )}
          <pre className="bg-charcoal text-slate-100 p-5 text-[11px] leading-relaxed overflow-auto max-h-[420px]">{JSON.stringify(bundle, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default function FhirExport() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="fhir-export" />
      <main className="max-w-[1200px] flex-1 mx-auto px-6 py-24 w-full">
        <FhirExportContent />
      </main>
      <Footer />
    </div>
  );
}
