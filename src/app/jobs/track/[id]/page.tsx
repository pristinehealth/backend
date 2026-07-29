"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PublicHeader } from "@/components/PublicHeader";
import { DOCUMENT_METADATA, getDefaultApplicationDocuments, getDocumentLabel, requiresFileUpload, sanitizeMetadataValue, metadataInputProps } from "@/lib/documentMetadata";
import { resolveFieldType, toDateInputValue } from "@/lib/formFields";
import type { DocumentType } from "@/models/ApplicationDocument";

interface DocumentRequirement {
  documentType: DocumentType;
  required: boolean;
  requiresFile?: boolean; // configured evidenceMode; authoritative over the static default
}

interface CustomField {
  name: string;
  label: string;
  type: 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';
  required: boolean;
  options?: string[];
  section?: string;
}

// Same section grouping the apply form uses, so the submitted-data summary reads
// with the identical section headings (Personal details, Employment details, …).
const TRACK_LEGACY_PERSONAL = ['first_name', 'last_name', 'birth_date', 'phone', 'address', 'city', 'state', 'zip', 'country'];
const TRACK_LEGACY_EMPLOYMENT = ['profession', 'employment_type', 'earliest_start_date', 'nursing_license_number'];
function trackSectionOf(f: CustomField): string {
  return (f.section && f.section.trim())
    || (TRACK_LEGACY_PERSONAL.includes(f.name)
      ? 'Personal details'
      : TRACK_LEGACY_EMPLOYMENT.includes(f.name)
        ? 'Employment details'
        : 'Application questions');
}

interface ApplicationDocument {
  _id: string;
  documentType: DocumentType;
  deliveryMethod: 'upload' | 'email';
  fileName: string;
  fileUrl: string;
  value?: string; // typed value for metadata-only requirements
  expiryDate?: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  uploadedAt: string;
  rejectionReason?: string;
}

interface TrackPayload {
  application: {
    _id: string;
    applicantName: string;
    applicantEmail: string;
    customFieldValues: Record<string, any>;
    status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested';
    notes: Array<{ author: string; text: string; createdAt: string }>;
    createdAt: string;
    updatedAt: string;
  };
  job: {
    _id?: string;
    title: string;
    status: string;
  };
  form: {
    name: string;
    customFields: CustomField[];
    documentRequirements: DocumentRequirement[];
  };
  documents: ApplicationDocument[];
  canEdit: boolean;
}

