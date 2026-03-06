import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Line,
    ComposedChart
} from 'recharts';

export default function MetricsChart({ data }) {
    // data format expected: [{ name: 'Variant A', openRate: 25, clickRate: 15, weighted: ... }, ...]

    if (!data || data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm">
                No metric data available yet.
            </div>
        );
    }

    return (
        <div className="h-80 w-full bg-white p-4 rounded-xl border shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                    data={data}
                    margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        tickFormatter={(value) => `${value}%`}
                    />

                    <Tooltip
                        cursor={{ fill: '#F3F4F6' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value) => [`${value}%`, '']}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />

                    <Bar yAxisId="left" dataKey="openRate" name="Open Rate" fill="#93C5FD" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    <Bar yAxisId="left" dataKey="clickRate" name="Click Rate" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    <Line yAxisId="left" type="monotone" dataKey="weighted" name="Weighted Score" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
