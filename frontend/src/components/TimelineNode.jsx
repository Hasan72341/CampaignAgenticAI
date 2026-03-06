import React from 'react';
import clsx from 'clsx';
import { Check, Clock, AlertTriangle } from 'lucide-react';

export default function TimelineNode({ node, isActive, onClick }) {
    // node structure: { id, label, status: 'pending'|'active'|'success'|'error' }
    const isPending = node.status === 'pending';
    const isActiveStatus = node.status === 'active';
    const isSuccess = node.status === 'success';
    const isError = node.status === 'error';

    return (
        <div
            className={clsx(
                "relative flex flex-col items-center cursor-pointer transition-transform hover:scale-105 group",
                isActive ? "opacity-100" : "opacity-70 hover:opacity-100"
            )}
            onClick={() => onClick(node)}
        >
            <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 bg-white transition-colors",
                isSuccess ? "border-green-500 text-green-500 bg-green-50" :
                    isError ? "border-red-500 text-red-500 bg-red-50" :
                        isActiveStatus ? "border-blue-500 text-blue-500 ring-4 ring-blue-100 bg-blue-50" :
                            "border-gray-300 text-gray-300",
                isActive && !isActiveStatus && "ring-2 ring-gray-200"
            )}>
                {isSuccess ? <Check className="w-5 h-5" /> :
                    isError ? <AlertTriangle className="w-5 h-5" /> :
                        <Clock className="w-5 h-5" />}
            </div>
            <div className={clsx(
                "mt-2 text-xs font-semibold text-center w-24 tracking-wide",
                isSuccess ? "text-green-700" :
                    isError ? "text-red-700" :
                        isActiveStatus ? "text-blue-700 font-bold" :
                            "text-gray-500"
            )}>
                {node.label}
            </div>

            {/* Node selection indicator */}
            {isActive && (
                <div className="absolute -bottom-3 w-1 h-1 bg-gray-600 rounded-full" />
            )}
        </div>
    );
}
