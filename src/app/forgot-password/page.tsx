"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Loader2,
    AlertCircle,
    CheckCircle2,
    Lock,
    Mail,
    KeyRound,
    Eye,
    EyeOff,
    ArrowLeft,
} from "lucide-react";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("request");

    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);

    const requestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data?.error || "Something went wrong. Please try again.");
            } else {
                // Generic by design — advance regardless of whether the email exists.
                setStep("reset");
                setNotice(
                    "If an account with that email exists, we've sent a 6-digit code. It expires in 10 minutes."
                );
            }
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, code, newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data?.error || "Could not reset password. Please try again.");
            } else {
                setStep("done");
            }
        } catch {
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
                        Reset Your Password
                    </h2>
                    <p className="text-slate-400 mt-2 text-xs">
                        {step === "request" && "Enter your admin email to receive a reset code"}
                        {step === "reset" && "Enter the code we emailed you and a new password"}
                        {step === "done" && "Your password has been updated"}
                    </p>
                </div>

                {error && (
                    <div className="text-rose-400 border border-rose-500/20 bg-rose-500/10 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold mb-6">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}
                {notice && step !== "done" && (
                    <div className="text-cyan-300 border border-cyan-500/20 bg-cyan-500/10 p-3.5 rounded-xl flex items-start gap-2.5 text-xs font-medium mb-6">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        {notice}
                    </div>
                )}

                {/* Step 1 — request a code */}
                {step === "request" && (
                    <form onSubmit={requestCode} className="space-y-5">
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

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-70 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 mt-4 text-sm shadow-lg shadow-cyan-500/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Sending code...
                                </>
                            ) : (
                                "Send Reset Code"
                            )}
                        </button>
                    </form>
                )}

                {/* Step 2 — enter code + new password */}
                {step === "reset" && (
                    <form onSubmit={resetPassword} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Reset Code
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    required
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 tracking-[0.4em] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                                    placeholder="000000"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                New Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    minLength={8}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                                    placeholder="At least 8 characters"
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
                            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-70 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 mt-4 text-sm shadow-lg shadow-cyan-500/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                "Set New Password"
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setStep("request");
                                setError("");
                                setNotice("");
                                setCode("");
                                setNewPassword("");
                            }}
                            className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            Use a different email
                        </button>
                    </form>
                )}

                {/* Step 3 — success */}
                {step === "done" && (
                    <div className="text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                            </div>
                        </div>
                        <p className="text-sm text-slate-300">
                            Your password has been reset. You can now sign in with your new password.
                        </p>
                        <button
                            type="button"
                            onClick={() => router.push("/login")}
                            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-lg shadow-cyan-500/20"
                        >
                            Go to Sign In
                        </button>
                    </div>
                )}

                {step !== "done" && (
                    <div className="mt-8 pt-6 border-t border-white/10">
                        <button
                            type="button"
                            onClick={() => router.push("/login")}
                            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Sign In
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
