import React from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, Users, Shield, ShieldAlert, User } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

interface Permission {
  resource: string;
  action: string;
  granted: boolean;
  justification: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  legal_basis: string;
  permissions: Permission[];
  risk_level: string;
  total_permissions: number;
  granted_count: number;
  denied_count: number;
}

interface RolesData {
  roles: Role[];
  total_roles: number;
  resources: string[];
}

const roleIcons: Record<string, React.ReactNode> = {
  data_processor: <Users size={20} className="text-blue-500" />,
  auditor: <Shield size={20} className="text-green-500" />,
  admin: <ShieldAlert size={20} className="text-amber-500" />,
  data_principal: <User size={20} className="text-purple-500" />,
};

const riskColors: Record<string, string> = {
  LOW: 'bg-green-50 text-green-600 border-green-200',
  MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200',
  HIGH: 'bg-red-50 text-red-600 border-red-200',
};

export const AccessControlContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [data, setData] = useState<RolesData | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth('/api/access-control').then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setData(d);
      if (d.roles.length > 0) setSelectedRole(d.roles[0].id);
    }).catch(() => {});
  }, []);

  const activeRole = data?.roles.find(r => r.id === selectedRole);

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-16 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Access <span className="italic font-title text-primary-gold">Control</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Role-Based Access Control simulation demonstrating least-privilege access segregation (IT Act §43, DPDP §8(5)).
          </motion.p>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Access <span className="italic text-primary-gold">Control</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl mb-6">RBAC simulation and least-privilege verification.</p>
        </div>
      )}

      {data && (
        <>
          {/* Role Cards */}
          <div className={`grid grid-cols-1 ${isModal ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-4 mb-8`}>
            {data.roles.map((role, idx) => (
              <motion.button
                key={role.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedRole(role.id)}
                className={`bg-white border p-5 text-left transition-all hover:shadow-lg ${selectedRole === role.id ? 'ring-1 ring-primary-gold border-primary-gold shadow-md' : 'border-primary-gold/10'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {roleIcons[role.id]}
                  <h3 className="font-title text-md">{role.name}</h3>
                </div>
                <p className="font-sans text-[10px] text-neutral-dark/50 mb-3 leading-relaxed line-clamp-2">{role.description}</p>
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${riskColors[role.risk_level]}`}>{role.risk_level}</span>
                  <div className="flex items-center gap-2 font-mono text-[8px]">
                    <span className="text-green-500">{role.granted_count}✓</span>
                    <span className="text-red-400">{role.denied_count}✗</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Active Role Permissions */}
          {activeRole && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={activeRole.id} className="bg-white border border-primary-gold/10 p-6">
              <div className="flex items-center gap-2 mb-2">
                {roleIcons[activeRole.id]}
                <h4 className="font-title text-lg">{activeRole.name} Permissions</h4>
              </div>
              <p className="font-mono text-[8px] text-primary-gold/60 mb-5">{activeRole.legal_basis}</p>
              <div className="border border-primary-gold/5 bg-white overflow-hidden">
                 <div className="grid grid-cols-12 gap-0 bg-primary-gold/5 px-4 py-2 border-b border-primary-gold/10">
                    <div className="col-span-4 font-mono text-[9px] text-primary-gold font-bold">Resource</div>
                    <div className="col-span-2 font-mono text-[9px] text-primary-gold font-bold text-center">Action</div>
                    <div className="col-span-1 font-mono text-[9px] text-primary-gold font-bold text-center">Status</div>
                    <div className="col-span-5 font-mono text-[9px] text-primary-gold font-bold">Justification</div>
                 </div>
                 {activeRole.permissions.map((perm, idx) => (
                    <div key={`${perm.resource}-${perm.action}`} className={`grid grid-cols-12 gap-0 px-4 py-2.5 border-b border-primary-gold/5 ${idx % 2 ? 'bg-primary-gold/[0.01]' : ''}`}>
                       <div className="col-span-4 font-mono text-[10px] text-neutral-dark">{perm.resource}</div>
                       <div className="col-span-2 font-mono text-[9px] text-neutral-dark/40 text-center uppercase">{perm.action}</div>
                       <div className="col-span-1 flex justify-center">
                          {perm.granted ? <Unlock size={12} className="text-green-500" /> : <Lock size={12} className="text-red-400" />}
                       </div>
                       <div className="col-span-5 font-sans text-[10px] text-neutral-dark/50 leading-tight">{perm.justification}</div>
                    </div>
                 ))}
              </div>
            </motion.section>
          )}

          {!isModal && (
            <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="font-title text-2xl mb-6">Cross-Role Access Matrix</h2>
              <div className="border border-primary-gold/10 bg-white overflow-x-auto">
                <table className="w-full text-left font-mono">
                  <thead>
                    <tr className="bg-primary-gold/5 border-b border-primary-gold/10">
                      <th className="px-4 py-3 text-[9px] uppercase tracking-widest text-primary-gold">Resource</th>
                      {data.roles.map(r => (
                        <th key={r.id} className="px-3 py-3 text-[9px] uppercase tracking-widest text-primary-gold text-center">{r.name.split(' ')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.resources.sort().map((res, ri) => (
                      <tr key={res} className={`border-b border-primary-gold/5 ${ri % 2 ? 'bg-primary-gold/[0.01]' : ''}`}>
                        <td className="px-4 py-2.5 text-[10px] text-neutral-dark font-bold">{res}</td>
                        {data.roles.map(role => {
                          const perms = role.permissions.filter(p => p.resource === res);
                          const anyGranted = perms.some(p => p.granted);
                          return (
                            <td key={role.id} className="px-3 py-2.5 text-center">
                              {perms.length > 0 ? (
                                anyGranted ? <span className="text-green-500 text-xs">✓</span> : <span className="text-red-400 text-xs">✗</span>
                              ) : (
                                <span className="text-neutral-dark/10 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
};

export default function AccessControl() {
  return (
    <div className="min-h-screen bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="access-control" />
      <main className="max-w-[1200px] mx-auto px-6 py-24">
        <AccessControlContent />
      </main>
      <Footer />
    </div>
  );
}
