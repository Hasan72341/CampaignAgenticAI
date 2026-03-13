import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignApi } from '../services/api';
import SegmentTable from '../components/SegmentTable';
import VariantCard from '../components/VariantCard';
import AIPredictionCard from '../components/AIPredictionCard';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

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
            navigate(`/`); // Redirect to brief to show the new generation loop
        } catch (error) {
            console.error("Rejection failed", error);
            alert("Failed to reject campaign.");
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!sessionData || !sessionData.state_checkpoint) {
        return <div className="p-8 text-center text-red-500">Failed to load campaign data.</div>;
    }

    const state = sessionData.state_checkpoint;
    const segments = sessionData.segments || [];
    const metrics = sessionData.metrics || {};
    const totalCustomers = segments.reduce((acc, seg) => acc + (seg.customer_ids?.length || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-6 pb-24 space-y-8">
            {/* Header Section */}
            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Review Campaign Strategy</h1>
                    <div className="text-gray-500 text-sm max-w-2xl bg-gray-50 p-3 rounded-lg border">
                        <span className="font-semibold text-gray-700">Brief: </span>
                        {sessionData.brief}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="bg-blue-50 border border-blue-100 text-blue-800 px-4 py-2 rounded-lg text-center">
                        <div className="text-sm font-semibold uppercase tracking-wide">Total Reach</div>
                        <div className="text-2xl font-bold">{totalCustomers}</div>
                    </div>

                    {/* API Rate Limit Notice (Mocked for UI via metrics if available, or static warning) */}
                    <div className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Approving will consume {segments.length} `/send_campaign` API calls.</span>
                    </div>
                </div>
            </div>

            {/* Segments & Variants View */}
            <div className="space-y-12">
                {segments.map((segment, idx) => (
                    <div key={segment.id || idx} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800">{segment.label}</h3>
                            <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-full border">
                                Customers: {segment.customer_ids?.length || 0}
                            </span>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left column: ML Prediction & Segment Details */}
                            <div className="lg:col-span-1 space-y-6">
                                <AIPredictionCard segment={segment} />

                                <div>
                                    <h4 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Segment Configuration</h4>
                                    <SegmentTable segments={[segment]} />
                                </div>
                            </div>

                            {/* Right column: The proposed email variants */}
                            <div className="lg:col-span-2 space-y-4">
                                <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2 flex items-center justify-between">
                                    <span>Proposed Email Variants</span>
                                    <span className="text-xs text-gray-500 font-normal">For A/B Testing</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(segment.variants || []).map((variant, idx) => (
                                        <VariantCard key={idx} variant={variant} />
                                    ))}
                                </div>
                                {(!segment.variants || segment.variants.length === 0) && (
                                    <div className="text-gray-500 text-sm p-4 border rounded-lg bg-gray-50 text-center">
                                        No variants generated for this segment.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Sticky Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                        Please review the generated variants and ML predictions before approving.
                    </div>
                    <div className="flex space-x-4">
                        <button
                            onClick={() => setShowRejectModal(true)}
                            disabled={actionLoading}
                            className="px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 font-semibold rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
                        >
                            <XCircle className="w-5 h-5" />
                            <span>Reject & Revise</span>
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={actionLoading}
                            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg flex items-center space-x-2 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                            <span>Approve & Schedule</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Reject Campaign Strategy</h3>
                        <p className="text-gray-500 text-sm mb-4">
                            Provide feedback to the AI Planner. The campaign will be rerouted to the planning phase to incorporate your changes.
                        </p>
                        <textarea
                            className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none text-sm mb-4"
                            placeholder="E.g., Make the subject lines shorter, or focus more on the mobile app convenience..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            disabled={actionLoading}
                        />
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                disabled={actionLoading}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                            >
                                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                <span>Confirm Rejection</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
