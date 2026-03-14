import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { campaignApi } from '../services/api';
import {
    LayoutDashboard,
    Send,
    CheckSquare,
    Settings,
    ChevronRight,
    Sparkles,
    BarChart3
} from 'lucide-react';
import clsx from 'clsx';

const SidebarItem = ({ to, icon: Icon, label, disabled }) => (
    <NavLink
        to={to}
        className={({ isActive }) => clsx(
            "flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group mb-1",
            isActive && !disabled ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
    >
        <div className="flex items-center gap-3">
            <Icon className={clsx("w-5 h-5", !disabled && "group-hover:scale-110 transition-transform")} />
            <span className="font-medium text-sm">{label}</span>
        </div>
        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
    </NavLink>
);

export default function Sidebar() {
    const { id } = useParams();
    const [quota, setQuota] = React.useState({ used: 0, limit: 300, percentage: 0 });
    const [recentCampaigns, setRecentCampaigns] = React.useState([]);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [quotaData, campaignsData] = await Promise.all([
                    campaignApi.getQuota(),
                    campaignApi.listCampaigns(5)
                ]);
                setQuota(quotaData);
                setRecentCampaigns(campaignsData);
            } catch (error) {
                console.error("Sidebar data fetch failed", error);
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <aside className="w-72 h-screen bg-white border-r border-slate-200 flex flex-col sticky top-0 shrink-0">
            {/* Brand */}
            <div className="p-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg">
                    <Sparkles className="text-white w-6 h-6" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 text-lg tracking-tight">CampaignX</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Strategic Labs</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
                <div className="px-4 mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</span>
                </div>
                <SidebarItem to="/" icon={Send} label="Initialize Mandate" />
                <SidebarItem
                    to={id ? `/approval/${id}` : '#'}
                    icon={CheckSquare}
                    label="Strategy Review"
                    disabled={!id}
                />
                <SidebarItem
                    to={id ? `/dashboard/${id}` : '/dashboard'}
                    icon={LayoutDashboard}
                    label="Intelligence Center"
                />

                {recentCampaigns.length > 0 && (
                    <div className="mt-8 space-y-4">
                        <div className="px-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Mandates</span>
                        </div>
                        <div className="px-2 space-y-1">
                            {recentCampaigns.map(c => (
                                <NavLink
                                    key={c.id}
                                    to={`/dashboard/${c.id}`}
                                    className={({ isActive }) => clsx(
                                        "block px-4 py-2 rounded-lg text-xs font-medium truncate transition-all",
                                        isActive || id === c.id ? "bg-slate-100 text-indigo-600 font-bold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    {c.brief.substring(0, 30)}...
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* Quota / Status Widget */}
            <div className="p-6">
                <div className="glass-morphism rounded-2xl p-4 bg-slate-50 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Strategic Capacity</span>
                        <span className={clsx(
                            "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest",
                            quota.percentage > 90 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        )}>{100 - quota.percentage}% Free</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${quota.percentage}%` }}
                            className={clsx(
                                "h-full rounded-full transition-all duration-500",
                                quota.percentage > 90 ? "bg-red-500" : "bg-indigo-600"
                            )}
                        />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3 font-medium flex justify-between">
                        <span>{quota.used} / {quota.limit} Orchestrations</span>
                        <span>Daily Limit</span>
                    </p>
                </div>
            </div>

            {/* Footer Profile */}
            <div className="p-4 border-t border-slate-100 italic text-[10px] text-slate-300 text-center">
                Digital Strategic Command • v1.0
            </div>
        </aside>
    );
}