export default function TrackApplicationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = use(params);

  const email = searchParams.get('email') || '';
  const accessToken = searchParams.get('token') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pageError, setPageError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [payload, setPayload] = useState<TrackPayload | null>(null);
  const [showSubmittedData, setShowSubmittedData] = useState(true);
  // Each form section is collapsed by default; expand on click.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [resources, setResources] = useState<Array<{ _id: string; title: string; description: string; fileName: string; downloadRef: string }>>([]);

  const [applicantName, setApplicantName] = useState('');
  const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentType[]>([]);
  const [documentUploads, setDocumentUploads] = useState<Record<string, { fileUrl?: string; fileName?: string; publicId?: string; value?: string; deliveryMethod?: 'upload' | 'email' }>>({});
  const [uploadingDocuments, setUploadingDocuments] = useState<Record<string, boolean>>({});
  const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});
  const [uploadedFieldPublicIds, setUploadedFieldPublicIds] = useState<Record<string, string>>({});
  const [uploadedFileNames, setUploadedFileNames] = useState<Record<string, string>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  // File currently open in the in-page viewer modal (keeps the storage URL out
  // of the address bar / a separate tab).
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

  const [clientSessionId] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  });

  // Open a submitted/edited file in the viewer. Existing files are same-origin
  // proxy refs (used as-is); a freshly uploaded file is a publicId reference,
  // previewed through the session-scoped upload proxy. Neither exposes a storage URL.
  const openStoredFile = (ref: string | undefined, name: string) => {
    if (!ref) return;
    const url = ref.startsWith('/api/')
      ? ref
      : `/api/upload/preview?publicId=${encodeURIComponent(ref)}&clientSessionId=${encodeURIComponent(clientSessionId)}`;
    setViewerFile({ url, name });
  };

  useEffect(() => {
    if (!email || !accessToken) {
      setPageError('Missing tracking credentials. Please verify again from the track page.');
      setIsLoading(false);
      return;
    }

    void fetchDetails();

    // Downloadable forms library (best-effort — same access credentials).
    (async () => {
      try {
        const cred = new URLSearchParams({ email, accessToken }).toString();
        const rr = await fetch(`/api/onboarding/resources?${cred}`);
        const rd = await rr.json();
        if (rr.ok) setResources(Array.isArray(rd.resources) ? rd.resources : []);
      } catch { /* ignore */ }
    })();
  }, [id, email, accessToken]);

  // Close the file viewer on Escape.
  useEffect(() => {
    if (!viewerFile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerFile(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerFile]);

  const fetchDetails = async () => {
    setIsLoading(true);
    setPageError('');

    try {
      const res = await fetch(`/api/applications/track/${id}?email=${encodeURIComponent(email)}&accessToken=${encodeURIComponent(accessToken)}`);
      const data = await res.json();

      if (!res.ok) {
        setPageError(data.error || 'Unable to load application details.');
        return;
      }

      setPayload(data);
      setApplicantName(data.application.applicantName || '');
      setCustomAnswers(data.application.customFieldValues || {});

      const requirements: DocumentRequirement[] = Array.isArray(data.form?.documentRequirements)
        ? data.form.documentRequirements
        : getDefaultApplicationDocuments().map((documentType) => ({
            documentType,
            required: !!DOCUMENT_METADATA[documentType]?.mandatory,
          }));

      // Both file AND metadata-only requirements are shown now — file docs get an
      // upload box, metadata-only docs get a typed input (e.g. State ID, SSN).
      const applicantVisibleRequirements = requirements;

      const existingDocTypes = (Array.isArray(data.documents) ? data.documents : [])
        .map((doc: ApplicationDocument) => doc.documentType);
      const initialSelected = Array.from(new Set([...applicantVisibleRequirements.map((item) => item.documentType), ...existingDocTypes]));
      setSelectedDocuments(initialSelected);

      setDocumentUploads(
        Object.fromEntries(
          (Array.isArray(data.documents) ? data.documents : [])
            .map((doc: ApplicationDocument) => [
            doc.documentType,
            {
              fileUrl: doc.fileUrl,
              fileName: doc.fileName,
              value: doc.value || '',
              deliveryMethod: doc.deliveryMethod,
            },
          ])
        )
      );
    } catch (error) {
      console.error(error);
      setPageError('Unable to load application details.');
    } finally {
      setIsLoading(false);
    }
  };

  const documentRequirements = payload?.form?.documentRequirements || [];
  const requiredDocuments = useMemo(
    () => documentRequirements.filter((item) => item.required).map((item) => item.documentType),
    [documentRequirements]
  );

  // Group submitted-data fields by their form section (in first-appearance
  // order), so the summary mirrors the application form's sections.
  const groupedCustomFields = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, CustomField[]>();
    for (const f of (payload?.form?.customFields || [])) {
      const s = trackSectionOf(f);
      if (!bySection.has(s)) { bySection.set(s, []); order.push(s); }
      bySection.get(s)!.push(f);
    }
    return order.map((s) => [s, bySection.get(s)!] as [string, CustomField[]]);
  }, [payload?.form?.customFields]);

  // Whether a requirement collects a file vs a typed value — the requirement's
  // configured evidenceMode wins over the static DOCUMENT_METADATA default (which
  // can disagree, e.g. work_authorization defaults to metadata but an admin can
  // require a file). Falls back to the static map for anything not in the catalog.
  const docRequiresFile = (documentType: DocumentType) => {
    const requirement = documentRequirements.find((item) => item.documentType === documentType);
    if (typeof requirement?.requiresFile === 'boolean') return requirement.requiresFile;
    return requiresFileUpload(documentType);
  };

  const canEdit = !!payload?.canEdit;

  const handleDocumentToggle = (documentType: DocumentType) => {
    if (requiredDocuments.includes(documentType)) return;

    setSelectedDocuments((prev) => {
      if (prev.includes(documentType)) {
        return prev.filter((item) => item !== documentType);
      }
      return [...prev, documentType];
    });
  };

  // Typed value for a metadata-only requirement (State ID, SSN, …). Sanitized on
  // input the same way the apply form does.
  const handleDocumentValueChange = (documentType: DocumentType, raw: string) => {
    const clean = sanitizeMetadataValue(documentType, raw);
    setDocumentUploads((prev) => ({
      ...prev,
      [documentType]: { ...prev[documentType], value: clean },
    }));
  };

  const handleDocumentUpload = async (documentType: DocumentType, file: File | null) => {
    if (!file) return;

    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setDocumentErrors((prev) => ({ ...prev, [documentType]: 'File size exceeds 10MB limit.' }));
      return;
    }

    const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.txt'];
    if (!allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setDocumentErrors((prev) => ({ ...prev, [documentType]: 'Invalid format. Upload PDF, Word Doc, image, or text.' }));
      return;
    }

    setDocumentErrors((prev) => ({ ...prev, [documentType]: '' }));
    setUploadingDocuments((prev) => ({ ...prev, [documentType]: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'job_track_edit');
      formData.append('usageType', 'supporting_document');
      formData.append('jobId', payload?.job?._id || 'unknown');
      formData.append('documentType', documentType);
      formData.append('clientSessionId', clientSessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok) {
        setDocumentUploads((prev) => ({
          ...prev,
          [documentType]: {
            // publicId reference (not a storage URL); the server resolves it on save.
            fileUrl: data.public_id,
            fileName: file.name,
            publicId: data.public_id,
            deliveryMethod: 'upload',
          },
        }));
      } else {
        setDocumentErrors((prev) => ({ ...prev, [documentType]: data.error || 'Upload failed.' }));
      }
    } catch (error) {
      console.error(error);
      setDocumentErrors((prev) => ({ ...prev, [documentType]: 'Connection issue during upload.' }));
    } finally {
      setUploadingDocuments((prev) => ({ ...prev, [documentType]: false }));
    }
  };

  const handleFileUpload = async (fieldName: string, file: File | null) => {
    if (!file) return;

    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setUploadErrors((prev) => ({ ...prev, [fieldName]: 'File size exceeds 10MB limit.' }));
      return;
    }

    setUploadErrors((prev) => ({ ...prev, [fieldName]: '' }));
    setUploadingFields((prev) => ({ ...prev, [fieldName]: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'job_track_edit');
      formData.append('usageType', 'custom_field');
      formData.append('jobId', payload?.job?._id || 'unknown');
      formData.append('fieldKey', fieldName);
      formData.append('clientSessionId', clientSessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok) {
        // Store the publicId reference (not a storage URL); resolved on save.
        setCustomAnswers((prev) => ({ ...prev, [fieldName]: data.public_id }));
        setUploadedFileNames((prev) => ({ ...prev, [fieldName]: file.name }));
        if (typeof data.public_id === 'string' && data.public_id) {
          setUploadedFieldPublicIds((prev) => ({ ...prev, [fieldName]: data.public_id }));
        }
      } else {
        setUploadErrors((prev) => ({ ...prev, [fieldName]: data.error || 'Failed to upload file.' }));
      }
    } catch (error) {
      console.error(error);
      setUploadErrors((prev) => ({ ...prev, [fieldName]: 'Connection issue during upload.' }));
    } finally {
      setUploadingFields((prev) => ({ ...prev, [fieldName]: false }));
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payload || !canEdit) return;

    setIsSaving(true);
    setSaveMessage('');
    setPageError('');

    try {
      const uploadedPublicIds = [
        ...Object.values(uploadedFieldPublicIds),
        ...Object.values(documentUploads)
          .map((item) => item.publicId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ];

      const documents = selectedDocuments.map((documentType) => ({
        documentType,
        fileUrl: documentUploads[documentType]?.fileUrl,
        fileName: documentUploads[documentType]?.fileName,
        value: documentUploads[documentType]?.value || '',
        deliveryMethod:
          documentUploads[documentType]?.deliveryMethod ||
          (docRequiresFile(documentType) ? 'upload' : 'email'),
      }));

      const res = await fetch(`/api/applications/track/${payload.application._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          accessToken,
          applicantName,
          customFieldValues: customAnswers,
          documents,
          uploadedPublicIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPageError(data.error || 'Unable to save updates.');
        return;
      }

      setSaveMessage('Application updated successfully. Status moved back to pending review.');
      await fetchDetails();
    } catch (error) {
      console.error(error);
      setPageError('Unable to save updates.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApplication = async () => {
    if (!payload || isDeleting) return;

    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setPageError('');

    try {
      const res = await fetch(
        `/api/applications/track/${payload.application._id}?email=${encodeURIComponent(email)}&accessToken=${encodeURIComponent(accessToken)}`,
        { method: 'DELETE' }
      );

      const data = await res.json();
      if (!res.ok) {
        setPageError(data.error || 'Unable to delete application.');
        return;
      }

      router.push(`/jobs/track?email=${encodeURIComponent(email)}&token=${encodeURIComponent(accessToken)}`);
    } catch (error) {
      console.error(error);
      setPageError('Unable to delete application.');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusClass = (status: TrackPayload['application']['status']) => {
    if (status === 'accepted') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (status === 'rejected') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (status === 'shortlisted') return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
    if (status === 'reviewed') return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
    if (status === 'changes_requested') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-surface-card border border-border-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-rose-500">
            <AlertCircle className="h-5 w-5" />
            <p className="font-bold">Unable to load application</p>
          </div>
          <p className="text-sm text-text-secondary">{pageError || 'The application could not be loaded.'}</p>
          <Link href="/jobs/track" className="inline-flex items-center gap-2 text-xs font-bold text-brand-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to track page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PublicHeader label="Application" />

      {/* Branded hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: "url('/healthcare_professionals_diversity.png')", backgroundSize: 'cover', backgroundPosition: 'center 25%' }} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-950/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/20" />
        <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 py-14 sm:py-20 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-brand-primary mb-3">Application details</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">{payload.job.title}</h1>
            <p className="text-sm text-white/70 mt-2">Submitted {new Date(payload.application.createdAt).toLocaleString()}</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold border uppercase ${statusClass(payload.application.status)}`}>
            {payload.application.status.replace('_', ' ')}
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-brand-primary via-brand-primary to-brand-accent" />
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
        {pageError && (<div className="mb-4 p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{pageError}</div>)}
        {saveMessage && (<div className="mb-4 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{saveMessage}</div>)}
        {!canEdit && (<div className="mb-4 p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-sm flex items-center gap-2"><Lock className="h-4 w-4" /> This application is read-only until our team requests changes.</div>)}

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8 items-start">
          {/* Main content — all sections visible, as on the application form */}
          <div className="space-y-6">
            <section className="bg-surface-card border border-border-card rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">Applicant profile</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Full name</label>
                  <input
                    type="text"
                    value={applicantName}
                    disabled={!canEdit}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="mt-1 w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</label>
                  <input
                    type="email"
                    value={payload.application.applicantEmail}
                    disabled
                    className="mt-1 w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input opacity-70"
                  />
                </div>
              </div>
            </section>

            <section className="bg-surface-card border border-border-card rounded-2xl p-6 shadow-sm space-y-4">
              <button type="button" onClick={() => setShowSubmittedData((v) => !v)} className="w-full flex items-center justify-between gap-2 group">
                <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">Submitted data</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-text-muted group-hover:text-text-primary">
                  {showSubmittedData ? 'Hide' : 'Show'}
                  {showSubmittedData ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {showSubmittedData && (payload.form.customFields.length === 0 ? (
                <p className="text-sm text-text-secondary">No additional form questions were configured for this position.</p>
              ) : (
                <div className="space-y-8">
                  {groupedCustomFields.map(([sectionName, fields], sIdx) => (
                  <div key={sectionName} className="space-y-4">
                    <div className={sIdx === 0 ? '' : 'border-t border-sidebar-border dark:border-white/[0.06] pt-6'}>
                      <button
                        type="button"
                        onClick={() => setOpenSections((p) => ({ ...p, [sectionName]: !p[sectionName] }))}
                        className="w-full flex items-center justify-between gap-2 group"
                      >
                        <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest">{sectionName}</h3>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-text-muted group-hover:text-text-primary">
                          {openSections[sectionName] ? 'Hide' : `Show (${fields.length})`}
                          {openSections[sectionName] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </button>
                    </div>
                  {openSections[sectionName] && (<>
                  {fields.map((field) => {
                    const ftype = resolveFieldType(field);
                    return (
                    <div key={field.name} className="space-y-2">
                      <label className="text-xs font-bold text-text-secondary">
                        {field.label}
                        {field.required && <span className="text-rose-500 ml-1">*</span>}
                      </label>

                      {ftype === 'text' && (
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={customAnswers[field.name] || ''}
                          onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70"
                        />
                      )}

                      {ftype === 'date' && (
                        <input
                          type="date"
                          disabled={!canEdit}
                          value={toDateInputValue(customAnswers[field.name])}
                          onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          // Open the native picker on a click anywhere in the field, not just the calendar icon.
                          onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                          className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                        />
                      )}

                      {field.type === 'paragraph' && (
                        <textarea
                          rows={4}
                          disabled={!canEdit}
                          value={customAnswers[field.name] || ''}
                          onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70"
                        />
                      )}

                      {field.type === 'number' && (
                        <input
                          type="number"
                          disabled={!canEdit}
                          value={customAnswers[field.name] || ''}
                          onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70"
                        />
                      )}

                      {field.type === 'select' && (
                        <select
                          disabled={!canEdit}
                          value={customAnswers[field.name] || ''}
                          onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none disabled:opacity-70"
                        >
                          <option value="">Select...</option>
                          {field.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      )}

                      {field.type === 'checkbox' && (
                        <div className="space-y-2 border border-border-card rounded-xl p-3 bg-surface-card">
                          {field.options?.map((option) => {
                            const selected = Array.isArray(customAnswers[field.name]) ? customAnswers[field.name] : [];
                            return (
                              <label key={option} className="flex items-center gap-2 text-sm text-text-secondary">
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  checked={selected.includes(option)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selected, option]
                                      : selected.filter((item: string) => item !== option);
                                    setCustomAnswers((prev) => ({ ...prev, [field.name]: next }));
                                  }}
                                />
                                {option}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {field.type === 'file' && (
                        <div className="space-y-2">
                          {customAnswers[field.name] ? (
                            <div className="flex items-center justify-between gap-3 border border-border-card rounded-xl p-3 bg-surface-card">
                              <div>
                                <p className="text-sm font-semibold text-text-primary truncate max-w-[360px]">{uploadedFileNames[field.name] || 'Uploaded file'}</p>
                                <button
                                  type="button"
                                  onClick={() => openStoredFile(customAnswers[field.name], uploadedFileNames[field.name] || 'Uploaded file')}
                                  className="text-xs font-semibold text-brand-primary inline-flex items-center gap-1"
                                >
                                  <Eye className="h-3 w-3" /> View file
                                </button>
                              </div>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setCustomAnswers((prev) => ({ ...prev, [field.name]: '' }))}
                                  className="text-xs font-bold text-brand-primary"
                                >
                                  Update
                                </button>
                              )}
                            </div>
                          ) : canEdit ? (
                            <div>
                              <input
                                type="file"
                                id={`cf-${field.name}`}
                                className="hidden"
                                disabled={uploadingFields[field.name]}
                                onChange={(e) => handleFileUpload(field.name, e.target.files?.[0] || null)}
                                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                              />
                              <label htmlFor={`cf-${field.name}`} className="w-full flex flex-col items-center justify-center border border-dashed border-border-input rounded-xl p-6 cursor-pointer">
                                {uploadingFields[field.name] ? (
                                  <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                                ) : (
                                  <>
                                    <Upload className="h-5 w-5 text-text-muted" />
                                    <span className="text-xs text-text-secondary mt-1">Upload file</span>
                                  </>
                                )}
                              </label>
                            </div>
                          ) : (
                            <p className="text-xs text-text-secondary">No file uploaded.</p>
                          )}

                          {uploadErrors[field.name] && (
                            <p className="text-xs text-rose-500">{uploadErrors[field.name]}</p>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  </>)}
                  </div>
                  ))}
                </div>
              ))}
            </section>

            <section className="bg-surface-card border border-border-card rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">Submitted documents</h2>

              <div className="space-y-4">
                {documentRequirements.map((rule) => {
                  const metadata = DOCUMENT_METADATA[rule.documentType];
                  const upload = documentUploads[rule.documentType];
                  const included = selectedDocuments.includes(rule.documentType);
                  const submittedDoc = payload.documents.find((doc) => doc.documentType === rule.documentType);
                  const isFileDoc = docRequiresFile(rule.documentType);

                  const statusClasses: Record<ApplicationDocument['status'], string> = {
                    pending: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
                    verified: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                    rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
                    expired: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                  };

                  const isRejected = submittedDoc?.status === 'rejected';
                  return (
                    <div key={rule.documentType} className={`border rounded-xl p-4 space-y-3 ${isRejected ? 'border-rose-500/40 bg-rose-500/[0.06] ring-1 ring-rose-500/20' : 'border-border-card bg-surface-card'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-text-primary">{getDocumentLabel(rule.documentType)}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${rule.required ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-white/5 text-text-secondary border-border-card'}`}>
                              {rule.required ? 'Required' : 'Optional'}
                            </span>
                            {submittedDoc?.status && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${statusClasses[submittedDoc.status]}`}>
                                {submittedDoc.status}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted mt-1">{metadata?.description}</p>
                          {isRejected && (
                            <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                              <p className="text-[11px] font-black uppercase tracking-wide text-rose-500">Rejected — please re-upload</p>
                              {submittedDoc?.rejectionReason && <p className="text-xs text-rose-500 mt-0.5">Reason: {submittedDoc.rejectionReason}</p>}
                            </div>
                          )}
                        </div>

                        {!rule.required && canEdit && (
                          <button
                            type="button"
                            onClick={() => handleDocumentToggle(rule.documentType)}
                            className="text-xs font-bold text-rose-500"
                          >
                            {included ? 'Remove' : 'Add'}
                          </button>
                        )}
                      </div>

                      {!included ? (
                        <p className="text-xs text-text-muted">Removed from this submission.</p>
                      ) : !isFileDoc ? (
                        // Metadata-only requirement: a typed value (e.g. State ID,
                        // SSN). Editable once the admin requests changes; otherwise
                        // read-only so the applicant can still see what's now needed.
                        canEdit ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={upload?.value || ''}
                              onChange={(e) => handleDocumentValueChange(rule.documentType, e.target.value)}
                              placeholder={metadataInputProps(rule.documentType).placeholder || `Enter ${getDocumentLabel(rule.documentType)}`}
                              inputMode={metadataInputProps(rule.documentType).inputMode}
                              maxLength={metadataInputProps(rule.documentType).maxLength}
                              className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50"
                            />
                          </div>
                        ) : upload?.value ? (
                          <p className="text-sm text-text-primary">Provided: <span className="font-semibold">{upload.value}</span></p>
                        ) : (
                          <p className="text-xs text-rose-500">Not provided yet.</p>
                        )
                      ) : upload?.fileUrl ? (
                        <div className="flex items-center justify-between border border-border-card rounded-xl p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{upload.fileName || 'Uploaded file'}</p>
                            <button
                              type="button"
                              onClick={() => openStoredFile(upload.fileUrl, upload.fileName || 'Uploaded file')}
                              className="text-xs font-semibold text-brand-primary inline-flex items-center gap-1"
                            >
                              <Eye className="h-3 w-3" /> View file
                            </button>
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setDocumentUploads((prev) => ({ ...prev, [rule.documentType]: { ...prev[rule.documentType], fileUrl: '', fileName: '' } }))}
                              className="text-xs font-bold text-brand-primary"
                            >
                              Update
                            </button>
                          )}
                        </div>
                      ) : canEdit ? (
                        <div>
                          <input
                            type="file"
                            id={`doc-${rule.documentType}`}
                            className="hidden"
                            disabled={uploadingDocuments[rule.documentType]}
                            onChange={(e) => handleDocumentUpload(rule.documentType, e.target.files?.[0] || null)}
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                          />
                          <label htmlFor={`doc-${rule.documentType}`} className="w-full flex flex-col items-center justify-center border border-dashed border-border-input rounded-xl p-6 cursor-pointer">
                            {uploadingDocuments[rule.documentType] ? (
                              <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                            ) : (
                              <>
                                <Upload className="h-5 w-5 text-text-muted" />
                                <span className="text-xs text-text-secondary mt-1">Upload {getDocumentLabel(rule.documentType)}</span>
                              </>
                            )}
                          </label>
                        </div>
                      ) : (
                        <p className="text-xs text-rose-500">No file uploaded.</p>
                      )}

                      {documentErrors[rule.documentType] && (
                        <p className="text-xs text-rose-500">{documentErrors[rule.documentType]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Sidebar — notes always visible, plus resources and actions. */}
          <aside className="lg:sticky lg:top-6 self-start space-y-5">
            <section className="bg-surface-card border border-border-card rounded-2xl p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Notes &amp; updates
              </h2>
              <p className="text-[11px] text-text-muted -mt-1">Messages from our review team, including any requested changes.</p>
              {(payload.application.notes || []).length > 0 ? (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {[...payload.application.notes].reverse().map((note, index) => (
                    <div key={`${note.createdAt}-${index}`} className="border border-border-card rounded-xl p-3 bg-surface-card/60">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-text-muted">
                        <span className="font-bold">{note.author}</span>
                        <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary">No updates from our team yet.</p>
              )}
            </section>

            {resources.length > 0 && (
              <section className="bg-surface-card border border-border-card rounded-2xl p-5 shadow-sm space-y-2.5">
                <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">Forms &amp; Resources</h2>
                {resources.map((f) => (
                  <a key={f._id} href={f.downloadRef} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 border border-border-card rounded-xl p-3 hover:border-brand-primary/40 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{f.title}</p>
                      {f.description && <p className="text-[11px] text-text-muted truncate">{f.description}</p>}
                    </div>
                    <span className="text-xs font-bold text-brand-primary inline-flex items-center gap-1 shrink-0"><Download className="h-3.5 w-3.5" /> Download</span>
                  </a>
                ))}
              </section>
            )}

            <div className="space-y-2.5">
              {canEdit && (
                <button type="submit" disabled={isSaving}
                  className="w-full bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save updates
                </button>
              )}
              <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}
                className="w-full border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 disabled:opacity-60 font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete application
              </button>
              <Link href="/jobs/track" className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to tracking
              </Link>
            </div>
          </aside>
        </form>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border-modal bg-surface-modal p-6 shadow-2xl text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
              <AlertCircle className="h-6 w-6 text-rose-500" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-text-primary">Delete this application?</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                This permanently removes your application and its uploaded documents. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-sidebar-border bg-slate-100 dark:bg-white/[0.05] py-2.5 text-xs font-bold text-text-secondary dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteApplication}
                className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all active:scale-95 inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-page file viewer — renders the submitted file in a modal so the raw
          storage URL never opens in the address bar / a separate tab. */}
      {viewerFile && (() => {
        const src = viewerFile.url || '';
        // The proxy URL carries no extension, so detect by the stored filename.
        // Images render in an <img>; everything else (PDF, etc.) in an <iframe>,
        // which relies on the correct content-type the proxy streams back.
        const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(viewerFile.name || '');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setViewerFile(null)}>
            <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-border-modal bg-surface-modal shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-sidebar-border">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-brand-primary shrink-0" />
                  <p className="text-sm font-bold text-text-primary truncate">{viewerFile.name}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={src} download className="p-2 rounded-lg text-text-secondary hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors" title="Download">
                    <Download className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={() => setViewerFile(null)} className="p-2 rounded-lg text-text-secondary hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors" title="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-black/40 overflow-auto flex items-center justify-center">
                {isImage ? (
                  <img src={src} alt={viewerFile.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <iframe src={src} title={viewerFile.name} className="w-full h-full border-0" />
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
