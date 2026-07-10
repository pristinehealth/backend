"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Lock, Search } from "lucide-react";

interface JobApplication {
  _id: string;
  jobId: string;
  jobTitle?: string;
  applicantName: string;
  applicantEmail: string;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested';
  createdAt: string;
}

function TrackApplicationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [trackEmail, setTrackEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [trackInfo, setTrackInfo] = useState('');
  const [trackedApps, setTrackedApps] = useState<JobApplication[]>([]);

  useEffect(() => {
    const email = searchParams.get('email') || '';
    const token = searchParams.get('token') || '';

    if (email) setTrackEmail(email);
    if (token) setAccessToken(token);

    if (email && token) {
      void runLookup(email, token);
    }
  }, [searchParams]);

  const runLookup = async (emailInput: string, tokenInput: string) => {
    setIsTracking(true);
    setTrackError('');
    setTrackInfo('');
    setTrackedApps([]);

    try {
      const res = await fetch('/api/applications/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, accessToken: tokenInput }),
      });

      const data = await res.json();
      if (res.ok) {
        setTrackedApps(data);
      } else {
        setTrackError(data.error || 'No applications found for these credentials.');
      }
    } catch (error) {
      console.error(error);
      setTrackError('Unable to fetch tracking details at the moment.');
    } finally {
      setIsTracking(false);
    }
  };

  const handleRequestCode = async () => {
    if (!trackEmail) return;

    setIsRequestingCode(true);
    setTrackError('');
    setTrackInfo('');

    try {
      const res = await fetch('/api/applications/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trackEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTrackError(data.error || 'Failed to send verification code.');
        return;
      }

      setCodeSent(true);
      setTrackInfo('Verification code sent. Check your email.');
    } catch (error) {
      console.error(error);
      setTrackError('Failed to send verification code.');
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleTrackSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trackEmail || !verificationCode) return;

    setTrackError('');
    setTrackInfo('');

    try {
      const verifyRes = await fetch('/api/applications/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trackEmail, code: verificationCode }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setTrackError(verifyData.error || 'Invalid or expired verification code.');
        return;
      }

      const token = verifyData.accessToken as string;
      setAccessToken(token);
      await runLookup(trackEmail, token);
      router.replace(`/jobs/track?email=${encodeURIComponent(trackEmail)}&token=${encodeURIComponent(token)}`);
    } catch (error) {
      console.error(error);
      setTrackError('Unable to verify code right now.');
    }
  };

  const statusClasses: Record<JobApplication['status'], string> = {
    pending: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    reviewed: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    shortlisted: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    accepted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    changes_requested: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-bold">Candidate portal</p>
            <h1 className="text-3xl font-black text-text-primary mt-1">Track Applications</h1>
          </div>
          <Link
            href="/jobs"
            className="text-xs font-bold px-4 py-2 rounded-xl border border-border-card bg-surface-card text-text-secondary hover:text-text-primary"
          >
            Back to careers
          </Link>
        </div>

        <div className="bg-surface-card border border-border-card rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4.5 w-4.5 text-brand-primary" />
            <h2 className="font-semibold text-sm uppercase tracking-wider text-text-secondary">Access verification</h2>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                type="email"
                required
                value={trackEmail}
                onChange={(e) => setTrackEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none"
              />
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={isRequestingCode || !trackEmail}
                className="bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                {isRequestingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}
              </button>
            </div>

            <form onSubmit={handleTrackSubmit} className="grid grid-cols-1 md:grid-cols-[180px_auto] gap-3">
              <input
                type="text"
                required
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                placeholder="6-digit code"
                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none uppercase font-mono font-bold"
              />
              <button
                type="submit"
                disabled={isTracking || !codeSent || !trackEmail}
                className="bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                {isTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Verify</>}
              </button>
            </form>
          </div>

          {trackInfo && (
            <div className="mt-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-sm">
              {trackInfo}
            </div>
          )}

          {trackError && (
            <div className="mt-4 p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {trackError}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {trackedApps.map((app) => (
            <div key={app._id} className="bg-surface-card border border-border-card rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-base font-bold text-text-primary">{app.jobTitle || 'Unknown Position'}</p>
                  <p className="text-xs text-text-muted mt-1">Submitted {new Date(app.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${statusClasses[app.status]}`}>
                  {app.status.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-4 flex justify-end">
                <Link
                  href={`/jobs/track/${app._id}?email=${encodeURIComponent(trackEmail)}&token=${encodeURIComponent(accessToken)}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-dark"
                >
                  Open full details <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}

          {!isTracking && !trackError && trackedApps.length === 0 && (
            <div className="bg-surface-card border border-border-card rounded-2xl p-6 text-sm text-text-secondary">
              Enter your email, request a one-time code, then verify to view your application details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrackApplicationsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <TrackApplicationsInner />
    </Suspense>
  );
}
