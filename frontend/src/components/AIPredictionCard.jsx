import React from 'react';
import { Target, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function AIPredictionCard({ segment }) {
    const openRate = ((segment.predicted_open_rate || 0) * 100).toFixed(1);
    const clickRate = ((segment.predicted_click_rate || 0) * 100).toFixed(1);
    const weighted = (parseFloat(clickRate) * 0.7 + parseFloat(openRate) * 0.3).toFixed(1);

    const openRateVal = segment.predicted_open_rate || 0;
    const confidence = openRateVal > 0.20 ? "High" : openRateVal > 0.12 ? "Medium" : "Low";

    return (
        <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-gray-800 flex items-center space-x-2">
                    <Target className="w-5 h-5 text-indigo-500" />
                    <span>Heuristic Prediction</span>
                </h4>
                <span className={clsx(
                    "px-2.5 py-1 text-xs font-semibold rounded-full border",
                    confidence === 'High' ? "bg-green-50 text-green-700 border-green-200" :
                        confidence === 'Medium' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            "bg-red-50 text-red-700 border-red-200"
                )}>
                    {confidence} Confidence
                </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Open Rate</div>
                    <div className="text-xl font-bold text-gray-900">{openRate}%</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Click Rate</div>
                    <div className="text-xl font-bold text-gray-900">{clickRate}%</div>
                </div>
                <div className="text-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                    <div className="text-xs text-indigo-600 font-medium uppercase tracking-wider mb-1">Weighted</div>
                    <div className="text-xl font-bold text-indigo-900">{weighted}%</div>
                </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>Scores are heuristic estimates and not actual engagement metrics.</span>
            </p>
        </div>
    );
}
