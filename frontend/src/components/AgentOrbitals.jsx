import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    Brain,
    PenTool,
    CheckCircle2,
    Zap,
    Search
} from 'lucide-react';
import clsx from 'clsx';

const AGENTS = [
    { id: 'profiling', icon: Search, label: 'Audience Insight' },
    { id: 'planning', icon: Brain, label: 'Strategic Architect' },
    { id: 'generating', icon: PenTool, label: 'Creative Studio' },
];

export default function AgentOrbitals({ activeStage }) {
    return (
        <div className="relative w-full h-64 flex items-center justify-center overflow-hidden">
            {/* Background Rings */}
            <div className="absolute w-48 h-48 border border-slate-200 rounded-full opacity-50" />
            <div className="absolute w-32 h-32 border border-slate-200 rounded-full opacity-30" />

            {/* Central Campaign Node */}
            <div className="relative z-10 w-20 h-20 bg-white rounded-2xl shadow-xl border border-indigo-100 flex items-center justify-center animate-pulse-slow">
                <Zap className="text-indigo-600 w-8 h-8" />
            </div>

            {/* Agents Orbiting */}
            {AGENTS.map((agent, idx) => {
                const isActive = activeStage === agent.id;
                const isPast = ['profiling', 'planning', 'generating', 'pending_approval'].indexOf(activeStage) > idx;
                const angle = (idx * 120) * (Math.PI / 180);
                const radius = 100;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                    <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{
                            opacity: 1,
                            scale: isActive ? 1.2 : 1,
                            x,
                            y
                        }}
                        transition={{ type: 'spring', damping: 12 }}
                        className="absolute z-20"
                    >
                        <div className={clsx(
                            "flex flex-col items-center gap-2 px-3 py-2 rounded-xl transition-all duration-500",
                            isActive ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-110" :
                                isPast ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" :
                                    "bg-white text-slate-400 border border-slate-200 shadow-sm"
                        )}>
                            <agent.icon className={clsx("w-5 h-5", isActive && "animate-spin-slow")} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">{agent.label}</span>

                            <AnimatePresence>
                                {isPast && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm border border-slate-100"
                                    >
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500 fill-emerald-50" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                );
            })}

            {/* Connecting Lines (Simulated via SVG) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                {/* Simplified connecting lines would go here */}
            </svg>
        </div>
    );
}
