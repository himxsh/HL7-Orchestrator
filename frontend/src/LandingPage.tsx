import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, BookOpen, Scale, Shield, Heart, Globe } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

export default function LandingPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    legal_sections: '20+',
    offences: '14',
    case_studies: '9',
    course_units: '5',
    records_processed: '0',
    compliance_index: '--',
    risk_threats: '--',
    system_state: 'SECURE'
  });

  useEffect(() => {
    fetchWithAuth('/api/stats')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        setStats({
          legal_sections: data.legal_sections.toString(),
          offences: data.offences.toString(),
          case_studies: data.case_studies.toString(),
          course_units: '5',
          records_processed: data.records_processed.toString(),
          compliance_index: data.compliance_index.toString(),
          risk_threats: data.risk_threats.toString(),
          system_state: data.system_state
        });
      })
      .catch(() => { });
  }, []);

  return (
    <div className="bg-bg-light text-neutral-dark font-sans selection:bg-gold/30">
      <Header activeTab="home" />

      <main className="pt-20">
        {/* Hero Section */}
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 pb-20 lg:pt-20 lg:pb-32 grid lg:grid-cols-12 gap-12 border-b border-gold/10">
          <div className="lg:col-span-8 flex flex-col justify-center">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-mono text-[12px] uppercase tracking-[0.3em] text-gold mb-6 block"
            >
              IT Act & Data Protection
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="font-title text-6xl lg:text-8xl font-light leading-[0.9] tracking-tighter mb-8"
            >
              Clinical Data, <br />
              <span className="italic font-title">Orchestrated</span> with Precision
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="font-sans text-lg lg:text-xl max-w-xl text-slate-600 mb-10 leading-relaxed"
            >
              Enterprise-grade HL7 processing with DPDP compliance. Designed for clinical research, built for the highest security standards.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <button
                onClick={() => navigate('/selection')}
                className="bg-gold text-charcoal px-10 py-4 font-mono text-xs uppercase tracking-widest hover:bg-gold/90 transition-all border border-gold"
              >
                EXPLORE PIPELINE
              </button>
              <button
                onClick={() => navigate('/compliance')}
                className="bg-transparent border border-gold/20 px-10 py-4 font-mono text-xs uppercase tracking-widest hover:bg-gold/5 transition-all"
              >
                View Compliance
              </button>
            </motion.div>
          </div>
          <div className="lg:col-span-4 flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative w-full aspect-[3/4] overflow-hidden grayscale contrast-125 border border-gold/10"
            >
              <img
                alt="Medical data security and analysis"
                className="object-cover w-full h-full opacity-80"
                src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=1000"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gold/10 mix-blend-multiply"></div>
            </motion.div>
          </div>
        </section>

        {/* Compliance Strip */}
        <div className="bg-gold/5 border-b border-gold/10 overflow-hidden">
          <div className="flex whitespace-nowrap py-4 animate-marquee">
            <div className="flex gap-16 items-center px-8 font-mono text-[10px] tracking-[0.4em] uppercase text-slate-500">
              <span>DPDP Act 2023</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>IT Act 2000</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>HIPAA Aligned</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>DPDP Act 2023</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>IT Act 2000</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>GDPR Compliant</span>
            </div>
            {/* Duplicate for seamless loop */}
            <div className="flex gap-16 items-center px-8 font-mono text-[10px] tracking-[0.4em] uppercase text-slate-500">
              <span>DPDP Act 2023</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>IT Act 2000</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>HIPAA Aligned</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>DPDP Act 2023</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>IT Act 2000</span>
              <span className="w-1 h-1 bg-gold rounded-full"></span>
              <span>GDPR Compliant</span>
            </div>
          </div>
        </div>

        {/* Regulatory Coverage Stats */}
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 border-b border-gold/10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {[
              { stat: stats.legal_sections, label: 'Legal Sections Mapped', sub: `Score: ${stats.compliance_index}%` },
              { stat: stats.offences, label: 'Offences Catalogued', sub: 'IT Act §43–§72A' },
              { stat: stats.records_processed, label: 'Records Processed', sub: `State: ${stats.system_state}` },
              { stat: stats.risk_threats, label: 'Risk Threats', sub: 'Quantified Index' },
              { stat: stats.course_units, label: 'Course Units', sub: 'Full Syllabus Coverage' },
            ].map((item, idx) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className="text-center"
              >
                <div className="font-title text-4xl lg:text-5xl text-gold mb-2">{item.stat}</div>
                <div className="font-sans text-sm font-medium text-neutral-dark mb-1">{item.label}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-slate-400">{item.sub}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Pipeline Grid */}
        <section id="pipeline" className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 border-b border-gold/10">
          <div className="flex flex-col mb-16">
            <h2 className="font-title text-4xl font-light mb-4">The Processing Cycle</h2>
            <div className="w-78 h-px bg-gold"></div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 border border-black">
            <PipelineCard
              phase="1"
              title="Preprocessing"
              desc="Structural validation and noise reduction for raw clinical message streams."
            />
            <PipelineCard
              phase="2"
              title="Anonymizer"
              desc="Dynamic PII detection and masking aligned with international privacy mandates."
            />
            <PipelineCard
              phase="3"
              title="HL7 Engine"
              desc="Multi-version mapping and canonical transformation of medical data assets."
            />
            <PipelineCard
              phase="4"
              title="Sealing"
              desc="Cryptographic validation and immutable audit logging for full data lineage."
              isLast
            />
          </div>
        </section>

        {/* Data Interoperability Section (Replacing Architecture & old Database) */}
        <section id="database" className="bg-charcoal text-slate-100 py-24 border-b border-white/5">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
            <div className="flex flex-col mb-20 text-center">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="font-title text-5xl font-light mb-4"
              >
                Universal Data <span className="italic font-title text-gold">Interoperability</span>
              </motion.h2>
              <div className="w-24 h-px bg-gold mx-auto"></div>
              <p className="font-sans text-slate-400 mt-8 max-w-2xl mx-auto leading-relaxed">
                Seamlessly ingest diverse clinical data sources. Our engine maps legacy structures to compliant HL7 v2 formats with automated schema detection.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-px bg-white/10 border border-white/10">
              <div className="bg-charcoal p-16 group transition-colors hover:bg-white/5">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4 block text-gold">Schema Type A</span>
                <h3 className="font-title text-4xl font-light mb-8 group-hover:italic transition-all">MIMIC-IV Mode</h3>
                <p className="font-sans text-slate-400 leading-relaxed max-w-md">
                  Native integration for the Medical Information Mart for Intensive Care version IV. Specialized transformations for secondary use of critical care datasets.
                </p>

              </div>
              <div className="bg-charcoal p-16 group transition-colors hover:bg-white/5">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4 block text-gold">Schema Type B</span>
                <h3 className="font-title text-4xl font-light mb-8 group-hover:italic transition-all">Generic CSV Engine</h3>
                <p className="font-sans text-slate-400 leading-relaxed max-w-md">
                  Flexible ingestion for legacy tabular systems. Auto-mapping clinical variables to standard HL7 v2 structures through declarative JSON registries.
                </p>

              </div>
            </div>
          </div>
        </section>

        {/* Course Unit Coverage */}
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 border-b border-gold/10">
          <div className="flex flex-col mb-16 text-center items-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-title text-4xl font-light mb-4"
            >
              <span className="italic font-title text-gold">Coverage</span>
            </motion.h2>
            <div className="w-24 h-px bg-gold"></div>
            <p className="font-sans text-slate-500 mt-6 max-w-xl leading-relaxed">
              Comprehensive mapping to all 5 units of ECE-4272: IT Act and Data Protection
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {[
              { unit: 'I', title: 'Foundations', desc: 'Data definitions, privacy principles, legislative timeline', icon: <BookOpen size={24} className="text-gold" />, href: '/legal-framework' },
              { unit: 'II', title: 'IT Act 2000', desc: 'Digital signatures, e-governance, cyber offences', icon: <Scale size={24} className="text-gold" />, href: '/digital-signatures' },
              { unit: 'III', title: 'DPDP Act', desc: 'Personal data, consent, cross-border transfers', icon: <Shield size={24} className="text-gold" />, href: '/data-lifecycle' },
              { unit: 'IV', title: 'GDPR', desc: 'Data subject rights, penalties, comparison', icon: <Globe size={24} className="text-gold" />, href: '/gdpr' },
              { unit: 'V', title: 'Healthcare', desc: 'NeHA, SeHA, DISHA, data ownership', icon: <Heart size={24} className="text-gold" />, href: '/healthcare' },
            ].map((item, idx) => (
              <motion.a
                key={item.unit}
                href={item.href}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className="bg-white border border-gold/10 p-8 group hover:border-gold/30 transition-all cursor-pointer block"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-[10px] text-gold bg-gold/10 px-2 py-1 border border-gold/20">UNIT {item.unit}</span>
                </div>
                <div className="mb-4">{item.icon}</div>
                <h3 className="font-title text-xl mb-2 group-hover:text-gold transition-colors">{item.title}</h3>
                <p className="font-sans text-[12px] text-slate-500 leading-relaxed">{item.desc}</p>
              </motion.a>
            ))}
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

const PipelineCard = ({ phase, title, desc, isLast = false }: { phase: string, title: string, desc: string, isLast?: boolean }) => (
  <div className={`relative group p-10 border-black transition-colors hover:bg-gold/5 ${!isLast ? 'border-r' : ''} border-b lg:border-b-0`}>
    <div className="absolute top-0 left-0 w-full h-0 bg-gold transition-all duration-300 group-hover:h-1"></div>
    <span className="font-mono text-[15px] text-gold block mb-8">PHASE {phase}</span>
    <h3 className="font-title text-2xl font-light mb-4 tracking-tight uppercase">{title}</h3>
    <p className="font-sans text-sm text-slate-500 leading-relaxed">{desc}</p>
  </div>
);
