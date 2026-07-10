"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Lock, Mail, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Auto-redirect if already authenticated
    useEffect(() => {
        if (status === "authenticated") {
            router.push("/dashboard");
        }
    }, [status, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // Read target redirect callback from URL params
            const searchParams = new URLSearchParams(window.location.search);
            let callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
            
            // Override landing page redirection so users always land on the dashboard
            if (callbackUrl === "/" || callbackUrl === "%2F" || callbackUrl.startsWith("/login")) {
                callbackUrl = "/dashboard";
            }

            const res = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (res?.error) {
                setError("Invalid email or password");
            } else {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch (err) {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#050506] text-[#EDEDEF] relative overflow-hidden font-sans">
            
            {/* Ambient Lighting Blobs */}
            <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px] pointer-events-none animate-float-slow"></div>
            <div className="absolute bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-teal-500/5 rounded-full blur-[130px] pointer-events-none animate-float-medium"></div>

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

            <div className="max-w-md w-full bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_80px_rgba(6,182,212,0.02)] border border-white/[0.06] relative z-10">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-3">
                        <img src="/logo.png" alt="Pristine Health" className="h-16 w-auto brightness-110" />
                    </div>
                    <h2 className="text-xl font-bold bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent tracking-tight">
                        Internal Staff Portal
                    </h2>
                    <p className="text-slate-400 mt-2 text-xs">
                        Enter your credentials to access the CRM dashboard
                    </p>
                </div>

                {error && (
                    <div className="text-rose-400 border border-rose-500/20 bg-rose-500/10 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold mb-6">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                                placeholder="admin@pristine.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-70 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-lg shadow-cyan-500/20 mt-4 text-sm"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Authenticating...
                            </>
                        ) : (
                            "Secure Login"
                        )}
                    </button>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => router.push("/forgot-password")}
                            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                        >
                            Forgot your password?
                        </button>
                    </div>
                </form>

                <div className="mt-8 pt-6 border-t border-white/10">
                    <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-xl transition-all text-sm"
                    >
                        ← Back to Home
                    </button>
                </div>
            </div>
        </div>
    );
}
