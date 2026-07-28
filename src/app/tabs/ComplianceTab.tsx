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

      {/* Scrolls sideways instead of forcing the page wide when the three labels
          don't fit (narrow phones); the negative margin keeps the scroll area
          flush with the page gutter. */}
      <div className="-mx-1 px-1 overflow-x-auto no-scrollbar">
        <div className="inline-flex rounded-xl ui-card-soft p-1 gap-1 flex-nowrap">
          {([
            { id: "staff" as const, label: "Staff compliance", short: "Staff", Icon: Users },
            { id: "requirements" as const, label: "Requirements", short: "Requirements", Icon: SlidersHorizontal },
            { id: "retention" as const, label: "Retention", short: "Retention", Icon: Archive },
          ]).map(({ id, label, short, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                view === id ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "staff" && <StaffComplianceTable initialStaffId={initialStaffId} />}
      {view === "requirements" && <RequirementsManager />}
      {view === "retention" && <RetentionManager />}
    </div>
  );
}
