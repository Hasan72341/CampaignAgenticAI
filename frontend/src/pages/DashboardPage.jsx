import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { campaignApi } from '../services/api';
import MetricsChart from '../components/MetricsChart';
import {
    Loader2,
    RefreshCw,
    Activity,
    Database,
    ActivitySquare,
    Terminal,
    Zap,
    TrendingUp,
    Target,
    ArrowUpRight,
    ChevronDown,
    Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const KPICard = ({ icon: Icon, label, value, trend, colorClass }) => (
    <div className={clsx("glass-card p-6 border-slate-200 flex flex-col gap-4", colorClass)}>
        <div className="flex justify-between items-start">
            <div className="p-3 bg-white/80 rounded-xl shadow-sm">
                <Icon className="w-5 h-5 text-slate-900" />
            </div>
            {trend && (
                <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    <ArrowUpRight className="w-3 h-3" />
                    {trend}
                </div>
            )}
        </div>
        <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{value}</div>
        </div>
    </div>
);

export default function DashboardPage() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [optimizeLoading, setOptimizeLoading] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);

    const loadData = async () => {
        if (!id) {
            setLoading(false);
            return;
        }
        try {
            const [campData, metsResponse] = await Promise.all([
                campaignApi.getCampaignStatus(id),
                campaignApi.getMetrics(id).catch(() => ({ metrics: [] }))
            ]);

            const metricsArray = metsResponse.metrics || [];
            setData(campData);
            setMetrics(metricsArray);

            if (!selectedNode && campData.agent_logs?.length > 0) {
                setSelectedNode(campData.agent_logs[campData.agent_logs.length - 1]);
            }
        } catch (error) {
            console.error("Dashboard fetch error", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 8000);
        return () => clearInterval(interval);
    }, [id]);

    if (!id) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
                    <Database className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900">No Campaign Selected</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">Select a campaign from the sidebar or start a new one to view real-time performance telemetry.</p>
                </div>
                <Link to="/" className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 transition-all hover:scale-105">
                    Start New Campaign
                </Link>
            </div>
        );
    }

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs">Streaming Real-time Analytics</p>
            </div>
        );
    }

    const chartData = (metrics || []).map((v, i) => ({
        name: v.segment_label || `V${i + 1}`,
        openRate: v.open_rate || 0,
        clickRate: v.click_rate || 0,
        weighted: v.weighted_score || 0
    }));

    const totalSent = (metrics || []).reduce((acc, v) => acc + (v.total_sent || 0), 0);
    const avgOpen = metrics?.length ? (metrics.reduce((acc, v) => acc + (v.open_rate || 0), 0) / metrics.length).toFixed(1) : "0.0";
    const avgClick = metrics?.length ? (metrics.reduce((acc, v) => acc + (v.click_rate || 0), 0) / metrics.length).toFixed(1) : "0.0";

    const stats = [
        { id: 'reach', label: 'Mandate Coverage', value: totalSent, icon: Target, trend: 'Cohort Alpha' },
        { id: 'open', label: 'Aggregate Open Rate', value: `${avgOpen}%`, icon: TrendingUp },
        { id: 'click', label: 'Aggregate Click Rate', value: `${avgClick}%`, icon: Activity },
    ];

    return (
        <div className="p-8 h-screen flex flex-col gap-8 overflow-hidden">
            {/* Control Bar */}
            <header className="flex justify-between items-center shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-600">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Real-time Telemetry Active</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        Strategic <span className="gradient-text">Intelligence</span>
                        <ChevronDown className="w-6 h-6 text-slate-300" />
                    </h1>
                </div>

                <div className="flex gap-4">
                    <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-3">
                        <Database className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-600">TX-ID: {id?.substring(0, 8)}</span>
                    </div>
                    <button
                        onClick={loadData}
                        className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4 text-slate-600" />
                    </button>
                </div>
            </header>

            {/* Main Grid */}
            <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">

                {/* Left Side: Stats & Metrics */}
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-8 min-h-0">

                    {/* KPI Ribbon */}
                    <div className="grid grid-cols-3 gap-6 shrink-0">
                        {stats.map(s => <KPICard key={s.id} {...s} />)}
                    </div>

                    {/* Chart Center */}
                    <div className="glass-card flex-1 bg-white border-slate-200 p-8 flex flex-col min-h-0">
                        <div className="flex justify-between items-center mb-10">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <ActivitySquare className="w-5 h-5 text-indigo-500" /> Conversion Funnel
                            </h3>
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open Rate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click Rate</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <MetricsChart data={chartData} transparent />
                        </div>
                    </div>
                </div>

                {/* Right Side: Reasoning Console */}
                <div className="col-span-12 lg:col-span-4 flex flex-col min-h-0">
                    <div className="bg-slate-950 rounded-[2rem] border border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 text-white">
                                <Terminal className="w-5 h-5 text-indigo-400" />
                                <h3 className="font-bold text-sm tracking-wide">Orchestration Trace</h3>
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                                <Cpu className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{selectedNode?.agent_name || 'System'}</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8 font-mono">
                            {selectedNode ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-10"
                                >
                                    <div>
                                        <span className="text-[10px] font-black text-indigo-500/80 uppercase tracking-[0.2em] block mb-4 underline underline-offset-4 decoration-indigo-500/30">Trace Reasoning</span>
                                        <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-4">
                                            {selectedNode.llm_reasoning || "// No cognitive trace found for this vector."}
                                        </p>
                                    </div>

                                    <div>
                                        <span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-[0.2em] block mb-4 underline underline-offset-4 decoration-emerald-500/30">State Modification</span>
                                        <pre className="text-[10px] text-slate-300 leading-tight bg-slate-900/50 p-4 rounded-xl border border-slate-800 overflow-x-auto">
                                            {JSON.stringify(selectedNode.output_payload, null, 2)}
                                        </pre>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600 text-center opacity-40">
                                    <Zap className="w-12 h-12" />
                                    <p className="text-sm font-bold uppercase tracking-widest">Awaiting Agent IO</p>
                                </div>
                            )}
                        </div>

                        {/* Node Selector (Mini Timeline) */}
                        <div className="p-4 bg-slate-900/50 border-t border-slate-800 flex gap-2 overflow-x-auto shrink-0 no-scrollbar">
                            {data?.agent_logs?.map((log, i) => (
                                <button
                                    key={log.id}
                                    onClick={() => setSelectedNode(log)}
                                    className={clsx(
                                        "shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        selectedNode?.id === log.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50" : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                    )}
                                >
                                    {log.agent_name === "CustomerProfiler" ? "Insight" :
                                        log.agent_name === "CampaignPlanner" ? "Strategy" :
                                            log.agent_name === "ContentGenerator" ? "Creative" :
                                                log.agent_name === "PerformanceAnalyst" ? "Analytics" :
                                                    log.agent_name === "StrategyOptimizer" ? "Growth" : "Phase " + (i + 1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
