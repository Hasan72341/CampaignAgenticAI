import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignApi } from '../services/api';
import AgentOrbitals from '../components/AgentOrbitals';
import { Sparkles, Send, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BriefPage() {
    const [brief, setBrief] = useState('');
    const [loading, setLoading] = useState(false);
    const [campaignId, setCampaignId] = useState(null);
    const [currentStatus, setCurrentStatus] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!brief.trim()) return;

        setLoading(true);
        try {
            const data = await campaignApi.generateCampaign(brief);
            setCampaignId(data.campaign_id);
            setCurrentStatus(data.status || 'profiling');
        } catch (error) {
            console.error('Failed to generate campaign', error);
            alert('Error generating campaign');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!campaignId) return;

        const interval = setInterval(async () => {
            try {
                const data = await campaignApi.getCampaignStatus(campaignId);
                setCurrentStatus(data.status);

                if (data.status === 'pending_approval') {
                    clearInterval(interval);
                    setTimeout(() => navigate(`/approval/${campaignId}`), 1500);
                } else if (['rejected', 'approved', 'completed'].includes(data.status)) {
                    clearInterval(interval);
                    navigate(`/dashboard/${campaignId}`);
                }
            } catch (error) {
                console.error('Error polling status', error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [campaignId, navigate]);

    return (
        <div className="max-w-4xl mx-auto p-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
            >
                {/* Header Section */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Strategic Campaign Labs</span>
                    </div>
                    <h1 className="text-5xl font-black text-slate-900 tracking-tight">
                        Campaign <span className="gradient-text">Strategy Room</span>
                    </h1>
                    <p className="text-slate-500 text-lg max-w-xl mx-auto font-medium">
                        Define your mandate. Our strategic studio will architect the optimal orchestration for your audience.
                    </p>
                </div>

                {/* Input Section */}
                <div className="glass-morphism rounded-3xl p-2 border shadow-2xl shadow-indigo-100/50">
                    <div className="bg-white rounded-[1.25rem] p-8">
                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="relative group">
                                <textarea
                                    className="w-full h-48 p-0 text-xl font-medium text-slate-800 placeholder:text-slate-300 border-none focus:ring-0 resize-none bg-transparent"
                                    placeholder="E.g., Launch XDeposit campaign targeting young professionals in Tier-1 cities..."
                                    value={brief}
                                    onChange={(e) => setBrief(e.target.value)}
                                    disabled={loading || campaignId}
                                />
                                <div className="absolute bottom-0 right-0 p-2 flex items-center gap-2 text-slate-300 text-sm font-medium">
                                    <Info className="w-4 h-4" />
                                    Use bullet points for better segment accuracy.
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {!campaignId ? (
                                    <motion.button
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        type="submit"
                                        disabled={loading || !brief.trim()}
                                        className="group w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 hover:shadow-2xl disabled:opacity-50 disabled:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                                <span>Assembling Strategic Insights...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                                <span>Launch Strategy Studio</span>
                                            </>
                                        )}
                                    </motion.button>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="space-y-8 py-4"
                                    >
                                        <div className="h-px bg-slate-100 w-full" />

                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Orchestration Phase: {currentStatus?.replace('_', ' ')}</span>
                                            <AgentOrbitals activeStage={currentStatus} />
                                        </div>

                                        <div className="text-center">
                                            <p className="text-slate-500 text-sm font-medium animate-pulse">
                                                Syncing demographic data & engineering variants...
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </form>
                    </div>
                </div>

                {/* Footer Badges */}
                {!campaignId && (
                    <div className="flex justify-center gap-12 text-slate-400 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                            <span className="text-xs font-bold uppercase tracking-widest">Enterprise Secure</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                            <span className="text-xs font-bold uppercase tracking-widest">Orchestration v2.4</span>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
