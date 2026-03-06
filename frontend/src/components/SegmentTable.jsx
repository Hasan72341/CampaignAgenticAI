import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function SegmentTable({ segments }) {
    const [expandedRow, setExpandedRow] = useState(null);

    if (!segments || segments.length === 0) return <p className="text-gray-500 text-sm">No segments defined.</p>;

    return (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Segment Label</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Customer Count</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Send Time (IST)</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {segments.map((seg, idx) => {
                        const isExpanded = expandedRow === idx;
                        return (
                            <React.Fragment key={seg.id || idx}>
                                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : idx)}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{seg.label}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{seg.customer_ids?.length || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{seg.send_time}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-blue-600">
                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <td colSpan={4} className="px-6 py-4">
                                            <div className="text-xs text-gray-500 break-words max-h-32 overflow-y-auto bg-white p-3 rounded border">
                                                <strong className="block mb-1 text-gray-700">Customer IDs:</strong>
                                                {seg.customer_ids ? seg.customer_ids.join(', ') : 'None'}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
