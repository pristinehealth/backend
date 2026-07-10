"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, User, Mail, Lock } from "lucide-react";

export default function RegisterPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [authorized, setAuthorized] = useState(false);

    // Redirect to home if not authenticated or not admin
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        } else if (status === "authenticated" && (session?.user?.role === "admin" || session?.user?.role === "superadmin")) {
            setAuthorized(true);
        } else if (status === "authenticated" && session?.user?.role !== "admin" && session?.user?.role !== "superadmin") {
            router.push("/dashboard");
        }
    }, [status, session, router]);

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[#050506]">
                <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#050506] text-[#EDEDEF] relative overflow-hidden font-sans">
            
            {/* Ambient Lighting Blobs */}
            <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px] pointer-events-none animate-float-slow"></div>
            <div className="absolute bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-teal-500/5 rounded-full blur-[130px] pointer-events-none animate-float-medium"></div>

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

            <div className="max-w-md w-full bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_80px_rgba(6,182,212,0.02)] border border-white/[0.06] relative z-10">
                {!authorized ? (
                    <div className="text-center space-y-6">
                        <div>
                            <AlertCircle className="h-16 w-16 text-rose-400 mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-white mb-2">Unauthorized Access</h1>
                            <p className="text-slate-400 text-sm">Only admins can register new users.</p>
                        </div>

                        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-left space-y-2">
                            <p className="text-xs font-semibold text-slate-300">To register new users:</p>
                            <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                                <li>Log in to the <span className="text-cyan-400">dashboard</span></li>
                                <li>Go to <span className="text-cyan-400">Staff</span> tab</li>
                                <li>Use admin controls to register new users</li>
                            </ol>
                        </div>

                        <button
                            type="button"
                            onClick={() => router.push("/login")}
                            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl transition-all text-sm"
                        >
                            Go to Login
                        </button>
                    </div>
                ) : (
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin mx-auto" />
                        <p className="text-slate-400 text-xs mt-4">Redirecting...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
