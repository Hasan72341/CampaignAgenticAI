import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignApi } from '../services/api';
import AgentStatusBadge from '../components/AgentStatusBadge';

const AGENT_STAGES = [
    { id: 'profiling', label: 'Profiling Customers' },
    { id: 'planning', label: 'Planning Strategy' },
    { id: 'generating', label: 'Generating Content' },
    { id: 'pending_approval', label: 'Awaiting Approval' }
];

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
                    navigate(`/approval/${campaignId}`);
                } else if (data.status === 'rejected' || data.status === 'approved' || data.status === 'completed') {
                    clearInterval(interval);
                    navigate(`/dashboard/${campaignId}`);
                }
            } catch (error) {
                console.error('Error polling status', error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [campaignId, navigate]);

    const getBadgeStatus = (stageId) => {
        if (!currentStatus) return 'waiting';
        const currentIndex = AGENT_STAGES.findIndex(s => s.id === currentStatus);
        const stageIndex = AGENT_STAGES.findIndex(s => s.id === stageId);

        if (stageIndex < currentIndex) return 'completed';
        if (stageIndex === currentIndex) return 'active';
        // special handling for pending_approval -> if we reach pending_approval, we consider it active/completed since the redirect happens.
        if (currentStatus === 'pending_approval' && stageId === 'pending_approval') return 'active';
        return 'waiting';
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-8 border border-gray-100">
                <h1 className="text-3xl font-bold mb-2 text-gray-800 tracking-tight">CampaignX Planner</h1>
                <p className="text-gray-500 mb-8 leading-relaxed">Enter your campaign brief to start the AI agent workflow.</p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <textarea
                        className="w-full h-40 p-4 border rounded-xl shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900 resize-none"
                        placeholder="E.g., Launch XDeposit campaign targeting young professionals in Tier-1 cities..."
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        disabled={loading || campaignId}
                    />
                    {!campaignId && (
                        <button
                            type="submit"
                            disabled={loading || !brief.trim()}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                        >
                            {loading ? 'Starting Agents...' : 'Generate Strategy'}
                        </button>
                    )}
                </form>

                {campaignId && (
                    <div className="mt-8 space-y-4 border-t pt-8">
                        <h3 className="text-lg font-medium text-gray-800 mb-4">Agent Progress Tracker</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {AGENT_STAGES.map(stage => (
                                <AgentStatusBadge
                                    key={stage.id}
                                    label={stage.label}
                                    status={getBadgeStatus(stage.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
