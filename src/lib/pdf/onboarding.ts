import { ReportPdf } from "./pdfBuilder";

/**
 * Onboarding Response → PDF (candidate, questionnaire, and the admin-recorded
 * answers). Mirrors src/lib/pdf/application.ts, built on the shared `ReportPdf`.
 *
 *  - `OnboardingPdfData`        — typed input the generator renders.
 *  - `toOnboardingPdfData()`    — maps the raw response + form → typed data.
 *  - `downloadOnboardingPdf()`  — composes and saves the document.
 */

export interface OnboardingPdfData {
  responseId: string;
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  questionnaireName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  responses: Array<{ label: string; value: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
};

/** Map the raw onboarding response + its questionnaire form → typed model. */
export function toOnboardingPdfData(response: any, form: any): OnboardingPdfData {
  const answers: Record<string, any> = response?.answers ?? {};

  const responses = (Array.isArray(form?.customFields) ? form.customFields : []).map((field: any) => {
    const raw = answers[field?.name];
    let value: string;
    if (Array.isArray(raw)) value = raw.length ? raw.join(", ") : "No answer provided";
    else if (raw === undefined || raw === null || raw === "") value = "No answer provided";
    else if (field?.type === "file" && typeof raw === "string" && raw.startsWith("http")) value = raw;
    else value = String(raw);
    return { label: String(field?.label ?? field?.name ?? ""), value };
  });

  return {
    responseId: String(response?._id ?? ""),
    applicantName: String(response?.applicantName ?? "—"),
    applicantEmail: String(response?.applicantEmail ?? "—"),
    jobTitle: String(response?.jobTitle ?? "—"),
    questionnaireName: String(form?.name ?? "Onboarding Questionnaire"),
    status: STATUS_LABELS[String(response?.status)] ?? String(response?.status ?? "—"),
    startedAt: response?.createdAt ?? null,
    completedAt: response?.completedAt ?? null,
    responses,
  };
}

/** Build and download an Onboarding PDF from typed data. */
export function downloadOnboardingPdf(data: OnboardingPdfData): void {
  const shortId = data.responseId.slice(-6);
  const doc = new ReportPdf();

  doc.header("Onboarding", "Pristine Health — Careers", `ONB #${shortId}`);

  doc.keyValues([
    ["Candidate", data.applicantName || "—"],
    ["Email", data.applicantEmail || "—"],
    ["Position", data.jobTitle || "—"],
    ["Questionnaire", data.questionnaireName || "—"],
    ["Status", data.status || "—"],
    ["Started", data.startedAt ? new Date(data.startedAt).toLocaleString() : "—"],
    ["Completed", data.completedAt ? new Date(data.completedAt).toLocaleString() : "—"],
  ]);

  if (data.responses.length) {
    doc.sectionTitle("Onboarding Responses");
    data.responses.forEach((r) => doc.field(r.label, r.value));
  }

  doc.footer(`Generated ${new Date().toLocaleString()}`);
  doc.save(`Onboarding_${shortId}.pdf`);
}
