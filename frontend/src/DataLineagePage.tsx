import { motion } from 'motion/react';
import { GitBranch, ArrowRight, Search } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

interface LineageNode {
  field: string;
  stage: string;
  description: string;
}

interface LineageEdge {
  source_field: string;
  target_field: string;
  transformation: string;
  legal_reference: string;
  description: string;
}

interface LineageData {
  nodes: LineageNode[];
  edges: LineageEdge[];
  stages: Record<string, LineageNode[]>;
  transformation_summary: Record<string, number>;
  total_nodes: number;
  total_edges: number;
}

const stageColors: Record<string, string> = {
  source: 'bg-blue-50 border-blue-200 text-blue-700',
  preprocessing: 'bg-slate-50 border-slate-200 text-slate-600',
  anonymisation: 'bg-purple-50 border-purple-200 text-purple-700',
  hl7_mapping: 'bg-amber-50 border-amber-200 text-amber-700',
  integrity: 'bg-green-50 border-green-200 text-green-700',
  encryption: 'bg-red-50 border-red-200 text-red-600',
};

const transformColors: Record<string, string> = {
  copy: 'bg-blue-100 text-blue-700',
  anonymise: 'bg-purple-100 text-purple-700',
  hash: 'bg-green-100 text-green-700',
  derive: 'bg-amber-100 text-amber-700',
  drop: 'bg-red-100 text-red-700',
  filter: 'bg-slate-100 text-slate-600',
  group_by: 'bg-slate-100 text-slate-600',
  encrypt: 'bg-red-100 text-red-600',
  mac: 'bg-orange-100 text-orange-600',
};

export const DataLineageContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [data, setData] = useState<LineageData | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [fieldLineage, setFieldLineage] = useState<{ upstream: LineageEdge[], downstream: LineageEdge[] } | null>(null);

  useEffect(() => {
    fetchWithAuth('/api/data-lineage').then(async (r) => {
      if (!r.ok) return;
      setData(await r.json());
    }).catch(() => {});
  }, []);

  const selectField = async (field: string) => {
    setSelectedField(field);
    try {
      const res = await fetchWithAuth(`/api/data-lineage/${field}`);
      if (!res.ok) return;
      const json = await res.json();
      setFieldLineage(json);
    } catch {}
  };

  const stageOrder = ['source', 'preprocessing', 'anonymisation', 'hl7_mapping', 'integrity', 'encryption'];
  const stageLabels: Record<string, string> = {
    source: 'Source (CSV)', preprocessing: 'Preprocessing', anonymisation: 'Anonymisation',
    hl7_mapping: 'HL7 Mapping', integrity: 'Integrity Seal', encryption: 'Encryption',
  };

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-16 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Data <span className="italic font-title text-primary-gold">Lineage</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Complete provenance graph tracking every data field from CSV source through anonymisation to HL7 output — as required by GDPR Art.&nbsp;30 and DPDP §8.
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Data <span className="italic text-primary-gold">Lineage</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl mb-6">Provenance map tracking fields from CSV to HL7 segments.</p>
        </div>
      )}

      {data && (
        <>
          {/* Stats Strip */}
          <div className="grid grid-cols-3 gap-6 mb-16">
            <div className="bg-white border border-primary-gold/10 p-6 text-center">
              <div className="font-title text-3xl text-primary-gold">{data.total_nodes}</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40">Data Fields</div>
            </div>
            <div className="bg-white border border-primary-gold/10 p-6 text-center">
              <div className="font-title text-3xl text-primary-gold">{data.total_edges}</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40">Transformations</div>
            </div>
            <div className="bg-white border border-primary-gold/10 p-6 text-center">
              <div className="font-title text-3xl text-primary-gold">{stageOrder.length}</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40">Pipeline Stages</div>
            </div>
          </div>

          {!isModal && (
            <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-16">
              <h2 className="font-title text-2xl mb-6">Transformation Types</h2>
              <div className="flex flex-wrap gap-4">
                {Object.entries(data.transformation_summary).map(([type, count]) => (
                  <div key={type} className={`px-4 py-2 border rounded-sm font-mono text-[10px] uppercase tracking-widest ${transformColors[type] || 'bg-gray-100 text-gray-600'}`}>
                    {type}: {count}
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Stage-by-Stage Graph */}
          <div className="space-y-8 mb-16">
            {stageOrder.filter(s => data.stages[s]).map((stage, stageIdx) => (
              <motion.section key={stage} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: stageIdx * 0.05 }}>
                <div className="flex items-center gap-3 mb-4">
                  <GitBranch size={16} className="text-primary-gold" />
                  <h3 className="font-title text-lg uppercase tracking-wider">{stageLabels[stage]}</h3>
                  <span className="font-mono text-[9px] text-neutral-dark/30">{data.stages[stage].length} fields</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {data.stages[stage].map(node => (
                    <button
                      key={node.field}
                      onClick={() => selectField(node.field)}
                      className={`px-4 py-3 border text-left transition-all hover:shadow-md ${selectedField === node.field ? 'ring-2 ring-primary-gold shadow-lg' : ''} ${stageColors[stage]}`}
                    >
                      <div className="font-mono text-[10px] font-bold">{node.field}</div>
                      <div className="font-sans text-[9px] opacity-60 mt-0.5">{node.description}</div>
                    </button>
                  ))}
                </div>
                {stageIdx < stageOrder.filter(s => data.stages[s]).length - 1 && (
                  <div className="flex justify-center my-4"><ArrowRight size={20} className="text-primary-gold/30 rotate-90" /></div>
                )}
              </motion.section>
            ))}
          </div>

          {/* Field Details */}
          {fieldLineage && selectedField && (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-primary-gold/10 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Search size={16} className="text-primary-gold" />
                <h3 className="font-title text-2xl">Lineage: <span className="text-primary-gold">{selectedField}</span></h3>
              </div>
              <div className="space-y-6">
                {fieldLineage.upstream.length > 0 && (
                  <div>
                    <h4 className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40 mb-3">Upstream (Sources)</h4>
                    <div className="space-y-2">
                       {fieldLineage.upstream.map((e: LineageEdge, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-primary-gold/[0.02] border border-primary-gold/5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold text-primary-gold">{e.source_field}</span>
                          <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-sm ${transformColors[e.transformation] || ''}`}>{e.transformation}</span>
                          <ArrowRight size={12} className="text-neutral-dark/20" />
                          <span className="font-mono text-[10px]">{e.target_field}</span>
                          <span className="font-mono text-[8px] text-neutral-dark/30 ml-auto">{e.legal_reference}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {fieldLineage.downstream.length > 0 && (
                  <div>
                    <h4 className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40 mb-3">Downstream (Targets)</h4>
                    <div className="space-y-2">
                      {fieldLineage.downstream.map((e: LineageEdge, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-primary-gold/[0.02] border border-primary-gold/5 flex-wrap">
                          <span className="font-mono text-[10px]">{e.source_field}</span>
                          <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-sm ${transformColors[e.transformation] || ''}`}>{e.transformation}</span>
                          <ArrowRight size={12} className="text-neutral-dark/20" />
                          <span className="font-mono text-[10px] font-bold text-primary-gold">{e.target_field}</span>
                          <span className="font-mono text-[8px] text-neutral-dark/30 ml-auto">{e.legal_reference}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
};

export default function DataLineage() {
  return (
    <div className="min-h-screen bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="data-lineage" />
      <main className="max-w-[1200px] mx-auto px-6 py-24">
        <DataLineageContent />
      </main>
      <Footer />
    </div>
  );
}
