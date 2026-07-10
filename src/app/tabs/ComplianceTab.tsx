"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Users, SlidersHorizontal, Archive } from "lucide-react";
import { StaffComplianceTable } from "./compliance/StaffComplianceTable";
import { RequirementsManager } from "./compliance/RequirementsManager";
import { RetentionManager } from "./compliance/RetentionManager";

type View = "staff" | "requirements" | "retention";

export function ComplianceTab() {
  const [view, setView] = useState<View>("staff");
  const [initialStaffId, setInitialStaffId] = useState<string | undefined>(undefined);

  // Support deep-links from the staff detail page: /dashboard?tab=compliance&staff=<id>
  // Consume the `staff` param ONCE, then strip it from the URL — otherwise it
  // persists and re-opens the detail modal on every reload/revisit of this tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const staff = params.get("staff");
    if (staff) {
      setView("staff");
      setInitialStaffId(staff);
      params.delete("staff");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-primary-muted text-brand-primary border border-brand-primary/20 text-xs font-bold uppercase tracking-widest">
          <ShieldCheck className="h-3.5 w-3.5" /> Compliance
        </div>
        <p className="mt-3 text-sm text-text-secondary max-w-2xl">
          Track each staff member&apos;s compliance status, and configure the requirement catalog.
        </p>
      </div>

      <div className="inline-flex rounded-xl ui-card-soft p-1 gap-1">
        <button
          type="button"
          onClick={() => setView("staff")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            view === "staff" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Users className="h-4 w-4" /> Staff compliance
        </button>
        <button
          type="button"
          onClick={() => setView("requirements")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            view === "requirements" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" /> Requirements
        </button>
        <button
          type="button"
          onClick={() => setView("retention")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            view === "retention" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Archive className="h-4 w-4" /> Retention
        </button>
      </div>

      {view === "staff" && <StaffComplianceTable initialStaffId={initialStaffId} />}
      {view === "requirements" && <RequirementsManager />}
      {view === "retention" && <RetentionManager />}
    </div>
  );
}
