// Shared types + helpers for the compliance UI (dashboard table, detail view,
// and the compact status on the staff detail page).

export type ComplianceStatus = "missing" | "pending" | "verified" | "rejected" | "expired";

export interface ComplianceSummary {
  total: number;
  verified: number;
  pending: number;
  expired: number;
  rejected: number;
  missing: number;
  mandatoryMissing: number;
}

export interface ComplianceCard {
  requirementKey: string;
  label: string;
  description: string;
  evidenceMode: "file" | "metadata_only" | "either";
  requiresExpiry: boolean;
  isMandatory: boolean;
  status: ComplianceStatus;
  expiryDate: string | null;
  rejectionReason: string | null;
  assignedManually: boolean;
  source: "compliance_record" | "none";
  evidence: { fileName: string; fileUrl: string; deliveryMethod: string; reference?: string } | null;
}

export type Overall = "compliant" | "in_progress" | "attention" | "empty";

export function overallStatus(s?: ComplianceSummary | null): Overall {
  if (!s || s.total === 0) return "empty";
  if (s.mandatoryMissing > 0 || s.expired > 0 || s.rejected > 0) return "attention";
  if (s.pending > 0 || s.missing > 0) return "in_progress";
  return "compliant";
}

export const OVERALL_META: Record<Overall, { label: string; className: string }> = {
  compliant: { label: "Compliant", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  in_progress: { label: "In progress", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  attention: { label: "Attention", className: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  empty: { label: "No data", className: "ui-card-soft ui-muted" },
};

export function statusBadgeClass(status: ComplianceStatus): string {
  switch (status) {
    case "verified":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "expired":
    case "rejected":
      return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    default:
      return "ui-card-soft ui-muted";
  }
}
