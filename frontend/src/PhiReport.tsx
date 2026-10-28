import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ScanSearch } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { errorDetail, fetchWithAuth } from './api';
import { SAMPLE_CSV, SAMPLE_HL7 } from './samples';

interface PhiField {
  field: string;
  hl7_field: string | null;
  label: string;
  phi_type: string;
  confidence: number;
  preview: string;
  reasons: string[];
}

interface PhiReportBody {
  source: string;
  fields: PhiField[];
  summary: {
    fields_scanned: number;
    likely_phi: number;
    review: number;
    low: number;
    max_confidence: number;
  };
}

function band(confidence: number): { label: string; bar: string; chip: string } {
  if (confidence >= 0.75) return { label: 'Likely PHI', bar: 'bg-red-500', chip: 'text-red-700 bg-red-50 border-red-200' };
  if (confidence >= 0.4) return { label: 'Review', bar: 'bg-amber-500', chip: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Low', bar: 'bg-green-500', chip: 'text-green-700 bg-green-50 border-green-200' };
}

export const PhiReportContent = ({ isModal = false, hl7Text = '' }: { isModal?: boolean; hl7Text?: string }) => {
  const [source, setSource] = useState<'hl7' | 'csv'>('hl7');
  const [text, setText] = useState(hl7Text || SAMPLE_HL7);
  const [report, setReport] = useState<PhiReportBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hl7Text) {
      setSource('hl7');
      setText(hl7Text);
    }
  }, [hl7Text]);

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = source === 'hl7' ? { hl7: text } : { csv: text };
      const res = await fetchWithAuth('/api/phi-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setReport(null);
        setError(await errorDetail(res));
        return;
      }
      setReport(await res.json());
    } catch {
      setError('Backend not running. Start the FastAPI server to score PHI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-12 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            PHI <span className="italic font-title text-primary-gold">Confidence</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            A field-by-field inventory before de-identification. Names, identifiers, and free-text leaks get a confidence score. High-confidence values are masked in the report.
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="font-title text-3xl mb-4">PHI <span className="italic text-primary-gold">Confidence</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl">Per-field score for the message on screen. Raw identifiers are not echoed back.</p>
        </div>
      )}

      <div className="bg-white border border-primary-gold/10 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['hl7', 'csv'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setSource(kind);
                  setText(kind === 'hl7' ? (hl7Text || SAMPLE_HL7) : SAMPLE_CSV);
                  setReport(null);
                }}
                className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest border ${source === kind ? 'bg-primary-gold text-[#1c1a16] border-primary-gold' : 'border-primary-gold/20 text-neutral-dark/60'}`}
              >
                {kind === 'hl7' ? 'HL7 message' : 'CSV table'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setText(source === 'hl7' ? SAMPLE_HL7 : SAMPLE_CSV)}
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-dark/50 hover:text-primary-gold"
          >
            Load sample
          </button>
        </div>
        <label htmlFor="phi-input" className="sr-only">Message or CSV to score</label>
        <textarea
          id="phi-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={isModal ? 8 : 10}
          className="w-full border border-primary-gold/20 bg-bg-light px-3 py-3 font-mono text-[11px] leading-relaxed outline-none focus:border-primary-gold"
        />
        <button type="button" onClick={scan} disabled={loading || !text.trim()} className="px-6 py-3 bg-primary-gold text-[#1c1a16] font-mono text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
          <ScanSearch size={14} /> {loading ? 'Scoring...' : 'Score fields'}
        </button>
        {error && <p className="font-sans text-[12px] text-red-600">{error}</p>}
      </div>

      {report && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Scanned', report.summary.fields_scanned],
              ['Likely PHI', report.summary.likely_phi],
              ['Review', report.summary.review],
              ['Low', report.summary.low],
            ].map(([label, value]) => (
              <div key={label} className="bg-white border border-primary-gold/10 p-5 text-center">
                <div className="font-title text-3xl text-primary-gold">{value}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/50">{label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {report.fields.map((field) => {
              const tone = band(field.confidence);
              return (
                <div key={field.field} className="bg-white border border-primary-gold/10 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-mono text-[10px] text-primary-gold">{field.hl7_field || field.field}</span>
                    <span className="font-sans text-sm">{field.label}</span>
                    <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 border ${tone.chip}`}>{tone.label}</span>
                    <span className="font-mono text-[10px] text-neutral-dark/40 ml-auto">{Math.round(field.confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-neutral-dark/5 mb-2">
                    <div className={`h-full ${tone.bar}`} style={{ width: `${Math.round(field.confidence * 100)}%` }} />
                  </div>
                  <p className="font-mono text-[11px] text-neutral-dark/70">{field.preview || '—'}</p>
                  <p className="font-sans text-[11px] text-neutral-dark/45 mt-1">{field.reasons.join(' · ')}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default function PhiReport() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="phi-report" />
      <main className="max-w-[1200px] flex-1 mx-auto px-6 py-24 w-full">
        <PhiReportContent />
      </main>
      <Footer />
    </div>
  );
}
