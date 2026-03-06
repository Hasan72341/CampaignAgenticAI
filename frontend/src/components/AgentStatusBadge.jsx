import React from 'react';
import { Loader2, CheckCircle, Circle } from 'lucide-react';
import clsx from 'clsx';

export default function AgentStatusBadge({ label, status }) {
    // status can be 'waiting', 'active', 'completed'
    return (
        <div className={clsx(
            "flex items-center space-x-3 p-3 rounded-lg border transition-all duration-300",
            status === 'active' ? "bg-blue-50 border-blue-200 text-blue-800 shadow-sm" :
                status === 'completed' ? "bg-green-50 border-green-200 text-green-800" :
                    "bg-white border-gray-200 text-gray-400"
        )}>
            {status === 'active' && <Loader2 className="w-5 h-5 animate-spin" />}
            {status === 'completed' && <CheckCircle className="w-5 h-5" />}
            {status === 'waiting' && <Circle className="w-5 h-5" />}
            <span className="font-medium text-sm">{label}</span>
        </div>
    );
}
