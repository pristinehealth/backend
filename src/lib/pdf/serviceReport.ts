import { ReportPdf, loadImageAsDataUrl } from "./pdfBuilder";

/**
 * Service Report → PDF.
 *
 *  - `ServiceReportPdfData`      — the typed input the generator renders.
 *  - `toServiceReportPdfData()`  — maps the loose Perfex shape → typed data (the
 *                                  only place that touches untyped fields).
 *  - `downloadServiceReportPdf()`— composes the document (on the shared
 *                                  `ReportPdf` builder) and saves it.
 */

// ── Typed input model ────────────────────────────────────────────────────────
export interface ServiceReportPdfData {
  reportId: string;
  task: { name: string; id: string | number; project: string | null; client: string | null };
  caregiver: string;
  submittedAt: string | null;
  questionnaire: Array<{ question: string; answer: string }>;
  checklist: Array<{ label: string; done: boolean }>;
  notes: string;
  staffSignatureUrl: string | null;
  clientSignatureUrl: string | null;
}

/** Map the untyped Perfex service-report + task objects into the typed model. */
export function toServiceReportPdfData(sr: any, task: any): ServiceReportPdfData {
  const isDone = (v: unknown) => v === "1" || v === 1 || v === true || v === "true";
  return {
    reportId: String(sr?._id ?? ""),
    task: {
      name: task?.name ?? "",
      id: task?.id ?? "",
      project: task?.project_data?.name ?? null,
      client: task?.client_name ?? null,
    },
    caregiver: sr?.staff_name || (sr?.staff_id ? `Staff #${sr.staff_id}` : "—"),
    submittedAt: sr?.time_taken ?? null,
    questionnaire: Array.isArray(sr?.questionnaire)
      ? sr.questionnaire.map((q: any) => ({ question: String(q?.question ?? ""), answer: String(q?.answer ?? "—") }))
      : [],
    checklist: Array.isArray(sr?.checklist_items)
      ? sr.checklist_items.map((it: any) => ({ label: String(it?.description ?? ""), done: isDone(it?.finished) }))
      : [],
    notes: sr?.note ?? "",
    staffSignatureUrl: sr?.staff_signature?.url ?? null,
    clientSignatureUrl: sr?.customer_signature?.url ?? null,
  };
}

// ── Composition + entry point ────────────────────────────────────────────────
/** Build and download a clinical Service Report PDF from typed data. */
export async function downloadServiceReportPdf(data: ServiceReportPdfData): Promise<void> {
  const shortId = data.reportId.slice(-6);
  const doc = new ReportPdf();

  doc.header("Service Report", "Pristine Health — Staffing Need Fulfillment", `SR #${shortId}`);

  doc.keyValues([
    ["Task", `${data.task.name || "—"}  (#${data.task.id ?? "—"})`],
    ["Project", data.task.project || "—"],
    ["Client", data.task.client || "—"],
    ["Caregiver", data.caregiver || "—"],
    ["Submitted", data.submittedAt ? new Date(data.submittedAt).toLocaleString() : "—"],
  ]);

  if (data.questionnaire.length) {
    doc.sectionTitle("Clinical Q&A");
    data.questionnaire.forEach((q, i) => doc.qaRow(`${i + 1}. ${q.question}`, q.answer || "—"));
  }

  if (data.checklist.length) {
    doc.sectionTitle("Checklist at Submission");
    data.checklist.forEach((c) => doc.checkItem(c.label, c.done));
  }

  doc.sectionTitle("Caregiver Notes");
  doc.paragraph(data.notes || "No notes provided.");

  const [staffSig, clientSig] = await Promise.all([
    data.staffSignatureUrl ? loadImageAsDataUrl(data.staffSignatureUrl) : Promise.resolve(null),
    data.clientSignatureUrl ? loadImageAsDataUrl(data.clientSignatureUrl) : Promise.resolve(null),
  ]);
  if (staffSig || clientSig) {
    doc.sectionTitle("Signatures").reserve(32);
    doc.signature("Staff Signature", staffSig, doc.margin);
    doc.signature("Client Signature", clientSig, doc.margin + 74);
    doc.gap(30);
  }

  doc.footer(`Generated ${new Date().toLocaleString()}`);
  doc.save(`Service_Report_${shortId}.pdf`);
}
