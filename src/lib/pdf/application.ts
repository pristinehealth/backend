import { ReportPdf } from "./pdfBuilder";
import { getDocumentLabel, usesMetadataOnlyStorage } from "@/lib/documentMetadata";

/**
 * Job Application → PDF (candidate profile, questionnaire responses, submitted
 * documents, reviewer notes). Built on the shared `ReportPdf` builder.
 *
 *  - `ApplicationPdfData`         — typed input the generator renders.
 *  - `toApplicationPdfData()`     — maps the raw application/docs → typed data
 *                                   (the only place touching untyped shapes).
 *  - `downloadApplicationPdf()`   — composes and saves the document.
 */

// ── Typed input model ────────────────────────────────────────────────────────
export interface ApplicationPdfData {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  status: string;
  submittedAt: string | null;
  responses: Array<{ label: string; value: string }>;
  documents: Array<{ label: string; status: string; detail: string }>;
  notes: Array<{ author: string; date: string; text: string }>;
}

/** Map the raw application, its documents, and a status label → typed model. */
export function toApplicationPdfData(app: any, documents: any[], statusLabel: string): ApplicationPdfData {
  const values: Record<string, any> = app?.customFieldValues ?? {};

  const responses = (Array.isArray(app?.customFields) ? app.customFields : []).map((field: any) => {
    const raw = values[field?.name];
    let value: string;
    if (Array.isArray(raw)) value = raw.join(", ");
    else if (raw === undefined || raw === null || raw === "") value = "No answer provided";
    else if (field?.type === "file" && typeof raw === "string" && raw.startsWith("http")) value = raw;
    else value = String(raw);
    return { label: String(field?.label ?? field?.name ?? ""), value };
  });

  const docs = (Array.isArray(documents) ? documents : []).map((d: any) => {
    const parts: string[] = [];
    if (d?.fileName) parts.push(`File: ${d.fileName}`);
    else if (usesMetadataOnlyStorage(d?.documentType)) parts.push("Metadata only — no file stored");
    else parts.push("No file attached");
    if (d?.expiryDate) parts.push(`Expires: ${new Date(d.expiryDate).toLocaleDateString()}`);
    return {
      label: getDocumentLabel(d?.documentType) || String(d?.documentType ?? ""),
      status: String(d?.status ?? "pending").toUpperCase(),
      detail: parts.join("  ·  "),
    };
  });

  const notes = (Array.isArray(app?.notes) ? app.notes : []).map((n: any) => ({
    author: String(n?.author ?? "System"),
    date: n?.createdAt ? new Date(n.createdAt).toLocaleDateString() : "",
    text: String(n?.text ?? ""),
  }));

  return {
    applicationId: String(app?._id ?? ""),
    applicantName: String(app?.applicantName ?? "—"),
    applicantEmail: String(app?.applicantEmail ?? "—"),
    jobTitle: String(app?.jobTitle ?? "—"),
    status: statusLabel,
    submittedAt: app?.createdAt ?? null,
    responses,
    documents: docs,
    notes,
  };
}

// ── Composition + entry point ────────────────────────────────────────────────
/** Build and download a Job Application PDF from typed data. */
export function downloadApplicationPdf(data: ApplicationPdfData): void {
  const shortId = data.applicationId.slice(-6);
  const doc = new ReportPdf();

  doc.header("Job Application", "Pristine Health — Careers", `APP #${shortId}`);

  doc.keyValues([
    ["Applicant", data.applicantName || "—"],
    ["Email", data.applicantEmail || "—"],
    ["Applied For", data.jobTitle || "—"],
    ["Status", data.status || "—"],
    ["Submitted", data.submittedAt ? new Date(data.submittedAt).toLocaleString() : "—"],
  ]);

  if (data.responses.length) {
    doc.sectionTitle("Questionnaire Responses");
    data.responses.forEach((r) => doc.field(r.label, r.value));
  }

  if (data.documents.length) {
    doc.sectionTitle("Submitted Documents");
    data.documents.forEach((d) => doc.field(`${d.label}  —  ${d.status}`, d.detail));
  }

  if (data.notes.length) {
    doc.sectionTitle("Reviewer Notes");
    data.notes.forEach((n) => doc.field(`${n.author}${n.date ? ` · ${n.date}` : ""}`, n.text));
  }

  doc.footer(`Generated ${new Date().toLocaleString()}`);
  doc.save(`Job_Application_${shortId}.pdf`);
}
