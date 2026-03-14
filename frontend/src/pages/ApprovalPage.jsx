import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignApi } from '../services/api';
import {
    Loader2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Clock,
    Target,
    Mail,
    ChevronRight,
    TrendingUp,
    Fingerprint,
    Users as UsersIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// Re-using component logic but with premium styling
const StatBadge = ({ icon: Icon, label, value, colorClass }) => (
    <div className={clsx("flex items-center gap-3 px-4 py-3 rounded-2xl border", colorClass)}>
        <div className="p-2 rounded-lg bg-white/50 shadow-sm">
            <Icon className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
            <span className="text-lg font-black tracking-tight">{value}</span>
        </div>
    </div>
);

export default function ApprovalPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        async function loadData() {
            try {
                const data = await campaignApi.getCampaignStatus(id);
                if (data.status !== 'pending_approval') {
                    navigate(`/dashboard/${id}`);
                    return;
                }
                setSessionData(data);
            } catch (error) {
                console.error("Failed to load campaign status", error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [id, navigate]);

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            await campaignApi.approveCampaign(id);
            navigate(`/dashboard/${id}`);
        } catch (error) {
            console.error("Approval failed", error);
            alert("Failed to approve campaign.");
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        setActionLoading(true);
        try {
            await campaignApi.rejectCampaign(id, feedback);
            navigate(`/`);
        } catch (error) {
            console.error("Rejection failed", error);
            alert("Failed to reject campaign.");
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs">Architecting Strategic Portfolio...</p>
            </div>
        );
    }

    if (!sessionData) return <div className="p-8 text-center text-red-500 font-bold">Session Integrity Error.</div>;

    const segments = sessionData.segments || [];
    const totalCustomers = segments.reduce((acc, seg) => acc + (seg.customer_ids?.length || 0), 0);

    return (
        <div className="max-w-[90rem] mx-auto p-8 pb-32 space-y-10">
            {/* Control Header */}
            <header className="flex flex-col md:flex-row justify-between items-end md:items-center gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-indigo-600 mb-2">
                        <Fingerprint className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Quality Assurance Phase</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Strategy <span className="gradient-text">Review</span></h1>
                    <p className="text-slate-500 font-medium">Verify the engineered segmentation and content before operational deployment.</p>
                </div>

                <div className="flex gap-4">
                    <StatBadge
                        icon={Target}
                        label="Active Cohort"
                        value={totalCustomers}
                        colorClass="bg-indigo-50 border-indigo-100 text-indigo-700 shadow-indigo-100/20 shadow-lg"
                    />
                    <StatBadge
                        icon={Mail}
                        label="Send Volume"
                        value={segments.length}
                        colorClass="bg-slate-900 border-slate-800 text-white shadow-slate-200 shadow-xl"
                    />
                </div>
            </header>

            {/* Campaign Objective Card */}
            <div className="glass-card p-6 bg-white border-slate-200">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl">
                        <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Campaign Brief</span>
                        <p className="text-slate-700 italic font-medium leading-relaxed leading-relaxed">"{sessionData.brief}"</p>
                    </div>
                </div>
            </div>

            {/* Segment Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-12">
                {segments.map((segment, idx) => (
                    <motion.div
                        key={segment.id || idx}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        className="glass-card flex flex-col overflow-hidden group"
                    >
                        {/* Segment Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 mb-1">{segment.label}</h3>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <UsersIcon className="w-3 h-3" /> {segment.customer_ids?.length || 0} Targeted
                                    </span>
                                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> {segment.predicted_open_rate ? (segment.predicted_open_rate * 100).toFixed(1) : 0}% Pred. Open
                                    </span>
                                </div>
                            </div>
                            <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-black text-slate-500">SEG-{idx + 1}</div>
                        </div>

                        {/* Variants Preview */}
                        <div className="p-6 space-y-4 bg-slate-50/50 flex-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Proposed Content</span>
                            {segment.variants?.map((v, vIdx) => (
                                <div key={vIdx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group-hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                                        <span className="text-sm font-black text-slate-800">{v.subject}</span>
                                    </div>
                                    <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed">{v.body}</p>
                                    <div className="mt-4 pt-4 border-t border-slate-50 flex gap-2">
                                        {v.has_emoji && <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold rounded uppercase">✨ Emoji</span>}
                                        {v.has_url && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase">🔗 Link</span>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Segment Meta */}
                        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Clock className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-widest">Scheduled: {segment.send_time || 'Immediate'}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Floating Action Bar */}
            <div className="fixed bottom-8 left-[calc(18rem+2rem)] right-8 z-[100]">
                <div className="glass-morphism bg-slate-900/90 rounded-3xl p-4 border-slate-800 flex items-center justify-between shadow-2xl text-white">
                    <div className="flex items-center gap-4 px-4">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">System Impact</span>
                            <span className="text-sm font-medium">Final approval triggers {segments.length} automated deployments.</span>
                        </div>
                    </div>

                    <div className="flex gap-4 p-1">
                        <button
                            onClick={() => setShowRejectModal(true)}
                            className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-sm transition-all border border-white/5"
                        >
                            Reject & Rework
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={actionLoading}
                            className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center gap-3 transition-all active:scale-95"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Execute Orchestration
                        </button>
                    </div>
                </div>
            </div>

            {/* Rejection Modal */}
            <AnimatePresence>
                {showRejectModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white rounded-[2.5rem] p-10 max-w-xl w-full shadow-2xl space-y-8"
                        >
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Request <span className="text-red-500">Revision</span></h3>
                                <p className="text-slate-500 font-medium">Explain what needs to change. The AI Planner will incorporate this feedback into the next generation loop.</p>
                            </div>

                            <textarea
                                className="w-full h-40 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-100 focus:border-red-500 transition-all resize-none text-slate-800 font-medium"
                                placeholder="E.g., The tone is too formal. Make it more casual and emphasize the quick setup..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                            />

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowRejectModal(false)}
                                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={actionLoading}
                                    className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2"
                                >
                                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Confirm Rejection
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
