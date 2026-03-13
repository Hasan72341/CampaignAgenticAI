import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { campaignApi } from '../services/api';
import TimelineNode from '../components/TimelineNode';
import MetricsChart from '../components/MetricsChart';
import VariantCard from '../components/VariantCard';
import { Loader2, RefreshCw, Activity, ArrowRight, Server, Database, ActivitySquare, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export default function DashboardPage() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [sysStatus, setSysStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [optimizeLoading, setOptimizeLoading] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);

    const loadData = async () => {
        if (!id) return;
        try {
            const [campData, metsData, sysData] = await Promise.all([
                campaignApi.getCampaignStatus(id),
                campaignApi.getMetrics(id).catch(() => ({})),
                campaignApi.getSystemStatus().catch(() => ({}))
            ]);
            setData(campData);
            setMetrics(metsData);
            setSysStatus(sysData);

            if (!selectedNode && campData.agent_logs && campData.agent_logs.length > 0) {
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
        // Poll every 5s if we are in monitoring/optimizing state
        let interval;
        if (data?.status === 'monitoring' || data?.status === 'optimizing' || data?.status === 'executing') {
            interval = setInterval(loadData, 5000);
        }
        return () => clearInterval(interval);
    }, [id, data?.status]);

    const handleOptimize = async () => {
        setOptimizeLoading(true);
        try {
            await campaignApi.triggerOptimize(id);
            await loadData();
        } catch (error) {
            console.error("Optimize failed", error);
            alert("Failed to start optimization loop");
        } finally {
            setOptimizeLoading(false);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!data) return <div className="p-8 text-center text-red-500">Campaign not found.</div>;

    const currentCampStatus = data.status;
    const isExecuting = currentCampStatus === 'executing';
    const isOptimizing = currentCampStatus === 'optimizing';
    const isCompleted = currentCampStatus === 'completed';

    // Build Timeline Nodes (derived from agent_logs)
    // We want to group by agent_name roughly, but sequential logs work too.
    const timelineNodes = (data.agent_logs || []).map((log, i) => {
        let status = 'success';
        let label = log.agent_name;
        // simple heuristic to format
        if (label.includes('Planner')) label = 'Planner';
        if (label.includes('Generator')) label = 'Generator';
        if (label.includes('Profiler')) label = 'Profiler';
        if (label.includes('Analyst')) label = 'Analyst';
        if (label.includes('Optimizer')) label = 'Optimizer';

        return {
            id: log.id,
            label: `${label} (v${log.step || 1})`,
            status: status,
            raw: log
        };
    });

    // Add trailing active nodes based on status
    if (currentCampStatus === 'planning') timelineNodes.push({ id: 'active-node', label: 'Planner', status: 'active' });
    if (currentCampStatus === 'generating') timelineNodes.push({ id: 'active-node', label: 'Generator', status: 'active' });
    if (isExecuting) timelineNodes.push({ id: 'exec-node', label: 'Execution Engine', status: 'active' });
    if (currentCampStatus === 'monitoring') timelineNodes.push({ id: 'mon-node', label: 'Analyst', status: 'active' });

    // Prepare metrics for Chart
    let chartData = [];
    let totalOpenRate = 0;
    let totalClickRate = 0;
    let overAllWeighted = 0;

    if (metrics?.variants && metrics.variants.length > 0) {
        chartData = metrics.variants.map((v, i) => {
            const sent = v.sent_count || 0;
            const open = v.open_count || 0;
            const click = v.click_count || 0;
            const oRate = sent > 0 ? (open / sent) * 100 : 0;
            const cRate = sent > 0 ? (click / sent) * 100 : 0;
            const wScore = (cRate * 0.7) + (oRate * 0.3);
            return {
                name: `Var ${i + 1} (${v.subject ? v.subject.substring(0, 10) + '...' : 'No Subj'})`,
                openRate: parseFloat(oRate.toFixed(1)),
                clickRate: parseFloat(cRate.toFixed(1)),
                weighted: parseFloat(wScore.toFixed(1))
            }
        });
        totalOpenRate = metrics.overall_open_rate ? (metrics.overall_open_rate * 100).toFixed(1) : 0;
        totalClickRate = metrics.overall_click_rate ? (metrics.overall_click_rate * 100).toFixed(1) : 0;
        overAllWeighted = metrics.overall_weighted_score ? (metrics.overall_weighted_score * 100).toFixed(1) : 0;
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Top Nav */}
            <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
                <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                            <ActivitySquare className="w-5 h-5 text-blue-600" /> Glass-Box Dashboard
                        </h1>
                        <div className="h-6 w-px bg-gray-300" />
                        <div className="text-sm font-medium text-gray-500">ID: <span className="text-gray-900 font-mono text-xs bg-gray-100 px-2 py-1 rounded">{id.substring(0, 8)}</span></div>
                        <div className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-200 uppercase tracking-wide">
                            {currentCampStatus.replace('_', ' ')}
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Rate Limit Indicator */}
                        {sysStatus?.rate_limits && (
                            <div className="hidden md:flex items-center space-x-3 text-xs">
                                <div className="flex items-center gap-1 text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded border">
                                    <Database className="w-3 h-3" /> Cohort: {sysStatus.rate_limits.get_customer_cohort || 0}/100
                                </div>
                                <div className="flex items-center gap-1 text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded border">
                                    <Server className="w-3 h-3" /> Send: {sysStatus.rate_limits.send_campaign || 0}/100
                                </div>
                            </div>
                        )}
                        <button onClick={loadData} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Refresh">
                            <RefreshCw className="w-5 h-5" />
                        </button>
                        <Link to="/" className="text-sm font-semibold text-blue-600 hover:underline">New Campaign</Link>
                    </div>
                </div>
            </header>

            <main className="max-w-[90rem] mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Column: Flow & Metrics */}
                <div className="lg:col-span-8 flex flex-col space-y-8">

                    {/* Agent Flow Timeline */}
                    <section className="bg-white rounded-xl shadow-sm border p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-500" /> LangGraph Execution Flow
                        </h2>
                        <div className="relative flex justify-between items-start pt-4 overflow-x-auto pb-4 px-2">
                            {/* Timeline connecting line */}
                            <div className="absolute top-[26px] left-10 right-10 h-0.5 bg-gray-200 -z-0" />

                            {timelineNodes.length === 0 ? (
                                <div className="text-center w-full text-sm text-gray-400">Timeline starting...</div>
                            ) : (
                                timelineNodes.map((node, i) => (
                                    <React.Fragment key={i}>
                                        <TimelineNode
                                            node={node}
                                            isActive={selectedNode?.id === node.id}
                                            onClick={(n) => n.raw ? setSelectedNode(n.raw) : null}
                                        />
                                    </React.Fragment>
                                ))
                            )}
                        </div>
                    </section>

                    {/* Performance Metrics Section */}
                    <section className="bg-white rounded-xl shadow-sm border p-6 flex flex-col space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-900">Campaign Performance</h2>
                            <button
                                onClick={handleOptimize}
                                disabled={isOptimizing || isExecuting || !isCompleted}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {optimizeLoading || isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                <span>{isOptimizing ? 'Optimizing Loop...' : 'Optimize Next Campaign'}</span>
                            </button>
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                <div className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-1">Open Rate</div>
                                <div className="text-3xl font-bold text-gray-900">{totalOpenRate}%</div>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-widest mb-1">Click Rate</div>
                                <div className="text-3xl font-bold text-gray-900">{totalClickRate}%</div>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                                <div className="text-xs font-semibold text-green-700 uppercase tracking-widest mb-1">Weighted Score</div>
                                <div className="text-3xl font-bold text-green-900">{overAllWeighted}%</div>
                            </div>
                        </div>

                        {/* Recharts Bar/Line Chart */}
                        <MetricsChart data={chartData} />

                        {/* Iteration Notice */}
                        {(metrics?.iteration_count && metrics.iteration_count > 1) ? (
                            <div className="text-xs text-gray-500 flex justify-between bg-gray-50 p-2 rounded">
                                <span>Iteration: {metrics.iteration_count}</span>
                                <span>Models are adjusting based on previous failures.</span>
                            </div>
                        ) : null}
                    </section>
                </div>

                {/* Right Column: Reasoning Inspector */}
                <div className="lg:col-span-4 flex flex-col h-[calc(100vh-8rem)]">
                    <section className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 flex flex-col h-full overflow-hidden">
                        <div className="p-4 bg-gray-950 border-b border-gray-800 flex justify-between items-center shrink-0">
                            <h3 className="font-semibold text-white tracking-wide text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                Agent Reasoning Log
                            </h3>
                            {selectedNode && (
                                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded font-mono">
                                    {selectedNode.agent_name}
                                </span>
                            )}
                        </div>

                        <div className="p-4 flex-grow overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                            {selectedNode ? (
                                <>
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Input Strategy</div>
                                        <pre className="text-[10px] text-green-400 font-mono bg-black/50 p-3 rounded overflow-x-auto border border-gray-800">
                                            {JSON.stringify(selectedNode.input_payload, null, 2) || "// No Input"}
                                        </pre>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">LLM Chain of Thought</div>
                                        <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed bg-black/30 p-3 rounded-lg border-l-2 border-indigo-500 font-serif italic">
                                            {selectedNode.llm_reasoning || "Reasoning trace not captured."}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                            <span>Synthesized Output</span>
                                            <ArrowRight className="w-3 h-3" />
                                        </div>
                                        <pre className="text-[10px] text-blue-400 font-mono bg-black/50 p-3 rounded overflow-x-auto border border-gray-800">
                                            {JSON.stringify(selectedNode.output_payload, null, 2) || "// No Output"}
                                        </pre>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm space-y-3">
                                    <ActivitySquare className="w-12 h-12 opacity-20" />
                                    <p>Click an active Agent Node in the timeline to inspect IO.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
