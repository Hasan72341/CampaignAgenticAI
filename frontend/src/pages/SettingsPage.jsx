import React from 'react';
import { Settings, Shield, Cpu, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto p-12 space-y-12">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-8">
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">System Settings</h1>
                <p className="text-slate-500 font-medium">Configure your strategic environment and AI orchestration core.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-morphism p-8 rounded-[2rem] border-slate-200">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <Cpu className="w-5 h-5 text-indigo-600" />
                        </div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">AI Core Configuration</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                            <span className="text-sm font-medium text-slate-500">Primary Model</span>
                            <span className="text-sm font-black text-slate-900">mistral:latest</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                            <span className="text-sm font-medium text-slate-500">Protocol Version</span>
                            <span className="text-sm font-black text-indigo-600">v2.4 Enterprise</span>
                        </div>
                        <div className="flex justify-between items-center py-3">
                            <span className="text-sm font-medium text-slate-500">Orchestration Nodes</span>
                            <span className="text-sm font-black text-slate-900">5 Active Agents</span>
                        </div>
                    </div>
                </div>

                <div className="glass-morphism p-8 rounded-[2rem] border-slate-200">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                            <Shield className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Security & API</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                            <span className="text-sm font-medium text-slate-500">Data Residency</span>
                            <span className="text-sm font-black text-slate-900">Local Isolation</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                            <span className="text-sm font-medium text-slate-500">Hackathon API</span>
                            <span className="text-sm font-black text-emerald-600 flex items-center gap-2">
                                Encrypted <ExternalLink className="w-3 h-3" />
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-3">
                            <span className="text-sm font-medium text-slate-500">Compliance</span>
                            <span className="text-sm font-black text-slate-900">GDPR Compliant</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-8 bg-slate-900 rounded-[2rem] text-white space-y-4">
                <h4 className="font-black uppercase tracking-widest text-xs opacity-50">Operational Notice</h4>
                <p className="text-sm text-slate-400 font-medium leading-relaxed">
                    Some settings are locked by the cluster administrator. Contact the Strategic Operations team for advanced model fine-tuning or API key rotations.
                </p>
            </div>
        </div>
    );
}
