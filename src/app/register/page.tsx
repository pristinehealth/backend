"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to register");
            } else {
                setSuccess(true);
                setTimeout(() => {
                    router.push("/login");
                }, 2000);
            }
        } catch (err) {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 font-sans selection:bg-brand-blue-light/30">
            <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-700">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                        Create Admin
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Register a new authorized user
                    </p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm font-medium">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        {error}
                    </div>
                )}

                {success ? (
                    <div className="text-center py-6">
                        <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Admin Created!</h3>
                        <p className="text-slate-500 mt-2">Redirecting you to login...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Full Name
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue-light/50 focus:border-brand-blue-light transition-colors"
                                placeholder="John Doe"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue-light/50 focus:border-brand-blue-light transition-colors"
                                placeholder="admin@pristine.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Password
                            </label>
                            <input
                                type="password"
                                required
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue-light/50 focus:border-brand-blue-light transition-colors"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 px-4 bg-brand-blue hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed custom-shadow shadow-brand-blue-light/20 flex justify-center items-center gap-2 active:scale-[0.98] mt-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                "Register Admin"
                            )}
                        </button>
                    </form>
                )}

                <div className="mt-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                    Already have an account? <a href="/login" className="text-brand-blue dark:text-brand-blue-light hover:underline">Log in here</a>
                </div>
            </div>
        </div>
    );
}
