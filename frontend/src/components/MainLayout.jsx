import React from 'react';
import Sidebar from './Sidebar';
import { Search, Bell, User } from 'lucide-react';

export default function MainLayout({ children }) {
    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 relative z-10">
                    <div className="flex items-center gap-4 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 w-96 max-w-full">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search campaigns, segments..."
                            className="bg-transparent border-none focus:ring-0 text-sm text-slate-600 w-full placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex items-center gap-6">
                        <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                        </button>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="flex items-center gap-3 cursor-pointer group">
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-slate-900 leading-tight">Admin User</span>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Hackathon Pro</span>
                            </div>
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center border border-indigo-200 group-hover:border-indigo-400 transition-colors">
                                <User className="text-indigo-600 w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    {children}
                </main>
            </div>
        </div>
    );
}
