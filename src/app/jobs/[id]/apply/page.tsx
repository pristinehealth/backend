"use client";

import { useState, useEffect, useRef, use, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Briefcase, FileText, Loader2, ArrowLeft, Lock,
    AlertCircle, CheckCircle2, Moon, Sun, Upload, Trash2, Eye,
    Home, X, Download, MapPin
} from "lucide-react";
import type { DocumentType } from "@/models/ApplicationDocument";
import { getDocumentLabel, getDefaultApplicationDocuments, DOCUMENT_METADATA, requiresFileUpload, sanitizeMetadataValue, metadataValueError, metadataInputProps } from "@/lib/documentMetadata";
import { resolveFieldType } from "@/lib/formFields";
import { formatLocation } from "@/lib/usStates";

interface DocumentRequirement {
    documentType: DocumentType;
    required: boolean;
    // Provided by the catalog-driven server response (optional for legacy shapes).
    label?: string;
    requiresFile?: boolean;
    storageMode?: 'file' | 'metadata_only';
    requiresExpiry?: boolean;
}

interface CustomField {
    name: string;
    label: string;
    type: 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';
    required: boolean;
    options?: string[];
    section?: string;
}

interface JobSection {
    label: string;
    content: string;
}

interface JobPosition {
    _id: string;
    title: string;
    location?: string | null;
    city?: string | null;
    sections: JobSection[];
    status: 'open' | 'closed';
    customFields: CustomField[];
    requiredDocuments?: DocumentType[];
    documentRequirements?: DocumentRequirement[];
    applicationForm?: {
        requiredDocuments?: DocumentType[];
        documentRequirements?: DocumentRequirement[];
    };
    createdAt: string;
}

