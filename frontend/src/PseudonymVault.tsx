import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound, Lock, Unlock } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { errorDetail, fetchWithAuth } from './api';

interface VaultSubject {
  subject_id: string;
  pseudonym: string;
  enrolled_at: string;
  reveal_count: number;
}

interface VaultAudit {
  timestamp: string;
  action: string;
  subject_id: string;
  actor: string;
  reason: string;
}

interface VaultSnapshot {
  subjects: VaultSubject[];
  audit: VaultAudit[];
}

export const PseudonymVaultContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [subjectId, setSubjectId] = useState('10000032');
  const [originalName, setOriginalName] = useState('Anita Sharma');
  const [revealId, setRevealId] = useState('10000032');
  const [reason, setReason] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/vault');
      if (!res.ok) {
        setError(await errorDetail(res));
        return;
      }
      setSnapshot(await res.json());
    } catch {
      setError('Backend not running. Start the FastAPI server to open the vault.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enroll = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRevealed(null);
    try {
      const res = await fetchWithAuth('/api/vault/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, original_name: originalName }),
      });
      if (!res.ok) {
        setError(await errorDetail(res));
        return;
      }
      const body = await res.json();
      setNotice(`Enrolled ${body.subject_id} as ${body.pseudonym}. The original name is stored only as ciphertext.`);
      setRevealId(body.subject_id);
      await refresh();
    } catch {
      setError('Backend not running. Start the FastAPI server to enroll a subject.');
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRevealed(null);
    try {
      const res = await fetch('/api/vault/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken.trim()}`,
        },
        body: JSON.stringify({ subject_id: revealId, reason }),
      });
      if (!res.ok) {
        setError(await errorDetail(res));
        return;
      }
      const body = await res.json();
      setRevealed(body.original_name);
      setNotice(`Revealed once for ${body.subject_id}. This action is in the audit log.`);
      await refresh();
    } catch {
      setError('Backend not running. Start the FastAPI server to reveal a name.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-12 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Pseudonym <span className="italic font-title text-primary-gold">Vault</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            The pipeline anonymizer stays one-way. This vault is a separate encrypted escrow: enroll a real name, keep working with the pseudonym, and reveal the original only with an admin token and a written reason.
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="font-title text-3xl mb-4">Pseudonym <span className="italic text-primary-gold">Vault</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl">Encrypted name escrow. Reveal is admin-only and audited.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <form
          className="bg-white border border-primary-gold/10 p-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            enroll();
          }}
        >
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary-gold">
            <Lock size={14} /> Enroll
          </div>
          <label className="block font-sans text-xs text-neutral-dark/60">
            Subject id
            <input value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-1 w-full border border-primary-gold/20 px-3 py-2 font-mono text-sm outline-none focus:border-primary-gold" />
          </label>
          <label className="block font-sans text-xs text-neutral-dark/60">
            Original name
            <input value={originalName} onChange={(event) => setOriginalName(event.target.value)} className="mt-1 w-full border border-primary-gold/20 px-3 py-2 font-sans text-sm outline-none focus:border-primary-gold" />
          </label>
          <button type="submit" disabled={busy} className="px-6 py-3 bg-primary-gold text-[#1c1a16] font-mono text-[10px] uppercase tracking-widest disabled:opacity-50">
            Store ciphertext
          </button>
        </form>

        <form
          className="bg-white border border-primary-gold/10 p-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            reveal();
          }}
        >
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary-gold">
            <Unlock size={14} /> Reveal
          </div>
          <label className="block font-sans text-xs text-neutral-dark/60">
            Subject id
            <input value={revealId} onChange={(event) => setRevealId(event.target.value)} className="mt-1 w-full border border-primary-gold/20 px-3 py-2 font-mono text-sm outline-none focus:border-primary-gold" />
          </label>
          <label className="block font-sans text-xs text-neutral-dark/60">
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="continuity of care" className="mt-1 w-full border border-primary-gold/20 px-3 py-2 font-sans text-sm outline-none focus:border-primary-gold" />
          </label>
          <label className="block font-sans text-xs text-neutral-dark/60">
            Admin token
            <input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} autoComplete="off" className="mt-1 w-full border border-primary-gold/20 px-3 py-2 font-mono text-sm outline-none focus:border-primary-gold" />
          </label>
          <button type="submit" disabled={busy} className="px-6 py-3 border border-primary-gold/40 text-primary-gold font-mono text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
            <KeyRound size={14} /> Reveal once
          </button>
        </form>
      </div>

      {error && <p className="font-sans text-[12px] text-red-600">{error}</p>}
      {notice && <p className="font-sans text-[12px] text-neutral-dark/70">{notice}</p>}
      {revealed && (
        <div className="bg-amber-50 border border-amber-200 p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700 mb-1">Original name</p>
          <p className="font-title text-2xl">{revealed}</p>
        </div>
      )}

      <div className="bg-white border border-primary-gold/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-primary-gold/10 font-mono text-[10px] uppercase tracking-widest text-primary-gold">Enrolled subjects</div>
        <table className="w-full text-left">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40">
              <th className="px-5 py-2 font-normal">Subject</th>
              <th className="px-5 py-2 font-normal">Pseudonym</th>
              <th className="px-5 py-2 font-normal">Reveals</th>
            </tr>
          </thead>
          <tbody>
            {(snapshot?.subjects || []).map((subject) => (
              <tr key={subject.subject_id} className="border-t border-primary-gold/10 text-sm">
                <td className="px-5 py-3 font-mono">{subject.subject_id}</td>
                <td className="px-5 py-3">{subject.pseudonym}</td>
                <td className="px-5 py-3 font-mono">{subject.reveal_count}</td>
              </tr>
            ))}
            {snapshot && snapshot.subjects.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center font-sans text-xs text-neutral-dark/40">No subjects enrolled.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-primary-gold">Audit log</h3>
        {(snapshot?.audit || []).slice().reverse().map((event, index) => (
          <div key={`${event.timestamp}-${index}`} className="bg-white border border-primary-gold/10 px-4 py-3 flex flex-wrap gap-3 items-baseline">
            <span className="font-mono text-[10px] text-primary-gold">{event.action}</span>
            <span className="font-mono text-[11px]">{event.subject_id}</span>
            <span className="font-sans text-[11px] text-neutral-dark/50">{event.actor}</span>
            {event.reason && <span className="font-sans text-[11px] text-neutral-dark/70">{event.reason}</span>}
            <span className="font-mono text-[10px] text-neutral-dark/30 ml-auto">{event.timestamp}</span>
          </div>
        ))}
        {snapshot && snapshot.audit.length === 0 && (
          <p className="font-sans text-xs text-neutral-dark/40">No vault events yet.</p>
        )}
      </div>
    </div>
  );
};

export default function PseudonymVault() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="pseudonym-vault" />
      <main className="max-w-[1200px] flex-1 mx-auto px-6 py-24 w-full">
        <PseudonymVaultContent />
      </main>
      <Footer />
    </div>
  );
}