export default function JobApplyPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);

    const [job, setJob] = useState<JobPosition | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState("");

    // Form inputs for applying
    const [applicantName, setApplicantName] = useState("");
    const [applicantEmail, setApplicantEmail] = useState("");
    const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    // Tracks which "Other (specify)" selects are in free-text mode.
    const [otherMode, setOtherMode] = useState<Record<string, boolean>>({});
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const formCardRef = useRef<HTMLDivElement>(null);

    // Scroll the form back into view when the wizard step changes.
    useEffect(() => {
        formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [wizardStep]);
    const [formError, setFormError] = useState("");

    // Custom field file upload states
    const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
    const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
    const [uploadedFileNames, setUploadedFileNames] = useState<Record<string, string>>({});
    const [uploadedFieldPublicIds, setUploadedFieldPublicIds] = useState<Record<string, string>>({});

    // File open in the in-page preview modal (keeps the storage URL out of a
    // separate tab / the address bar).
    const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

    const [clientSessionId] = useState(() => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    });

    // Preview a not-yet-submitted upload through our session-scoped proxy rather
    // than the raw Cloudinary URL.
    const openPreview = (publicId: string | undefined, name: string) => {
        if (!publicId) return;
        const url = `/api/upload/preview?publicId=${encodeURIComponent(publicId)}&clientSessionId=${encodeURIComponent(clientSessionId)}`;
        setViewerFile({ url, name });
    };

    // Close the file preview on Escape.
    useEffect(() => {
        if (!viewerFile) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerFile(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [viewerFile]);

    const [templateDocumentRequirements, setTemplateDocumentRequirements] = useState<DocumentRequirement[]>(
        getDefaultApplicationDocuments().map((documentType) => ({
            documentType,
            required: !!DOCUMENT_METADATA[documentType]?.mandatory,
        }))
    );
    const [selectedDocuments, setSelectedDocuments] = useState<DocumentType[]>(getDefaultApplicationDocuments());
    const [documentUploads, setDocumentUploads] = useState<Record<string, { fileUrl?: string; fileName?: string; publicId?: string; value?: string; expiryDate?: string; deliveryMethod?: 'upload' | 'email' }>>({});
    const [uploadingDocuments, setUploadingDocuments] = useState<Record<string, boolean>>({});
    const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});

    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    // Initialize theme and load job details
    useEffect(() => {
        const isDark = document.documentElement.classList.contains('dark');
        setTheme(isDark ? 'dark' : 'light');
        fetchJobDetails();
    }, [id]);

    const hasFirstLastNameFields = !!job?.customFields?.some(field => field.name === 'first_name')
        && !!job?.customFields?.some(field => field.name === 'last_name');
    const requiredTemplateDocuments = templateDocumentRequirements.filter((item) => item.required).map((item) => item.documentType);

    // Whether a document is collected as a file upload vs a typed value
    // (metadata-only). Prefer the server requirement's flags (correct for custom
    // requirement keys); fall back to the static catalog for built-in types.
    const docRequiresFile = (documentType: DocumentType) => {
        const requirement = templateDocumentRequirements.find((item) => item.documentType === documentType);
        if (typeof requirement?.requiresFile === 'boolean') return requirement.requiresFile;
        if (requirement?.storageMode) return requirement.storageMode !== 'metadata_only';
        return requiresFileUpload(documentType);
    };

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.theme = nextTheme;
        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    // Handles files dynamic upload to Cloudinary via /api/upload for custom questionnaire fields
    const handleFileUpload = async (fieldName: string, file: File | null) => {
        if (!file) return;

        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE_BYTES) {
            setUploadErrors(prev => ({ ...prev, [fieldName]: "File size exceeds 10MB limit." }));
            return;
        }

        const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.txt'];
        const filename = file.name.toLowerCase();
        const isValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
        if (!isValidExtension) {
            setUploadErrors(prev => ({ ...prev, [fieldName]: "Invalid format. Upload PDF, Word Doc, image, or text." }));
            return;
        }

        setUploadErrors(prev => ({ ...prev, [fieldName]: "" }));
        setUploadingFields(prev => ({ ...prev, [fieldName]: true }));

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('source', 'job_apply');
            formData.append('usageType', 'custom_field');
            formData.append('jobId', id);
            formData.append('fieldKey', fieldName);
            formData.append('clientSessionId', clientSessionId);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                // Store the publicId reference (not a storage URL); the server
                // resolves it to a real URL at submit time.
                setCustomAnswers(prev => ({ ...prev, [fieldName]: data.public_id }));
                setUploadedFileNames(prev => ({ ...prev, [fieldName]: file.name }));
                if (typeof data.public_id === 'string' && data.public_id) {
                    setUploadedFieldPublicIds(prev => ({ ...prev, [fieldName]: data.public_id }));
                }
            } else {
                setUploadErrors(prev => ({ ...prev, [fieldName]: data.error || "Failed to upload file." }));
            }
        } catch (err: any) {
            console.error("File upload error:", err);
            setUploadErrors(prev => ({ ...prev, [fieldName]: "Connection issue during document upload." }));
        } finally {
            setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleRemoveFile = (fieldName: string) => {
        setCustomAnswers(prev => {
            const updated = { ...prev };
            delete updated[fieldName];
            return updated;
        });
        setUploadedFileNames(prev => {
            const updated = { ...prev };
            delete updated[fieldName];
            return updated;
        });
        setUploadedFieldPublicIds(prev => {
            const updated = { ...prev };
            delete updated[fieldName];
            return updated;
        });
        setUploadErrors(prev => ({ ...prev, [fieldName]: "" }));
    };

    const fetchJobDetails = async () => {
        setIsLoading(true);
        setPageError("");
        try {
            const res = await fetch(`/api/jobs/${id}`);
            const data = await res.json();
            if (res.ok) {
                setJob(data);
                // Documents are resolved from the compliance catalog server-side
                // (data.documentRequirements), each carrying label + requiresFile.
                const configuredRequirements = Array.isArray(data.documentRequirements)
                    ? data.documentRequirements
                    : Array.isArray(data.requiredDocuments)
                        ? data.requiredDocuments.map((documentType: DocumentType) => ({ documentType, required: true }))
                        : getDefaultApplicationDocuments().map((documentType) => ({
                            documentType,
                            required: !!DOCUMENT_METADATA[documentType]?.mandatory,
                        }));
                // Keep every requirement the catalog collects at application time —
                // both file uploads and metadata-only docs (e.g. State ID), which
                // ask the applicant to type a value rather than attach a file.
                setTemplateDocumentRequirements(configuredRequirements);
                setSelectedDocuments(configuredRequirements.map((item: DocumentRequirement) => item.documentType));
            } else {
                setPageError(data.error || "Failed to load job details.");
            }
        } catch (err) {
            console.error("Error fetching job details:", err);
            setPageError("Connection error while loading job info.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDocumentToggle = (documentType: DocumentType) => {
        setSelectedDocuments(prev => {
            if (prev.includes(documentType)) {
                return prev.filter(item => item !== documentType);
            }
            return [...prev, documentType];
        });
    };

    // Handles files dynamic upload to Cloudinary via /api/upload
    const handleDocumentUpload = async (documentType: DocumentType, file: File | null) => {
        if (!file) return;

        // Local checks
        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE_BYTES) {
            setDocumentErrors(prev => ({ ...prev, [documentType]: "File size exceeds 10MB limit." }));
            return;
        }

        const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.txt'];
        const filename = file.name.toLowerCase();
        const isValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
        if (!isValidExtension) {
            setDocumentErrors(prev => ({ ...prev, [documentType]: "Invalid format. Upload PDF, Word Doc, image, or text." }));
            return;
        }

        // Reset errors and mark field as uploading
        setDocumentErrors(prev => ({ ...prev, [documentType]: "" }));
        setUploadingDocuments(prev => ({ ...prev, [documentType]: true }));

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('source', 'job_apply');
            formData.append('usageType', 'supporting_document');
            formData.append('jobId', id);
            formData.append('documentType', documentType);
            formData.append('clientSessionId', clientSessionId);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                setDocumentUploads(prev => ({
                    ...prev,
                    [documentType]: {
                        ...prev[documentType],
                        // publicId reference stands in for the file; presence
                        // checks stay truthy and the server resolves it on submit.
                        fileUrl: data.public_id,
                        fileName: file.name,
                        publicId: data.public_id,
                        deliveryMethod: 'upload',
                    }
                }));
            } else {
                setDocumentErrors(prev => ({ ...prev, [documentType]: data.error || "Failed to upload file." }));
            }
        } catch (err: any) {
            console.error("File upload error:", err);
            setDocumentErrors(prev => ({ ...prev, [documentType]: "Connection issue during document upload." }));
        } finally {
            setUploadingDocuments(prev => ({ ...prev, [documentType]: false }));
        }
    };

    const handleRemoveDocumentFile = (documentType: DocumentType) => {
        setDocumentUploads(prev => {
            const updated = { ...prev };
            delete updated[documentType];
            return updated;
        });
        setDocumentErrors(prev => ({ ...prev, [documentType]: "" }));
    };

    // Metadata-only documents (State ID, SSN, work authorization…) are collected
    // as a typed value rather than a file. Delivery is 'email' by convention (no
    // stored file); the admin sets the expiry during review.
    const handleDocumentValueChange = (documentType: DocumentType, value: string) => {
        const clean = sanitizeMetadataValue(documentType, value);
        setDocumentUploads(prev => ({
            ...prev,
            [documentType]: {
                ...prev[documentType],
                value: clean,
                deliveryMethod: 'email',
            },
        }));
        if (clean.trim()) {
            setDocumentErrors(prev => ({ ...prev, [documentType]: "" }));
        }
    };

    const handleRemoveDocument = (documentType: DocumentType) => {
        if (requiredTemplateDocuments.includes(documentType)) {
            return;
        }
        handleRemoveDocumentFile(documentType);
        setSelectedDocuments(prev => prev.filter(item => item !== documentType));
    };

    const handleFieldChange = (name: string, value: any) => {
        setCustomAnswers(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleApplySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!job) return;

        setFormError("");
        setIsSubmitting(true);

        // Verification validation: check required custom fields
        if (job.customFields) {
            for (const field of job.customFields) {
                if (field.required) {
                    const ans = customAnswers[field.name];
                    const empty = ans === undefined || ans === null || ans === "" || (Array.isArray(ans) && ans.length === 0);
                    if (empty) {
                        setFormError(`Please complete all required fields. "${field.label}" is missing.`);
                        setIsSubmitting(false);
                        return;
                    }
                }
            }
        }

        // Mandatory Privacy Policy + Terms of Service agreement.
        if (!agreedToTerms) {
            setFormError("Please agree to the Privacy Policy and Terms of Service to continue.");
            setIsSubmitting(false);
            return;
        }

        // Validate required template documents
        for (const documentType of requiredTemplateDocuments) {
            if (!selectedDocuments.includes(documentType)) {
                setFormError(`Please include the required ${getDocumentLabel(documentType)} document.`);
                setIsSubmitting(false);
                return;
            }

            const upload = documentUploads[documentType];

            // Metadata-only docs collect a typed value instead of a file.
            if (!docRequiresFile(documentType)) {
                if (!upload?.value?.trim()) {
                    setFormError(`Please enter the required ${getDocumentLabel(documentType)}.`);
                    setIsSubmitting(false);
                    return;
                }
                const fmtError = metadataValueError(documentType, upload.value);
                if (fmtError) {
                    setFormError(fmtError);
                    setIsSubmitting(false);
                    return;
                }
                continue;
            }

            if (!upload?.fileUrl || !upload?.fileName) {
                setFormError(`Please upload the required ${getDocumentLabel(documentType)} document.`);
                setIsSubmitting(false);
                return;
            }
        }

        // Validate selected optional document uploads. Optional metadata-only docs
        // may be left blank; only file docs must be uploaded once shown.
        for (const documentType of selectedDocuments) {
            if (requiredTemplateDocuments.includes(documentType)) {
                continue;
            }
            const upload = documentUploads[documentType];

            if (!docRequiresFile(documentType)) {
                // Optional metadata value: allowed blank, but if given must be valid.
                const fmtError = upload?.value ? metadataValueError(documentType, upload.value) : null;
                if (fmtError) {
                    setFormError(fmtError);
                    setIsSubmitting(false);
                    return;
                }
                continue;
            }

            if (!upload?.fileUrl || !upload?.fileName) {
                setFormError(`Please upload the ${getDocumentLabel(documentType)} document or remove it from the form.`);
                setIsSubmitting(false);
                return;
            }
        }

        try {
            const derivedApplicantName = hasFirstLastNameFields
                ? [customAnswers.first_name, customAnswers.last_name].filter(Boolean).join(' ').trim()
                : applicantName;

            const uploadedPublicIds = [
                ...Object.values(uploadedFieldPublicIds),
                ...Object.values(documentUploads)
                    .map((upload) => upload.publicId)
                    .filter((value): value is string => typeof value === 'string' && value.length > 0),
            ];

            const res = await fetch(`/api/jobs/${job._id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicantName: derivedApplicantName,
                    applicantEmail,
                    customFieldValues: customAnswers,
                    agreedToTerms,
                    uploadedPublicIds,
                    documents: selectedDocuments.map((documentType) => ({
                        documentType,
                        fileUrl: documentUploads[documentType]?.fileUrl,
                        fileName: documentUploads[documentType]?.fileName,
                        value: documentUploads[documentType]?.value || '',
                        expiryDate: documentUploads[documentType]?.expiryDate || null,
                        deliveryMethod: documentUploads[documentType]?.deliveryMethod || (docRequiresFile(documentType) ? 'upload' : 'email'),
                    }))
                })
            });

            const data = await res.json();
            if (res.ok) {
                setSubmitSuccess(true);
                // Reset form values
                setApplicantName("");
                setApplicantEmail("");
                setCustomAnswers({});
                setUploadedFieldPublicIds({});
                setDocumentUploads({});
                setSelectedDocuments(templateDocumentRequirements.map((item) => item.documentType));
            } else {
                const errorMessage = typeof data?.error === 'string' ? data.error : "Failed to submit job application.";
                setFormError(errorMessage);
            }
        } catch (err) {
            console.error(err);
            setFormError("Server error encountered. Please try submitting again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <Loader2 className="h-10 w-10 text-brand-primary animate-spin" />
            </div>
        );
    }

    if (pageError || !job) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
                <AlertCircle className="h-12 w-12 text-rose-500 mb-4" />
                <h2 className="text-xl font-bold text-text-primary mb-2">Job Opening Unavailable</h2>
                <p className="text-sm text-text-muted mb-6 text-center max-w-sm">
                    {pageError || "The requested job position could not be found or has closed."}
                </p>
                <Link 
                    href="/jobs" 
                    className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all"
                >
                    Back to Careers Page
                </Link>
            </div>
        );
    }

    // ---- Form sections + live completion (wizard) ---------------------------
    // Questions are grouped by their admin-assigned `section` (set in the form
    // builder). Legacy fields without a section fall back to a name heuristic so
    // existing forms still split sensibly. Steps follow first-appearance order.
    const isFieldFilled = (field: CustomField) => {
        const v = customAnswers[field.name];
        if (field.type === 'checkbox') return Array.isArray(v) && v.length > 0;
        return v !== undefined && v !== null && String(v).trim() !== '';
    };
    const LEGACY_PERSONAL = ['first_name', 'last_name', 'birth_date', 'phone', 'address', 'city', 'state', 'zip', 'country'];
    const LEGACY_EMPLOYMENT = ['profession', 'employment_type', 'earliest_start_date', 'nursing_license_number'];
    const sectionOf = (f: CustomField) =>
        (f.section && f.section.trim()) ||
        (LEGACY_PERSONAL.includes(f.name) ? 'Personal details' : LEGACY_EMPLOYMENT.includes(f.name) ? 'Employment details' : 'Application questions');

    const allCustomFields = job.customFields || [];
    const questionSectionOrder: string[] = [];
    const fieldsBySection = new Map<string, CustomField[]>();
    for (const f of allCustomFields) {
        const s = sectionOf(f);
        if (!fieldsBySection.has(s)) { fieldsBySection.set(s, []); questionSectionOrder.push(s); }
        fieldsBySection.get(s)!.push(f);
    }
    // Email + name always need a home; if the form defines no questions, keep one
    // "Personal details" step so contact info still has a place.
    if (questionSectionOrder.length === 0) {
        questionSectionOrder.push('Personal details');
        fieldsBySection.set('Personal details', []);
    }
    const orderedCustomFields = questionSectionOrder.flatMap((s) => fieldsBySection.get(s) || []);
    const firstSectionLabel = questionSectionOrder[0];
    const firstStepId = `q:${firstSectionLabel}`;

    const groupComplete = (fields: CustomField[]) => fields.filter((f) => f.required).every(isFieldFilled);
    const fileDocumentTypes = selectedDocuments.filter((dt) => docRequiresFile(dt));
    const metadataDocumentTypes = selectedDocuments.filter((dt) => !docRequiresFile(dt));
    // The documents step is "complete" once every required file has an upload and
    // every required metadata-only doc has a typed value.
    const requiredFileDocs = templateDocumentRequirements.filter((r) => r.required && docRequiresFile(r.documentType));
    const requiredMetadataDocs = templateDocumentRequirements.filter((r) => r.required && !docRequiresFile(r.documentType));
    const documentsComplete =
        requiredFileDocs.every((r) => !!documentUploads[r.documentType]?.fileUrl) &&
        requiredMetadataDocs.every((r) => !!documentUploads[r.documentType]?.value?.trim());
    const contactComplete = !!applicantEmail.trim() && (hasFirstLastNameFields || !!applicantName.trim());

    // One step per question section (in form order), then documents (if any), then review.
    const questionSteps = questionSectionOrder.map((label) => ({
        id: `q:${label}`,
        label,
        // The first step also holds email/name, so it needs contact info complete.
        complete: groupComplete(fieldsBySection.get(label) || []) && (label === firstSectionLabel ? contactComplete : true),
        show: true,
    }));
    const firstStepComplete = questionSteps[0]?.complete ?? false;
    const progressSections = [
        ...questionSteps,
        { id: 'documents', label: 'Supporting documents', complete: documentsComplete, show: fileDocumentTypes.length + metadataDocumentTypes.length > 0 },
        { id: 'review', label: 'Review & submit', complete: agreedToTerms, show: true },
    ].filter((s) => s.show);
    const completedCount = progressSections.filter((s) => s.complete).length;

    // Wizard: render one step at a time. safeStep clamps if the step list shrinks.
    const safeStep = Math.max(0, Math.min(wizardStep, progressSections.length - 1));
    const currentSection = progressSections[safeStep];
    const currentId = currentSection?.id;
    const isLastStep = safeStep === progressSections.length - 1;
    const goNext = () => setWizardStep(Math.min(safeStep + 1, progressSections.length - 1));
    const goBack = () => setWizardStep(Math.max(safeStep - 1, 0));

    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden overflow-y-auto flex flex-col font-sans transition-colors duration-300">
            
            {/* Ambient background glows */}
            <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-primary-muted rounded-full blur-[150px] pointer-events-none opacity-45"></div>
            <div className="absolute bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-brand-accent-muted rounded-full blur-[130px] pointer-events-none opacity-30"></div>

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

            {/* Header */}
            <header className="relative border-b border-sidebar-border backdrop-blur-md bg-sidebar-bg/85 py-4.5 z-10 shrink-0">
                <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <img src="/logo.png" alt="Pristine Health Logo" className="h-10 w-auto brightness-110 dark:brightness-100" />
                        <span className="font-extrabold text-lg text-text-primary tracking-tight border-l border-sidebar-border pl-2.5">Careers</span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {/* Dark mode switcher */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.05] transition-all"
                            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        >
                            {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5 text-indigo-500" />}
                        </button>

                        <Link 
                            href="/jobs" 
                            className="text-xs font-bold text-text-secondary hover:text-white transition-colors border border-sidebar-border bg-white/[0.03] hover:bg-white/[0.06] px-4 py-2 rounded-xl"
                        >
                            Back to Jobs
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Application Container */}
            <main className="relative flex-1 max-w-4xl w-full mx-auto px-4 py-12 pb-20 z-10 space-y-8 animate-fade-up">
                
                {/* Back Link */}
                <button
                    onClick={() => router.push("/jobs")}
                    className="flex items-center gap-1.5 text-sm font-bold text-text-secondary hover:text-text-primary transition-all"
                >
                    <ArrowLeft className="h-4.5 w-4.5" /> Back to open career listings
                </button>

                {/* Job Summary Hero */}
                <div className="bg-surface-card backdrop-blur-sm border border-border-card rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-primary text-white text-xs font-bold uppercase tracking-wider">
                                <Briefcase className="h-3.5 w-3.5" /> Application
                            </span>
                            <h1 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight leading-tight">
                                {job.title}
                            </h1>
                            {formatLocation(job.city, job.location) && (
                                <p className="flex items-center gap-1.5 text-sm font-bold text-brand-primary">
                                    <MapPin className="h-4 w-4" /> {formatLocation(job.city, job.location)}
                                </p>
                            )}
                            <p className="text-sm md:text-base text-text-secondary font-medium max-w-2xl">
                                Complete the form below to apply for this role. Your answers, documents, and access code will be sent to the hiring team.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary-muted px-4 py-3 text-right min-w-[220px]">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-primary">Application summary</p>
                            <p className="mt-1 text-sm font-bold text-text-primary">Review the full job details on the previous page if needed.</p>
                            <button
                                type="button"
                                onClick={() => router.push(`/jobs/${job._id}`)}
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-dark transition-colors"
                            >
                                Back to job details <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Submit Application Form Card */}
                <div ref={formCardRef} className="scroll-mt-20 bg-surface-card border border-border-card rounded-3xl p-6 md:p-8 shadow-md">
                    
                    {/* Section progress rail — checks off each section as it's completed */}
                    <div className="border-b border-sidebar-border dark:border-white/[0.06] pb-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest">Your application</h3>
                            <span className="text-[11px] font-bold text-text-muted">{completedCount} / {progressSections.length} sections complete</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {progressSections.map((s, i) => {
                                const isCurrent = i === safeStep;
                                return (
                                <button
                                    type="button"
                                    key={s.id}
                                    onClick={() => setWizardStep(i)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                                        s.complete
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                            : isCurrent
                                                ? 'bg-brand-primary-muted text-brand-primary border-brand-primary/40'
                                                : 'bg-surface-card text-text-secondary border-border-card hover:border-brand-primary/40'
                                    } ${isCurrent ? 'ring-2 ring-brand-primary/25' : ''}`}
                                >
                                    {s.complete ? (
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                    ) : (
                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-40" />
                                    )}
                                    {s.label}
                                </button>
                                );
                            })}
                        </div>
                    </div>

                    {formError && (
                        <div className="text-rose-400 border border-rose-500/20 bg-rose-500/10 p-3.5 rounded-xl flex items-center gap-2.5 text-sm font-semibold mb-6">
                            <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                            {formError}
                        </div>
                    )}

                    <form
                        onSubmit={handleApplySubmit}
                        noValidate
                        onKeyDown={(e) => {
                            // Don't let Enter submit the form mid-wizard (only on the last step).
                            if (e.key === 'Enter' && !isLastStep && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                                e.preventDefault();
                            }
                        }}
                        className="space-y-6"
                    >
                        {/* Step: first section (email + name + that section's questions) */}
                        <div className={currentId === firstStepId ? 'space-y-6' : 'hidden'}>
                        <div className="scroll-mt-24">
                            <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest inline-flex items-center gap-2 mb-4">
                                {firstSectionLabel}
                                {firstStepComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!hasFirstLastNameFields && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={applicantName}
                                        onChange={e => setApplicantName(e.target.value)}
                                        placeholder="Jane Doe"
                                        className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input placeholder-placeholder-input focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 outline-none transition-all"
                                    />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={applicantEmail}
                                    onChange={e => setApplicantEmail(e.target.value)}
                                    placeholder="jane.doe@example.com"
                                    className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input placeholder-placeholder-input focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 outline-none transition-all"
                                />
                            </div>
                        </div>

                        {hasFirstLastNameFields && (
                            <p className="text-[11px] text-text-muted dark:text-slate-300">
                                Full name is captured from the First Name and Last Name fields in this form template.
                            </p>
                        )}
                        </div>
                        {/* End step: Personal details */}

                        {/* Dynamic Form Builder Fields */}
                        {orderedCustomFields.length > 0 && (
                            <div className="space-y-6">
                                {orderedCustomFields.map((field, __i) => {
                                    const __sec = sectionOf(field);
                                    const ftype = resolveFieldType(field);
                                    // First-section fields sit under the header above; every other
                                    // section gets an inline heading at the start of its group.
                                    const __showHeader = __sec !== firstSectionLabel && (__i === 0 || sectionOf(orderedCustomFields[__i - 1]) !== __sec);
                                    return (
                                    <Fragment key={field.name}>
                                    <div className={`q:${__sec}` === currentId ? 'space-y-6' : 'hidden'}>
                                        {__showHeader && (
                                            <div className="scroll-mt-24 border-t border-sidebar-border dark:border-white/[0.06] pt-6">
                                                <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest">{__sec}</h3>
                                            </div>
                                        )}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">
                                            {field.label} {field.required && <span className="text-rose-500 font-bold">*</span>}
                                        </label>

                                        {ftype === 'text' && (
                                            <input
                                                type="text"
                                                required={field.required}
                                                value={customAnswers[field.name] || ""}
                                                onChange={e => handleFieldChange(field.name, e.target.value)}
                                                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                            />
                                        )}

                                        {ftype === 'date' && (
                                            <input
                                                type="date"
                                                required={field.required}
                                                value={customAnswers[field.name] || ""}
                                                onChange={e => handleFieldChange(field.name, e.target.value)}
                                                // Open the native picker on a click anywhere in the field, not just the calendar icon.
                                                onClick={e => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                                                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                            />
                                        )}

                                        {field.type === 'paragraph' && (
                                            <textarea
                                                required={field.required}
                                                rows={4}
                                                value={customAnswers[field.name] || ""}
                                                onChange={e => handleFieldChange(field.name, e.target.value)}
                                                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                            />
                                        )}

                                        {field.type === 'number' && (
                                            <input
                                                type="number"
                                                required={field.required}
                                                value={customAnswers[field.name] || ""}
                                                onChange={e => handleFieldChange(field.name, e.target.value)}
                                                className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                            />
                                        )}

                                        {field.type === 'select' && (() => {
                                            const options = field.options || [];
                                            const hasOther = options.some(o => /^other\b/i.test(o.trim()));
                                            const listedOptions = options.filter(o => !/^other\b/i.test(o.trim()));
                                            const val = customAnswers[field.name] || "";
                                            // In "other" mode if explicitly toggled, or the stored value isn't a listed option.
                                            const inOther = hasOther && (otherMode[field.name] || (val !== "" && !listedOptions.includes(val)));
                                            const selectValue = inOther ? "__other__" : val;
                                            return (
                                                <div className="space-y-2">
                                                    <select
                                                        required={field.required && !inOther}
                                                        value={selectValue}
                                                        onChange={e => {
                                                            if (e.target.value === "__other__") {
                                                                setOtherMode(m => ({ ...m, [field.name]: true }));
                                                                handleFieldChange(field.name, "");
                                                            } else {
                                                                setOtherMode(m => ({ ...m, [field.name]: false }));
                                                                handleFieldChange(field.name, e.target.value);
                                                            }
                                                        }}
                                                        className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                                    >
                                                        <option value="">Select an option...</option>
                                                        {listedOptions.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                        {hasOther && <option value="__other__">Other (specify)…</option>}
                                                    </select>
                                                    {inOther && (
                                                        <input
                                                            type="text"
                                                            required={field.required}
                                                            value={val}
                                                            onChange={e => handleFieldChange(field.name, e.target.value)}
                                                            placeholder="Please specify"
                                                            className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {field.type === 'checkbox' && (
                                            <div className="space-y-2 mt-2 bg-surface-card p-4 rounded-xl border border-border-card">
                                                {field.options?.map(opt => {
                                                    const currentArr = Array.isArray(customAnswers[field.name]) ? customAnswers[field.name] : [];
                                                    return (
                                                        <div key={opt} className="flex items-center gap-2.5">
                                                            <input
                                                                type="checkbox"
                                                                id={`${field.name}-${opt}`}
                                                                checked={currentArr.includes(opt)}
                                                                onChange={e => {
                                                                    const nextArr = e.target.checked 
                                                                        ? [...currentArr, opt]
                                                                        : currentArr.filter((o: string) => o !== opt);
                                                                    handleFieldChange(field.name, nextArr);
                                                                }}
                                                                className="h-4 w-4 text-brand-primary bg-white dark:bg-black border-border-input dark:border-white/10 rounded focus:ring-brand-primary focus:ring-offset-background"
                                                            />
                                                            <label htmlFor={`${field.name}-${opt}`} className="text-xs text-text-secondary font-semibold">{opt}</label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {field.type === 'file' && (
                                            <div className="space-y-2">
                                                {customAnswers[field.name] ? (
                                                    <div className="flex items-center justify-between bg-surface-card border border-border-card rounded-xl p-3 shadow-sm">
                                                        <div className="flex items-center gap-2.5">
                                                            <FileText className="h-5 w-5 text-brand-primary shrink-0" />
                                                            <div>
                                                                <p className="text-xs font-bold text-text-primary max-w-[280px] md:max-w-[400px] truncate">
                                                                    {uploadedFileNames[field.name] || "Document Uploaded"}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openPreview(uploadedFieldPublicIds[field.name], uploadedFileNames[field.name] || 'Uploaded file')}
                                                                    className="text-[10px] text-brand-primary hover:underline font-semibold flex items-center gap-0.5"
                                                                >
                                                                    <Eye className="h-3 w-3" /> View Uploaded File
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFile(field.name)}
                                                            className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-transparent hover:border-rose-500/20 transition-all flex items-center gap-1"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" /> Remove
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <input
                                                            type="file"
                                                            id={`file-${field.name}`}
                                                            className="hidden"
                                                            disabled={uploadingFields[field.name]}
                                                            onChange={e => handleFileUpload(field.name, e.target.files?.[0] || null)}
                                                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                                                        />
                                                        <label
                                                            htmlFor={`file-${field.name}`}
                                                            className={`w-full flex flex-col items-center justify-center border border-dashed rounded-xl p-8 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors ${
                                                                uploadingFields[field.name] 
                                                                    ? "border-brand-primary/45 opacity-70 pointer-events-none" 
                                                                    : "border-border-input dark:border-white/15 hover:border-brand-primary/40"
                                                            }`}
                                                        >
                                                            {uploadingFields[field.name] ? (
                                                                <div className="flex flex-col items-center gap-2">
                                                                    <Loader2 className="h-5 w-5 text-brand-primary animate-spin" />
                                                                    <span className="text-xs text-text-secondary font-semibold">Uploading to Cloudinary...</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <Upload className="h-6 w-6 text-text-muted mb-1" />
                                                                    <span className="text-xs text-text-primary font-bold">Upload Resume / Document</span>
                                                                    <span className="text-[10px] text-text-secondary">PDF, Word Document, or Image (Max 10MB)</span>
                                                                </div>
                                                            )}
                                                        </label>
                                                    </div>
                                                )}

                                                {uploadErrors[field.name] && (
                                                    <p className="text-xs text-rose-500 dark:text-rose-400 font-semibold">{uploadErrors[field.name]}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    </div>
                                    </Fragment>
                                    );
                                })}
                            </div>
                        )}

                        {/* Default document uploads */}
                        <div id="anchor-documents" className={currentId === 'documents' ? 'scroll-mt-24 space-y-4' : 'hidden'}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest inline-flex items-center gap-2">
                                        Supporting Documents
                                        {documentsComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                    </h3>
                                    <p className="text-xs text-text-muted mt-1">
                                        Upload files where required, and enter the requested details for documents we only record a reference for (e.g. State ID). You can remove any optional item that is not ready yet. Reverification expiry is set by admin during review.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {fileDocumentTypes.map((documentType) => {
                                    const metadata = DOCUMENT_METADATA[documentType];
                                    const upload = documentUploads[documentType];
                                    const requirement = templateDocumentRequirements.find((item) => item.documentType === documentType);
                                    const isRequired = !!requirement?.required;
                                    return (
                                        <div key={documentType} className="bg-surface-card border border-border-card rounded-2xl p-4 space-y-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-sm font-bold text-text-primary">{requirement?.label || metadata?.label || documentType}</h4>
                                                        {isRequired && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider">
                                                                Required
                                                            </span>
                                                        )}
                                                        {!isRequired && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-text-secondary border border-border-card uppercase tracking-wider">
                                                                Optional
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-text-muted mt-1">{metadata?.description || ""}</p>
                                                </div>
                                                {!isRequired && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDocument(documentType)}
                                                        className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-transparent hover:border-rose-500/20 transition-all"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>

                                            {upload?.fileUrl ? (
                                                <div className="flex items-center justify-between bg-surface-card border border-border-card rounded-xl p-3 gap-4">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-text-primary truncate">{upload.fileName}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => openPreview(upload.publicId, upload.fileName || 'Uploaded file')}
                                                            className="text-[10px] text-brand-primary hover:underline font-semibold inline-flex items-center gap-1"
                                                        >
                                                            <Eye className="h-3 w-3" /> View file
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDocumentFile(documentType)}
                                                        className="shrink-0 text-xs font-bold text-text-secondary hover:text-rose-500 transition-colors"
                                                    >
                                                        Clear file
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <input
                                                        type="file"
                                                        id={`doc-${documentType}`}
                                                        className="hidden"
                                                        disabled={uploadingDocuments[documentType]}
                                                        onChange={e => handleDocumentUpload(documentType, e.target.files?.[0] || null)}
                                                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                                                    />
                                                    <label
                                                        htmlFor={`doc-${documentType}`}
                                                        className={`w-full flex flex-col items-center justify-center border border-dashed rounded-xl p-6 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors ${
                                                            uploadingDocuments[documentType]
                                                                ? "border-brand-primary/45 opacity-70 pointer-events-none"
                                                                : "border-border-input dark:border-white/15 hover:border-brand-primary/40"
                                                        }`}
                                                    >
                                                        {uploadingDocuments[documentType] ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <Loader2 className="h-5 w-5 text-brand-primary animate-spin" />
                                                                <span className="text-xs text-text-secondary font-semibold">Uploading to Cloudinary...</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-1.5 text-center">
                                                                <Upload className="h-6 w-6 text-text-muted mb-1" />
                                                                <span className="text-xs text-text-primary font-bold">Upload {requirement?.label || metadata?.label || documentType}</span>
                                                                <span className="text-[10px] text-text-secondary">PDF, Word Document, or Image (Max 10MB)</span>
                                                            </div>
                                                        )}
                                                    </label>
                                                </div>
                                            )}

                                            {documentErrors[documentType] && (
                                                <p className="text-xs text-rose-500 dark:text-rose-400 font-semibold">{documentErrors[documentType]}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Metadata-only documents: collect a typed value (e.g. a
                                State ID / driving-license number) instead of a file. */}
                            {metadataDocumentTypes.length > 0 && (
                                <div className="space-y-4">
                                    {metadataDocumentTypes.map((documentType) => {
                                        const metadata = DOCUMENT_METADATA[documentType];
                                        const requirement = templateDocumentRequirements.find((item) => item.documentType === documentType);
                                        const isRequired = !!requirement?.required;
                                        const label = requirement?.label || metadata?.label || documentType;
                                        const value = documentUploads[documentType]?.value || "";
                                        return (
                                            <div key={documentType} className="bg-surface-card border border-border-card rounded-2xl p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="text-sm font-bold text-text-primary">{label}</h4>
                                                            {isRequired ? (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider">
                                                                    Required
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-text-secondary border border-border-card uppercase tracking-wider">
                                                                    Optional
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
                                                                No file needed
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-text-muted mt-1">{metadata?.description || "We only record this value — no document is uploaded or stored."}</p>
                                                    </div>
                                                    {!isRequired && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveDocument(documentType)}
                                                            className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-transparent hover:border-rose-500/20 transition-all"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label htmlFor={`docval-${documentType}`} className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                                        {label} {isRequired && <span className="text-rose-500 font-bold">*</span>}
                                                    </label>
                                                    <input
                                                        id={`docval-${documentType}`}
                                                        type="text"
                                                        value={value}
                                                        onChange={(e) => handleDocumentValueChange(documentType, e.target.value)}
                                                        placeholder={metadataInputProps(documentType).placeholder || `Enter ${label}`}
                                                        inputMode={metadataInputProps(documentType).inputMode}
                                                        maxLength={metadataInputProps(documentType).maxLength}
                                                        className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input placeholder-placeholder-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all"
                                                    />
                                                </div>

                                                {documentErrors[documentType] && (
                                                    <p className="text-xs text-rose-500 dark:text-rose-400 font-semibold">{documentErrors[documentType]}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {templateDocumentRequirements
                                .filter((item) => !item.required)
                                .some((item) => !selectedDocuments.includes(item.documentType)) && (
                                <div className="bg-surface-card border border-border-card rounded-2xl p-4 space-y-3">
                                    <div>
                                        <h4 className="text-xs font-black uppercase text-text-secondary tracking-widest">Add back removed documents</h4>
                                        <p className="text-[11px] text-text-muted mt-1">You can re-add optional template documents you removed.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {templateDocumentRequirements
                                            .filter((item) => !item.required)
                                            .map((item) => item.documentType)
                                            .filter(documentType => !selectedDocuments.includes(documentType))
                                            .map(documentType => (
                                                <button
                                                    key={documentType}
                                                    type="button"
                                                    onClick={() => handleDocumentToggle(documentType)}
                                                    className="text-xs font-bold px-3 py-2 rounded-xl bg-surface-card border border-border-card text-text-secondary hover:text-white hover:bg-brand-primary transition-all"
                                                >
                                                    + {getDocumentLabel(documentType)}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Step: Review & submit */}
                        <div className={currentId === 'review' ? '' : 'hidden'}>
                            <div id="anchor-review" className="scroll-mt-24">
                                <h3 className="text-sm font-black uppercase text-brand-primary tracking-widest inline-flex items-center gap-2 mb-4">
                                    Review &amp; submit
                                    {agreedToTerms && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                </h3>
                            </div>

                            {/* Mandatory Privacy Policy + Terms of Service agreement */}
                            <div className="rounded-xl border border-border-card bg-surface-card p-4">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={agreedToTerms}
                                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary bg-white dark:bg-black border-border-input dark:border-white/10 rounded focus:ring-brand-primary"
                                    />
                                    <span className="text-xs text-text-secondary leading-relaxed">
                                        I have read and agree to Pristine Health’s{" "}
                                        <a href="/privacy" target="_blank" rel="noreferrer" className="text-brand-primary font-bold hover:underline">Privacy Policy</a>{" "}
                                        and{" "}
                                        <a href="/terms" target="_blank" rel="noreferrer" className="text-brand-primary font-bold hover:underline">Terms of Service</a>.
                                        <span className="text-rose-500 font-bold"> *</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Wizard navigation */}
                        <div className="flex items-center justify-between gap-3 pt-6 border-t border-sidebar-border dark:border-white/[0.06]">
                            <button
                                type="button"
                                onClick={goBack}
                                disabled={safeStep === 0}
                                className="inline-flex items-center gap-1.5 text-sm font-bold text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl border border-border-card transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" /> Back
                            </button>

                            {!isLastStep ? (
                                <button
                                    type="button"
                                    onClick={goNext}
                                    className="inline-flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm px-8 py-2.5 rounded-xl shadow-lg shadow-brand-primary/20 active:scale-[0.98] transition-all"
                                >
                                    Next <ArrowLeft className="h-4 w-4 rotate-180" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !agreedToTerms}
                                    title={!agreedToTerms ? "Agree to the Privacy Policy and Terms of Service to continue" : undefined}
                                    className="bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-8 py-3 rounded-xl shadow-lg shadow-brand-primary/20 active:scale-[0.98] transition-all flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                                        </>
                                    ) : "Submit Application"}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </main>

            {/* Modal: Application Submission Success */}
            {submitSuccess && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-3xl w-full max-w-md p-6 text-center shadow-2xl relative">
                        <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
                        </div>

                        <h2 className="text-lg font-black text-text-primary tracking-tight">Application Submitted Successfully!</h2>
                        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                            Thank you for applying. When you want to track your application, enter your email and we will send a one-time verification code.
                        </p>

                        <p className="text-xs text-text-muted mb-6 leading-relaxed mt-2">
                            No permanent tracking code is stored on your side anymore.
                        </p>

                        <button
                            onClick={() => { setSubmitSuccess(false); router.push("/jobs/track"); }}
                            className="w-full bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-lg shadow-brand-primary/25 active:scale-95"
                        >
                            Go to secure tracking
                        </button>
                    </div>
                </div>
            )}

            {/* In-page file viewer — streams the upload via our proxy so the raw
                storage URL never opens in a separate tab / the address bar. */}
            {viewerFile && (() => {
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
                                    <a href={viewerFile.url} download className="p-2 rounded-lg text-text-secondary hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors" title="Download">
                                        <Download className="h-4 w-4" />
                                    </a>
                                    <button type="button" onClick={() => setViewerFile(null)} className="p-2 rounded-lg text-text-secondary hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors" title="Close">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 bg-slate-100 dark:bg-black/40 overflow-auto flex items-center justify-center">
                                {isImage ? (
                                    <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain" />
                                ) : (
                                    <iframe src={viewerFile.url} title={viewerFile.name} className="w-full h-full border-0" />
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
