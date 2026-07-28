"use client";

import { useState, useEffect, useMemo } from "react";
import { useGetRequirementsQuery } from "@/lib/features/api/complianceApi";
import { 
    Briefcase, Plus, ToggleLeft, ToggleRight, Loader2, Eye, 
    Calendar, CheckCircle, XCircle, AlertCircle, FileText, User, 
    Mail, MessageSquare, Send, Check, Trash2, X, ListTodo, Info, HelpCircle, Edit, ClipboardList,
    ChevronLeft, ChevronRight, Download, MapPin, GripVertical, ChevronUp, ChevronDown
} from "lucide-react";
import { downloadApplicationPdf, toApplicationPdfData } from "@/lib/pdf/application";
import type { DocumentType } from "@/models/ApplicationDocument";
import { DOCUMENT_METADATA, getDefaultApplicationDocuments, getDocumentLabel, usesMetadataOnlyStorage } from "@/lib/documentMetadata";
import { LOCATION_OPTIONS, formatLocation } from "@/lib/usStates";

interface CustomField {
    name: string;
    label: string;
    type: 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';
    required: boolean;
    options?: string[];
    section?: string;
}

const DEFAULT_SECTION = 'Additional questions';
const SECTION_SUGGESTIONS = ['Personal details', 'Employment details', 'Additional questions'];

interface DocumentRequirement {
    documentType: DocumentType;
    required: boolean;
}

interface ApplicationForm {
    _id: string;
    name: string;
    customFields: CustomField[];
    requiredDocuments?: DocumentType[];
    documentRequirements?: DocumentRequirement[];
    createdAt: string;
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
    status: 'draft' | 'open' | 'closed';
    formId?: string;
    imageUrl?: string | null;
    imagePublicId?: string | null;
    createdAt: string;
    applicationCount?: number;
}

interface AdminNote {
    author: string;
    text: string;
    createdAt: string;
    _id: string;
}

interface JobApplication {
    _id: string;
    jobId: string;
    jobTitle?: string;
    applicantName: string;
    applicantEmail: string;
    customFieldValues: Record<string, any>;
    status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested';
    notes: AdminNote[];
    accessCode: string;
    createdAt: string;
    customFields?: CustomField[];
}

// Label + badge classes per application status (theme-token colors so the
// badges read correctly in both light and dark mode).
const APPLICATION_STATUS_META: Record<JobApplication['status'], { label: string; badge: string }> = {
    pending: { label: 'Pending', badge: 'bg-slate-500/10 text-slate-500 border-slate-500/25' },
    reviewed: { label: 'Reviewed', badge: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/25' },
    shortlisted: { label: 'Shortlisted', badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25' },
    changes_requested: { label: 'Changes requested', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' },
    accepted: { label: 'Accepted', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' },
    rejected: { label: 'Rejected', badge: 'bg-rose-500/10 text-rose-500 border-rose-500/25' },
};

interface ApplicationDocument {
    _id: string;
    documentType: DocumentType;
    deliveryMethod: 'upload' | 'email';
    fileName: string;
    fileUrl: string;
    value?: string;
    expiryDate?: string | null;
    status: 'pending' | 'verified' | 'rejected' | 'expired';
    uploadedAt: string;
    rejectionReason?: string;
}

// A live compliance requirement for this application (from the catalog), used to
// surface items the applicant hasn't submitted yet — including ones added after
// they applied. `requiresFile` is the configured evidenceMode (authoritative
// over the static DOCUMENT_METADATA default).
interface ApplicationRequirement {
    documentType: DocumentType;
    label: string;
    required: boolean;
    requiresFile: boolean;
}

// Standard candidate fields pre-populated for every new application form.
// (Email is captured separately as the application's applicantEmail; the actual
// license/ID *documents* are compliance requirements — these are just the typed
// numbers.) Admins can edit/remove any of these per form.
const DEFAULT_FORM_FIELDS: CustomField[] = [
    { name: 'first_name', label: 'First Name', type: 'text', required: true, section: 'Personal details' },
    { name: 'last_name', label: 'Last Name', type: 'text', required: true, section: 'Personal details' },
    { name: 'birth_date', label: 'Birth Date', type: 'date', required: true, section: 'Personal details' },
    { name: 'phone', label: 'Phone', type: 'text', required: true, section: 'Personal details' },
    { name: 'address', label: 'Address', type: 'text', required: true, section: 'Personal details' },
    { name: 'city', label: 'City', type: 'text', required: true, section: 'Personal details' },
    { name: 'state', label: 'State', type: 'text', required: true, section: 'Personal details' },
    { name: 'zip', label: 'Zip / Postal Code', type: 'text', required: true, section: 'Personal details' },
    { name: 'country', label: 'Country', type: 'text', required: true, section: 'Personal details' },
    {
        name: 'profession',
        label: 'Profession',
        type: 'select',
        required: true,
        section: 'Employment details',
        options: [
            'HCA / Caregiver',
            'CNA / Patient Care Technician',
            'Medical Technician',
            'LVN / LPN',
            'Registered Nurse',
            'Advanced Practice Registered Nurse',
            'Nurse Practitioner',
            'Other',
        ],
    },
    {
        name: 'employment_type',
        label: 'Preferred Employment Type',
        type: 'select',
        required: true,
        section: 'Employment details',
        options: [
            'Full-Time W-2 – Regular employees working a standard weekly schedule and eligible for applicable benefits.',
            'Part-Time W-2 – Employees working fewer hours than full-time, often on a recurring schedule.',
            'Per Diem / PRN W-2 – Employees who accept shifts as needed without guaranteed weekly hours.',
            'Temporary W-2 – Employees hired for a limited assignment, seasonal need, or defined period.',
            'Contract Assignment W-2 – Employees assigned to a specific facility, client, project, or contract for a set duration.',
            'Travel Contract W-2 – Healthcare professionals working temporary assignments outside their usual service area, potentially with travel or housing stipends.',
            'Temp-to-Hire – Workers initially placed on a temporary basis with the possibility of permanent employment.',
            'Independent Contractor / 1099 – Self-employed professionals engaged for defined services when the role legally qualifies for contractor classification.',
            'On-Call – Staff available to cover urgent, short-notice, weekend, overnight, or call-out shifts.',
            'Internship or Training Position – Individuals completing supervised educational or professional development assignments.',
        ],
    },
    {
        name: 'earliest_start_date',
        label: 'Earliest Start Date?',
        type: 'select',
        required: true,
        section: 'Employment details',
        options: ['Immediately', 'Within 2 weeks', 'Within 1 month', 'Other'],
    },
    // Nursing license *number* is an optional reference field; the license
    // *document* + expiry is the `practicing_license` compliance requirement.
    // Driver's License / ID is NOT a form field — it re-verifies on expiry, so
    // it lives entirely in compliance (the `state_id` requirement).
    { name: 'nursing_license_number', label: 'Nursing License Number', type: 'text', required: false, section: 'Employment details' },
];
// Privacy Policy / Terms of Service agreement is a built-in mandatory gate on
// the application page (see /jobs/[id]/apply), not a removable custom field.

const DEFAULT_DOCUMENT_REQUIREMENTS: DocumentRequirement[] = getDefaultApplicationDocuments().map((documentType) => ({
    documentType,
    required: !!DOCUMENT_METADATA[documentType]?.mandatory,
}));

const normalizeDocumentRequirements = (form?: Partial<ApplicationForm> | null): DocumentRequirement[] => {
    if (Array.isArray(form?.documentRequirements) && form.documentRequirements.length > 0) {
        return form.documentRequirements;
    }

    if (Array.isArray(form?.requiredDocuments) && form.requiredDocuments.length > 0) {
        return form.requiredDocuments.map((documentType) => ({ documentType, required: true }));
    }

    return DEFAULT_DOCUMENT_REQUIREMENTS;
};

const normalizeFieldKey = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

export function JobsTab() {
    const [subTab, setSubTab] = useState<'positions' | 'forms' | 'applications'>('positions');
    const [jobs, setJobs] = useState<JobPosition[]>([]);
    const [forms, setForms] = useState<ApplicationForm[]>([]);
    const [applications, setApplications] = useState<JobApplication[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Job pagination state
    const [jobsPage, setJobsPage] = useState(1);
    const [jobsTotal, setJobsTotal] = useState(0);
    const [jobStateFilter, setJobStateFilter] = useState("");
    const jobsLimit = 10;

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [showPublishModal, setShowPublishModal] = useState<JobPosition | null>(null);
    const [showEditModal, setShowEditModal] = useState<JobPosition | null>(null);
    const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
    const [selectedApplicationDocuments, setSelectedApplicationDocuments] = useState<ApplicationDocument[]>([]);
    const [selectedApplicationRequirements, setSelectedApplicationRequirements] = useState<ApplicationRequirement[]>([]);
    const [documentExpiryDrafts, setDocumentExpiryDrafts] = useState<Record<string, string>>({});
    const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null);
    const [isLoadingApplicationDocuments, setIsLoadingApplicationDocuments] = useState(false);
    const [applicationDocumentsError, setApplicationDocumentsError] = useState("");
    const [uploadingAdminDocumentType, setUploadingAdminDocumentType] = useState<DocumentType | null>(null);
    
    // Custom Confirm & Alert Dialog States
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: 'job' | 'form' | 'application'; message: string } | null>(null);
    const [customAlert, setCustomAlert] = useState<{ title: string; message: string } | null>(null);
    const [statusConfirm, setStatusConfirm] = useState<{ id: string; status: JobApplication['status']; label: string } | null>(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    // File open in the in-page viewer modal (streamed via the admin file proxy).
    const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

    // Open a stored file in the viewer, routed through the admin proxy so private
    // (authenticated) assets are signed server-side and public ones pass through.
    const openAdminFile = (fileUrl: string, name: string) => {
        setViewerFile({ url: `/api/admin/file?src=${encodeURIComponent(fileUrl)}`, name });
    };

    // New/Edit Job Form State
    const [newJobTitle, setNewJobTitle] = useState("");
    const [newJobLocation, setNewJobLocation] = useState("");
    const [newJobCity, setNewJobCity] = useState("");
    const [newJobSections, setNewJobSections] = useState<JobSection[]>([]);
    // Optional hero image for the position (shown on the public detail page).
    const [newJobImageUrl, setNewJobImageUrl] = useState<string | null>(null);
    const [newJobImagePublicId, setNewJobImagePublicId] = useState<string | null>(null);
    const [uploadingJobImage, setUploadingJobImage] = useState(false);
    // New (unreviewed) applications — drives the "Applications Received" badge.
    const pendingApplicationCount = applications.filter((a) => a.status === 'pending').length;

    // File-vs-metadata for a document, honoring the requirement's configured
    // evidenceMode (authoritative) over the static DOCUMENT_METADATA default —
    // e.g. work_authorization can be a file even though its built-in default is
    // metadata-only. Falls back to the static map when the type isn't a current
    // requirement (legacy/removed).
    const applicationRequirementByType = useMemo(
        () => new Map(selectedApplicationRequirements.map((r) => [r.documentType, r])),
        [selectedApplicationRequirements]
    );
    const docIsMetadataOnly = (documentType: DocumentType) => {
        const req = applicationRequirementByType.get(documentType);
        if (req) return !req.requiresFile;
        return usesMetadataOnlyStorage(documentType);
    };
    // Requirements the applicant hasn't submitted yet (incl. ones added after
    // they applied) — surfaced so the reviewer sees what's still outstanding.
    const missingApplicationRequirements = useMemo(() => {
        const submitted = new Set(selectedApplicationDocuments.map((d) => d.documentType));
        return selectedApplicationRequirements.filter((r) => !submitted.has(r.documentType));
    }, [selectedApplicationRequirements, selectedApplicationDocuments]);
    const [sectionLabel, setSectionLabel] = useState("");
    const [sectionContent, setSectionContent] = useState("");
    // Drag-to-reorder state for posting sections (see the question list below for
    // the same pattern; `armed*` gates `draggable` to the grip handle so the
    // inline label/content inputs stay selectable).
    const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
    const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null);
    const [armedSectionDragIdx, setArmedSectionDragIdx] = useState<number | null>(null);

    // New Application Form Builder State
    const [formName, setFormName] = useState("");
    const [formFields, setFormFields] = useState<CustomField[]>([]);
    const [formDocumentRequirements, setFormDocumentRequirements] = useState<DocumentRequirement[]>(DEFAULT_DOCUMENT_REQUIREMENTS);
    const [editingFormId, setEditingFormId] = useState<string | null>(null);
    // Drag-to-reorder state for the question list (index being dragged / hovered).
    // `armedDragIdx` gates the row's `draggable` flag to the grip handle so the
    // inline section input stays selectable with the mouse.
    const [dragFieldIdx, setDragFieldIdx] = useState<number | null>(null);
    const [dragOverFieldIdx, setDragOverFieldIdx] = useState<number | null>(null);
    const [armedDragIdx, setArmedDragIdx] = useState<number | null>(null);

    // Documents are now driven by the compliance catalog (collectAtApplication),
    // not the form. Read-only view of what will apply — shares the RTK Query
    // cache with the Requirements/Compliance tabs (usually a cache hit).
    const { data: reqData } = useGetRequirementsQuery();
    const catalogAppDocs = useMemo(() => {
        const list: any[] = Array.isArray(reqData?.requirements) ? reqData.requirements : [];
        return list
            .filter((r) => r.active && r.collectAtApplication)
            .map((r) => ({
                key: r.key as string,
                label: r.label as string,
                evidenceMode: r.evidenceMode as string,
                isMandatory: r.isMandatory as boolean,
                appliesToAll: (r.appliesToAll ?? false) as boolean,
                appliesToPositions: (r.appliesToPositions || []) as string[],
            }));
    }, [reqData]);

    // Custom Field Builder Fields
    const [fieldName, setFieldName] = useState("");
    const [fieldLabel, setFieldLabel] = useState("");
    const [fieldType, setFieldType] = useState<CustomField['type']>('text');
    const [fieldRequired, setFieldRequired] = useState(false);
    const [fieldOptionsRaw, setFieldOptionsRaw] = useState("");
    const [fieldSection, setFieldSection] = useState(DEFAULT_SECTION);

    // Publish Selection Form
    const [selectedFormId, setSelectedFormId] = useState("");

    // Review Notes State
    const [noteText, setNoteText] = useState("");
    const [isSavingNote, setIsSavingNote] = useState(false);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subTab, jobStateFilter, jobsPage]);

    // Load applications once for the "Applications Received" badge, regardless of
    // which sub-tab is active.
    useEffect(() => {
        fetch('/api/admin/applications')
            .then((r) => r.json())
            .then((d) => setApplications(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!selectedApplication) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // If the file viewer is open, Escape closes it first (not the whole modal).
            if (viewerFile) {
                setViewerFile(null);
                return;
            }
            setSelectedApplication(null);
        };

        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [selectedApplication, viewerFile]);

    const loadApplicationDocuments = async (applicationId: string, signal?: AbortSignal) => {
        const res = await fetch(`/api/applications/${applicationId}/documents`, { signal });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.error || 'Failed to load application documents.');
        }

        const docs = Array.isArray(data.documents) ? data.documents : [];
        setSelectedApplicationDocuments(docs);
        setSelectedApplicationRequirements(Array.isArray(data.requirements) ? data.requirements : []);
        setDocumentExpiryDrafts(
            Object.fromEntries(
                docs.map((doc: ApplicationDocument) => [
                    doc._id,
                    doc.expiryDate ? new Date(doc.expiryDate).toISOString().split('T')[0] : "",
                ])
            )
        );
    };

    useEffect(() => {
        if (!selectedApplication) {
            setSelectedApplicationDocuments([]);
            setSelectedApplicationRequirements([]);
            setDocumentExpiryDrafts({});
            setApplicationDocumentsError("");
            return;
        }

        const controller = new AbortController();
        setIsLoadingApplicationDocuments(true);
        setApplicationDocumentsError("");

        loadApplicationDocuments(selectedApplication._id, controller.signal)
            .catch((err) => {
                if (err?.name !== 'AbortError') {
                    setApplicationDocumentsError(err?.message || 'Failed to load application documents.');
                }
            })
            .finally(() => setIsLoadingApplicationDocuments(false));

        return () => controller.abort();
    }, [selectedApplication]);

    const handleAdminUploadDocument = async (documentType: DocumentType, file: File | null) => {
        if (!selectedApplication || !file) return;

        setUploadingAdminDocumentType(documentType);
        try {
            const formData = new FormData();
            formData.append('documentType', documentType);
            formData.append('file', file);

            const res = await fetch(`/api/applications/${selectedApplication._id}/documents`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                setCustomAlert({
                    title: 'Error',
                    message: data?.error || 'Failed to upload document on behalf of candidate.',
                });
                return;
            }

            await loadApplicationDocuments(selectedApplication._id);
        } catch (err) {
            console.error(err);
            setCustomAlert({
                title: 'Error',
                message: 'Failed to upload document on behalf of candidate.',
            });
        } finally {
            setUploadingAdminDocumentType(null);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Pre-load forms so they are always mapped correctly
            const formsRes = await fetch('/api/admin/forms');
            const formsData = await formsRes.json();
            const loadedForms = formsData.data || [];
            setForms(loadedForms);

            if (subTab === 'positions') {
                const params = new URLSearchParams();
                if (jobStateFilter) params.set('state', jobStateFilter);
                params.set('page', String(jobsPage));
                params.set('limit', String(jobsLimit));
                const res = await fetch(`/api/admin/jobs?${params.toString()}`);
                const data = await res.json();
                setJobs(Array.isArray(data?.data) ? data.data : []);
                setJobsTotal(typeof data?.total === 'number' ? data.total : 0);
            } else if (subTab === 'applications') {
                const res = await fetch('/api/admin/applications');
                const data = await res.json();
                setApplications(data);
            }
        } catch (err) {
            console.error("Failed to load data", err);
        } finally {
            setIsLoading(false);
        }
    };

    // --- FORM BUILDER HANDLERS ---
    const handleAddField = () => {
        if (!fieldName || !fieldLabel) return;
        const fieldKey = normalizeFieldKey(fieldName);

        if (!fieldKey) {
            setCustomAlert({
                title: "Warning",
                message: "Field key is invalid. Use letters, numbers, and underscores only."
            });
            return;
        }
        
        if (formFields.some(f => f.name === fieldKey)) {
            setCustomAlert({
                title: "Warning",
                message: "A question with this name identifier already exists."
            });
            return;
        }

        const options = (fieldType === 'select' || fieldType === 'checkbox') && fieldOptionsRaw.trim()
            ? fieldOptionsRaw.split(',').map(o => o.trim()).filter(Boolean)
            : undefined;

        const newField: CustomField = {
            name: fieldKey,
            label: fieldLabel,
            type: fieldType,
            required: fieldRequired,
            options,
            section: fieldSection.trim() || DEFAULT_SECTION,
        };

        setFormFields([...formFields, newField]);
        setFieldName("");
        setFieldLabel("");
        setFieldType("text");
        setFieldRequired(false);
        setFieldOptionsRaw("");
        // Keep the section selected so consecutive questions default to the same group.
    };

    const handleRemoveField = (index: number) => {
        setFormFields(formFields.filter((_, i) => i !== index));
    };

    // Edits an existing question in place. `name` is deliberately not patchable —
    // submitted answers are keyed by it (JobApplication.customFieldValues is a
    // Map), so renaming would orphan every answer already collected. Same reason
    // `type` is fixed: stored values follow the type's shape (checkbox → array).
    const handleFieldChange = (index: number, patch: Partial<CustomField>) => {
        setFormFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    };

    // Array order IS the applicant-facing order: the apply page groups questions
    // by section in first-appearance order, then renders each section's questions
    // in array order. So moving a row here is all that's needed to reorder a form —
    // no need to delete and re-add questions to slot one in.
    const moveField = (from: number, to: number) => {
        setFormFields(prev => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const handleFieldDrop = (targetIdx: number) => {
        if (dragFieldIdx !== null) moveField(dragFieldIdx, targetIdx);
        setDragFieldIdx(null);
        setDragOverFieldIdx(null);
    };

    // Mirrors the apply page's grouping so the builder list previews the real
    // applicant order: one step per section, placed where the section first
    // appears. A section that appears in two separate blocks is flagged, since
    // the applicant sees both blocks merged into the earlier step.
    const sectionOfField = (f: CustomField) => (f.section && f.section.trim()) || DEFAULT_SECTION;
    const firstIndexBySection = new Map<string, number>();
    formFields.forEach((f, i) => {
        const s = sectionOfField(f);
        if (!firstIndexBySection.has(s)) firstIndexBySection.set(s, i);
    });

    // Document requirements are now managed in the compliance catalog
    // (collectAtApplication + position), not per form — so the form builder no
    // longer edits them. `formDocumentRequirements` is retained only so existing
    // forms round-trip their legacy list on save.

    const handleSaveForm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) return;

        // Questions are editable in place, so re-check them here rather than only
        // at add time — a blanked-out label should never reach the public form.
        const cleanedFields = formFields.map(f => ({
            ...f,
            label: f.label.trim(),
            section: (f.section || '').trim() || DEFAULT_SECTION,
        }));
        if (cleanedFields.some(f => !f.label)) {
            setCustomAlert({
                title: "Information",
                message: "Every question needs a label. Fill in the blank ones or remove them."
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const url = editingFormId ? `/api/admin/forms/${editingFormId}` : '/api/admin/forms';
            const method = editingFormId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    customFields: cleanedFields,
                    documentRequirements: formDocumentRequirements,
                    requiredDocuments: formDocumentRequirements.filter((item) => item.required).map((item) => item.documentType),
                })
            });

            const data = await res.json();
            if (res.ok) {
                setShowFormModal(false);
                setFormName("");
                setFormFields([]);
                setFormDocumentRequirements(DEFAULT_DOCUMENT_REQUIREMENTS);
                setEditingFormId(null);
                fetchData();
            } else {
                setCustomAlert({
                    title: "Error",
                    message: data.error || "Failed to save application form"
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteForm = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/forms/${id}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (res.ok) {
                fetchData();
            } else {
                setCustomAlert({
                    title: "Error",
                    message: data.error || "Failed to delete form"
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    // --- JOB POSITION HANDLERS ---
    const handleAddSection = () => {
        if (!sectionLabel.trim() || !sectionContent.trim()) return;
        setNewJobSections([...newJobSections, { label: sectionLabel.trim(), content: sectionContent.trim() }]);
        setSectionLabel("");
        setSectionContent("");
    };

    const handleRemoveSection = (index: number) => {
        setNewJobSections(newJobSections.filter((_, i) => i !== index));
    };

    // Sections are an ordered array on the position, so editing one in place is
    // just a patch of that entry — no need to remove and re-add to fix a typo.
    const handleSectionChange = (index: number, patch: Partial<JobSection>) => {
        setNewJobSections(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const moveSection = (from: number, to: number) => {
        setNewJobSections(prev => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const handleSectionDrop = (targetIdx: number) => {
        if (dragSectionIdx !== null) moveSection(dragSectionIdx, targetIdx);
        setDragSectionIdx(null);
        setDragOverSectionIdx(null);
    };

    // Upload the position's optional hero image. The returned asset is 'pending'
    // until the position is saved (the create/update route then marks it consumed).
    const handleJobImageUpload = async (file: File | null) => {
        if (!file) return;
        setUploadingJobImage(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('source', 'admin');
            fd.append('usageType', 'position_image');
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                setCustomAlert({ title: 'Upload failed', message: data.error || 'Could not upload the image.' });
                return;
            }
            setNewJobImageUrl(data.url);
            setNewJobImagePublicId(data.public_id);
        } catch (err) {
            console.error(err);
            setCustomAlert({ title: 'Upload failed', message: 'Could not upload the image. Please try again.' });
        } finally {
            setUploadingJobImage(false);
        }
    };

    // Reusable image picker used by both the create and edit position modals.
    const renderJobImageField = () => (
        <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-text-muted">Position Image <span className="normal-case font-normal">(optional)</span></label>
            {newJobImageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-border-card group">
                    <img src={newJobImageUrl} alt="Position" className="w-full h-40 object-cover" />
                    <button
                        type="button"
                        onClick={() => { setNewJobImageUrl(null); setNewJobImagePublicId(null); }}
                        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold px-2.5 py-1.5 backdrop-blur transition-colors"
                    >
                        <Trash2 className="h-3 w-3" /> Remove
                    </button>
                </div>
            ) : (
                <label className={`flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-border-card cursor-pointer hover:border-brand-primary/40 transition-colors ${uploadingJobImage ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploadingJobImage ? <Loader2 className="h-5 w-5 text-brand-primary animate-spin" /> : <Plus className="h-5 w-5 text-text-muted" />}
                    <span className="text-xs font-semibold text-text-muted">{uploadingJobImage ? 'Uploading…' : 'Upload an image (PNG, JPG, WEBP)'}</span>
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => { void handleJobImageUpload(e.target.files?.[0] || null); e.currentTarget.value = ''; }}
                    />
                </label>
            )}
            <p className="text-[10px] text-text-muted">Shown next to the position details on the public job page.</p>
        </div>
    );

    // Reusable sections builder shared by the create and edit position modals.
    // Every section is editable in place and can be dragged into a new order;
    // the public posting renders them top-to-bottom in this order.
    const renderSectionsBuilder = () => (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/20 p-4 md:p-5 space-y-4">
            <h3 className="text-sm font-black tracking-wide text-slate-900 dark:text-white">Posting Details & Sections</h3>

            {newJobSections.length > 0 && (
                <div className="space-y-2 bg-white dark:bg-black/25 p-4 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
                    <p className="text-[10px] text-slate-500 dark:text-slate-500">
                        Edit any section directly below — changes apply when you save the position. Drag the handle
                        (or use the arrows) to reorder; applicants see them in this order.
                    </p>
                    {newJobSections.map((sec, idx) => (
                        <div
                            key={idx}
                            draggable={armedSectionDragIdx === idx}
                            onDragStart={e => { setDragSectionIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null); setArmedSectionDragIdx(null); }}
                            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverSectionIdx !== idx) setDragOverSectionIdx(idx); }}
                            onDrop={e => { e.preventDefault(); handleSectionDrop(idx); }}
                            className={`flex items-start gap-2.5 bg-slate-100/85 dark:bg-white/[0.03] border p-3 rounded-xl transition-all ${
                                dragSectionIdx === idx
                                    ? 'opacity-40 border-cyan-500/60'
                                    : dragOverSectionIdx === idx && dragSectionIdx !== null
                                        ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                                        : 'border-slate-200 dark:border-white/[0.06]'
                            }`}
                        >
                            <div className="shrink-0 flex items-center gap-1 pt-1.5">
                                <span
                                    onMouseDown={() => setArmedSectionDragIdx(idx)}
                                    onMouseUp={() => setArmedSectionDragIdx(null)}
                                    title="Drag to reorder"
                                    className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <GripVertical className="h-4 w-4" />
                                </span>
                                <span className="w-4 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500">{idx + 1}</span>
                                <div className="flex flex-col -space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => moveSection(idx, idx - 1)}
                                        disabled={idx === 0}
                                        title="Move up"
                                        aria-label={`Move ${sec.label || 'section'} up`}
                                        className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400"
                                    >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveSection(idx, idx + 1)}
                                        disabled={idx === newJobSections.length - 1}
                                        title="Move down"
                                        aria-label={`Move ${sec.label || 'section'} down`}
                                        className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400"
                                    >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <input
                                    type="text"
                                    value={sec.label}
                                    onChange={e => handleSectionChange(idx, { label: e.target.value })}
                                    placeholder="Section label"
                                    aria-label="Section label"
                                    className="w-full text-xs font-bold bg-white dark:bg-black/30 border border-slate-200 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                />
                                <textarea
                                    value={sec.content}
                                    onChange={e => handleSectionChange(idx, { content: e.target.value })}
                                    rows={Math.min(12, Math.max(2, sec.content.split('\n').length))}
                                    placeholder="Section content"
                                    aria-label="Section content"
                                    className="w-full text-xs leading-relaxed bg-white dark:bg-black/30 border border-slate-200 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-y"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemoveSection(idx)}
                                className="shrink-0 text-rose-500 hover:text-rose-400 text-[11px] font-bold px-2 py-1 rounded-lg hover:bg-rose-500/10"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-white dark:bg-black/25 p-4 rounded-2xl border border-slate-200 dark:border-white/[0.06] space-y-3">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Section Label / Title</label>
                    <input
                        type="text"
                        value={sectionLabel}
                        onChange={e => setSectionLabel(e.target.value)}
                        placeholder="e.g. Key Responsibilities, Basic Qualifications, Salary & Benefits"
                        className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Section Content</label>
                    <textarea
                        rows={3}
                        value={sectionContent}
                        onChange={e => setSectionContent(e.target.value)}
                        placeholder="Provide details for this section..."
                        className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleAddSection}
                        disabled={!sectionLabel.trim() || !sectionContent.trim()}
                        className="bg-slate-900 hover:bg-slate-800 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] disabled:opacity-40 text-white dark:text-white font-bold text-xs px-4 py-2 rounded-xl border border-transparent dark:border-white/[0.10] transition-colors"
                    >
                        Add Section
                    </button>
                </div>
            </div>
        </div>
    );

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newJobTitle || newJobSections.length === 0) {
            setCustomAlert({
                title: "Information",
                message: "Title and at least one job description section are required."
            });
            return;
        }

        // Sections are edited in place, so re-check them here rather than only at
        // add time — an emptied label or body should never reach the public page.
        const cleanedSections = newJobSections.map(s => ({ label: s.label.trim(), content: s.content.trim() }));
        if (cleanedSections.some(s => !s.label || !s.content)) {
            setCustomAlert({
                title: "Information",
                message: "Every section needs a label and content. Fill in the blank ones or remove them."
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/admin/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newJobTitle,
                    location: newJobLocation,
                    city: newJobCity,
                    sections: cleanedSections,
                    imageUrl: newJobImageUrl,
                    imagePublicId: newJobImagePublicId,
                })
            });

            if (res.ok) {
                setShowCreateModal(false);
                setNewJobTitle("");
                setNewJobLocation("");
                setNewJobCity("");
                setNewJobSections([]);
                setNewJobImageUrl(null);
                setNewJobImagePublicId(null);
                setSectionLabel("");
                setSectionContent("");
                setJobsPage(1);
                fetchData();
            } else {
                const err = await res.json();
                setCustomAlert({
                    title: "Error",
                    message: err.error || "Failed to create position"
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showEditModal || !newJobTitle || newJobSections.length === 0) return;

        const cleanedSections = newJobSections.map(s => ({ label: s.label.trim(), content: s.content.trim() }));
        if (cleanedSections.some(s => !s.label || !s.content)) {
            setCustomAlert({
                title: "Information",
                message: "Every section needs a label and content. Fill in the blank ones or remove them."
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/admin/jobs/${showEditModal._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newJobTitle,
                    location: newJobLocation,
                    city: newJobCity,
                    sections: cleanedSections,
                    imageUrl: newJobImageUrl,
                    imagePublicId: newJobImagePublicId,
                })
            });

            if (res.ok) {
                setShowEditModal(null);
                setNewJobTitle("");
                setNewJobLocation("");
                setNewJobCity("");
                setNewJobSections([]);
                setNewJobImageUrl(null);
                setNewJobImagePublicId(null);
                fetchData();
            } else {
                const err = await res.json();
                setCustomAlert({
                    title: "Error",
                    message: err.error || "Failed to update position"
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteJob = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/jobs/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchData();
            } else {
                const data = await res.json();
                setCustomAlert({
                    title: "Error",
                    message: data.error || "Failed to delete job position"
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePublishPosition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showPublishModal || !selectedFormId) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/admin/jobs/${showPublishModal._id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formId: selectedFormId })
            });

            if (res.ok) {
                setShowPublishModal(null);
                setSelectedFormId("");
                fetchData();
            } else {
                const data = await res.json();
                setCustomAlert({
                    title: "Error",
                    message: data.message || data.error || "Failed to publish job"
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (job: JobPosition) => {
        if (job.status === 'draft') {
            setShowPublishModal(job);
            return;
        }

        const nextStatus = job.status === 'open' ? 'closed' : 'open';
        try {
            const res = await fetch(`/api/admin/jobs/${job._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });

            if (res.ok) {
                setJobs(jobs.map(j => j._id === job._id ? { ...j, status: nextStatus } : j));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleStatusUpdate = async (id: string, newStatus: JobApplication['status'], label?: string) => {
        try {
            const res = await fetch(`/api/admin/applications/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (res.ok) {
                if (selectedApplication?._id === id) {
                    setSelectedApplication({ ...selectedApplication, status: newStatus });
                }
                setApplications(applications.map(app => app._id === id ? { ...app, status: newStatus } : app));
                setCustomAlert({
                    title: 'Status updated',
                    message: newStatus === 'accepted'
                        ? 'Applicant accepted. Their verified documents are being linked to their staff compliance record.'
                        : `Application marked as ${label || newStatus}.`,
                });
            } else {
                const data = await res.json().catch(() => ({}));
                setCustomAlert({ title: 'Error', message: data.error || 'Failed to update application status.' });
            }
        } catch (err) {
            console.error(err);
            setCustomAlert({ title: 'Error', message: 'Failed to update application status.' });
        }
    };

    // Export the open application (profile, responses, documents, notes) to PDF.
    const handleExportApplicationPdf = () => {
        if (!selectedApplication) return;
        try {
            setIsExportingPdf(true);
            const statusLabel = APPLICATION_STATUS_META[selectedApplication.status]?.label || selectedApplication.status;
            downloadApplicationPdf(toApplicationPdfData(selectedApplication, selectedApplicationDocuments, statusLabel));
        } catch (err: any) {
            console.error('[Application PDF] export failed:', err?.message || err);
            setCustomAlert({ title: 'Export failed', message: 'Could not generate the application PDF. Please try again.' });
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleDeleteApplication = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/applications/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                if (selectedApplication?._id === id) {
                    setSelectedApplication(null);
                }
                setApplications(applications.filter(app => app._id !== id));
            } else {
                const data = await res.json();
                setCustomAlert({
                    title: "Error",
                    message: data.error || "Failed to delete application"
                });
            }
        } catch (err) {
            console.error(err);
            setCustomAlert({
                title: "Error",
                message: "Failed to delete application"
            });
        }
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedApplication || !noteText.trim()) return;

        setIsSavingNote(true);
        try {
            const res = await fetch(`/api/admin/applications/${selectedApplication._id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: noteText })
            });

            if (res.ok) {
                const data = await res.json();
                setSelectedApplication({ ...selectedApplication, notes: data.notes });
                setApplications(applications.map(app => app._id === selectedApplication._id ? { ...app, notes: data.notes } : app));
                setNoteText("");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleDocumentReviewAction = async (
        docId: string,
        action: 'verify' | 'reject',
        rejectionReason?: string
    ) => {
        setSavingDocumentId(docId);
        try {
            const payload: {
                action: 'verify' | 'reject';
                rejectionReason?: string;
                expiryDate?: string | null;
            } = { action };

            if (action === 'verify') {
                payload.expiryDate = documentExpiryDrafts[docId] || null;
            } else if (rejectionReason) {
                payload.rejectionReason = rejectionReason;
            }

            const res = await fetch(`/api/admin/documents/${docId}/verify`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                setCustomAlert({
                    title: 'Error',
                    message: data.error || 'Failed to update document review state.',
                });
                return;
            }

            const updated = data.document;
            setSelectedApplicationDocuments((prev) =>
                prev.map((doc) =>
                    doc._id === docId
                        ? {
                            ...doc,
                            status: updated.status,
                            expiryDate: updated.expiryDate || null,
                            rejectionReason: updated.rejectionReason || undefined,
                        }
                        : doc
                )
            );
            setDocumentExpiryDrafts((prev) => ({
                ...prev,
                [docId]: updated.expiryDate ? new Date(updated.expiryDate).toISOString().split('T')[0] : "",
            }));
        } catch (err) {
            console.error(err);
            setCustomAlert({
                title: 'Error',
                message: 'Failed to update document review state.',
            });
        } finally {
            setSavingDocumentId(null);
        }
    };

    // Server-side pagination for Job Positions (jobs already holds one page).
    const totalJobPages = Math.ceil(jobsTotal / jobsLimit) || 1;
    const paginatedJobs = jobs;

    return (
        <div className="space-y-6">
            {/* Header Tabs */}
            <div className="flex flex-wrap gap-4 justify-between items-center border-b border-white/[0.06] pb-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => setSubTab('positions')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            subTab === 'positions'
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "text-slate-500 hover:text-slate-200"
                        }`}
                    >
                        Job Positions
                    </button>
                    <button
                        onClick={() => setSubTab('forms')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            subTab === 'forms'
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "text-slate-500 hover:text-slate-200"
                        }`}
                    >
                        Application Forms
                    </button>
                    <button
                        onClick={() => setSubTab('applications')}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            subTab === 'applications'
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "text-slate-500 hover:text-slate-200"
                        }`}
                    >
                        Applications Received
                        {pendingApplicationCount > 0 && (
                            <span
                                className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black"
                                title={`${pendingApplicationCount} new application${pendingApplicationCount === 1 ? "" : "s"} awaiting review`}
                            >
                                {pendingApplicationCount}
                            </span>
                        )}
                    </button>
                </div>

                {subTab === 'positions' && (
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                                value={jobStateFilter}
                                onChange={e => { setJobStateFilter(e.target.value); setJobsPage(1); }}
                                className="text-xs font-semibold bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-xl pl-8 pr-3 py-2 text-slate-700 dark:text-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none"
                            >
                                <option value="">All states</option>
                                {LOCATION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                setNewJobTitle("");
                                setNewJobLocation("");
                                setNewJobCity("");
                                setNewJobSections([]);
                                setNewJobImageUrl(null);
                                setNewJobImagePublicId(null);
                                setShowCreateModal(true);
                            }}
                            className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition-all active:scale-95"
                        >
                            <Plus className="h-4 w-4" /> Add Position
                        </button>
                    </div>
                )}

                {subTab === 'forms' && (
                    <button
                        onClick={() => {
                            setEditingFormId(null);
                            setFormName("");
                            setFormFields(DEFAULT_FORM_FIELDS);
                            setFormDocumentRequirements(DEFAULT_DOCUMENT_REQUIREMENTS);
                            setShowFormModal(true);
                        }}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
                    >
                        <Plus className="h-4 w-4" /> Create Form
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-10 w-10 text-cyan-500 animate-spin" />
                </div>
            ) : subTab === 'positions' ? (
                /* Positions Paginated Table View */
                <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="p-4">Job Title</th>
                                    <th className="p-4">Attached Form</th>
                                    <th className="p-4">Applications</th>
                                    <th className="p-4">Posted On</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {paginatedJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 text-slate-500">
                                            No job positions found. Create one to begin.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedJobs.map(job => {
                                        const formObj = forms.find(f => f._id === job.formId);
                                        const attachedFormName = formObj ? formObj.name : "None attached";

                                        return (
                                            <tr key={job._id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="p-4 font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                                                    {job.title}
                                                    {formatLocation(job.city, job.location) && (
                                                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-slate-400">
                                                            <MapPin className="h-3 w-3 text-cyan-400" /> {formatLocation(job.city, job.location)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`text-xs ${formObj ? 'text-slate-300 font-medium' : 'text-slate-500 italic'}`}>
                                                        {attachedFormName}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
                                                        {job.applicationCount || 0} applications
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs text-slate-400">
                                                    {new Date(job.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                        job.status === 'open' 
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            : job.status === 'draft'
                                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                            : 'bg-white/[0.02] text-slate-500 border border-white/[0.04]'
                                                    }`}>
                                                        {job.status === 'open' ? 'Active' : job.status === 'draft' ? 'Draft' : 'Closed'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <button
                                                            onClick={() => {
                                                                setNewJobTitle(job.title);
                                                                setNewJobLocation(job.location || "");
                                                                setNewJobCity(job.city || "");
                                                                setNewJobSections(job.sections || []);
                                                                setNewJobImageUrl(job.imageUrl || null);
                                                                setNewJobImagePublicId(job.imagePublicId || null);
                                                                setSectionLabel("");
                                                                setSectionContent("");
                                                                setShowEditModal(job);
                                                            }}
                                                            className="p-1.5 hover:bg-white/[0.05] rounded text-slate-400 hover:text-cyan-400 transition-colors"
                                                            title="Edit Position details"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </button>

                                                        <button
                                                            onClick={() => handleToggleStatus(job)}
                                                            className="text-slate-400 hover:text-white flex items-center gap-1 text-xs font-semibold"
                                                            title={job.status === 'open' ? 'Close Posting' : job.status === 'draft' ? 'Publish Posting' : 'Re-open Posting'}
                                                        >
                                                            {job.status === 'open' ? (
                                                                <ToggleRight className="h-5 w-5 text-emerald-400" />
                                                            ) : (
                                                                <ToggleLeft className="h-5 w-5 text-slate-500" />
                                                            )}
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setDeleteConfirm({
                                                                    id: job._id,
                                                                    type: 'job',
                                                                    message: `Are you sure you want to delete the job position "${job.title}"? This action cannot be undone.`
                                                                });
                                                            }}
                                                            className="p-1.5 hover:bg-white/[0.05] rounded text-slate-400 hover:text-rose-500 transition-colors"
                                                            title="Delete Position"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Job Pagination Controls */}
                    {totalJobPages > 1 && (
                        <div className="p-4 border-t border-white/[0.04] flex items-center justify-between bg-white/[0.01]">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Page <span className="text-slate-200">{jobsPage}</span> of <span className="text-slate-200">{totalJobPages}</span> <span className="ml-2 text-slate-500">({jobsTotal} position{jobsTotal === 1 ? '' : 's'}{jobStateFilter ? ` in ${jobStateFilter}` : ''})</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                                    disabled={jobsPage === 1}
                                    className="p-1.5 rounded-lg border border-white/10 bg-black/40 text-slate-300 disabled:opacity-30 hover:bg-white/[0.02] transition-colors flex items-center"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setJobsPage(p => Math.min(totalJobPages, p + 1))}
                                    disabled={jobsPage >= totalJobPages}
                                    className="p-1.5 rounded-lg border border-white/10 bg-black/40 text-slate-300 disabled:opacity-30 hover:bg-white/[0.02] transition-colors flex items-center"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : subTab === 'forms' ? (
                /* Forms View */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {forms.length === 0 ? (
                        <div className="col-span-2 text-center py-16 text-slate-500 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                            No custom application forms created yet. Create one to begin.
                        </div>
                    ) : (
                        forms.map(form => (
                            <div 
                                key={form._id}
                                className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.06] rounded-2xl p-5 hover:border-cyan-500/30 transition-all flex flex-col justify-between group shadow-sm"
                            >
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-base text-slate-200 group-hover:text-cyan-400 transition-colors">
                                            {form.name}
                                        </h3>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            Created: {new Date(form.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="bg-black/25 p-3 rounded-xl border border-white/[0.04] space-y-1.5 text-xs">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block text-[9px]">Custom Fields ({form.customFields.length})</span>
                                        <div className="flex flex-wrap gap-1">
                                            {form.customFields.map(f => (
                                                <span key={f.name} className="px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.04] text-[10px] text-slate-400">
                                                    {f.label} <span className="text-[9px] text-text-muted">({f.type})</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-black/25 p-3 rounded-xl border border-white/[0.04] text-xs">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block text-[9px]">Required documents</span>
                                        <p className="mt-1 text-[10px] text-slate-400">
                                            Managed in Compliance → Requirements (“Collect on application”), attached by position — not per form.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-5 pt-3 border-t border-white/[0.04] flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setEditingFormId(form._id);
                                            setFormName(form.name);
                                            setFormFields(form.customFields);
                                            setFormDocumentRequirements(normalizeDocumentRequirements(form));
                                            setShowFormModal(true);
                                        }}
                                        className="text-xs font-bold text-cyan-400 hover:text-cyan-300"
                                    >
                                        Edit Fields
                                    </button>
                                    <button
                                        onClick={() => {
                                            setDeleteConfirm({
                                                id: form._id,
                                                type: 'form',
                                                message: `Are you sure you want to delete the application form "${form.name}"? This action cannot be undone.`
                                            });
                                        }}
                                        className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* Applications View */
                <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="p-4">Candidate</th>
                                    <th className="p-4">Applied For</th>
                                    <th className="p-4">Applied On</th>
                                    <th className="p-4">Code</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {applications.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 text-slate-500">
                                            No applications received yet.
                                        </td>
                                    </tr>
                                ) : (
                                    applications.map(app => (
                                        <tr key={app._id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4">
                                                <div>
                                                    <div className="font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">{app.applicantName}</div>
                                                    <div className="text-xs text-slate-500">{app.applicantEmail}</div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-300 font-medium">
                                                {app.jobTitle || "Job Position"}
                                            </td>
                                            <td className="p-4 text-slate-400">
                                                {new Date(app.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-4">
                                                <code className="text-xs bg-black/40 border border-white/10 px-2 py-0.5 rounded text-cyan-400 font-mono font-bold">
                                                    {app.accessCode}
                                                </code>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                                    app.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    app.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                    app.status === 'shortlisted' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                                    app.status === 'changes_requested' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                    app.status === 'reviewed' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                    'bg-white/[0.02] text-slate-500 border border-white/[0.04]'
                                                }`}>
                                                    {app.status}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => setSelectedApplication(app)}
                                                        className="text-cyan-400 hover:text-cyan-300 font-bold text-xs flex items-center gap-1.5"
                                                    >
                                                        <Eye className="h-4 w-4" /> Review
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setDeleteConfirm({
                                                                id: app._id,
                                                                type: 'application',
                                                                message: `Are you sure you want to delete application for "${app.applicantName}"? This action cannot be undone.`
                                                            });
                                                        }}
                                                        className="text-rose-400 hover:text-rose-300 font-bold text-xs flex items-center gap-1.5"
                                                    >
                                                        <Trash2 className="h-4 w-4" /> Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Create Job Position */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
                    <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-white/95 dark:bg-[#101830] border border-slate-200/80 dark:border-white/[0.10] rounded-[28px] shadow-[0_28px_90px_-24px_rgba(2,6,23,0.6)] relative">
                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="absolute top-4 right-4 h-9 w-9 rounded-xl border border-slate-300/80 dark:border-white/[0.12] bg-white/75 dark:bg-white/[0.04] text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.09] transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>

                        <div className="px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 dark:border-white/[0.07] bg-gradient-to-r from-slate-100/70 to-white dark:from-white/[0.03] dark:to-transparent">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Create New Job Position</h2>
                            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Build a clean, scannable job posting with reusable sections.</p>
                        </div>

                        <form onSubmit={handleCreateJob} className="space-y-5 overflow-y-auto px-5 md:px-7 pb-5 md:pb-7 pt-4 pr-2 flex-1 min-h-0">
                            <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/90 dark:bg-black/20 p-4 md:p-5">
                                <label className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Job Title</label>
                                <input
                                    type="text"
                                    required
                                    value={newJobTitle}
                                    onChange={e => setNewJobTitle(e.target.value)}
                                    placeholder="e.g. Registered Nurse, Senior Administrator"
                                    className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                />

                                <label className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest pt-2 block">Location <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={newJobLocation}
                                        onChange={e => setNewJobLocation(e.target.value)}
                                        className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                    >
                                        <option value="">Select a state…</option>
                                        {LOCATION_OPTIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        value={newJobCity}
                                        onChange={e => setNewJobCity(e.target.value)}
                                        placeholder="City (optional)"
                                        className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {renderJobImageField()}

                            {/* Dynamic Sections builder (editable + reorderable) */}
                            {renderSectionsBuilder()}

                            <div className="sticky bottom-0 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/[0.07] bg-gradient-to-t from-white dark:from-slate-900 via-white/95 dark:via-slate-900/95 to-transparent">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.03]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || newJobSections.length === 0}
                                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
                                >
                                    {isSubmitting ? "Creating..." : "Create Position"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Job Position */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
                    <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-white/95 dark:bg-[#101830] border border-slate-200/80 dark:border-white/[0.10] rounded-[28px] shadow-[0_28px_90px_-24px_rgba(2,6,23,0.6)] relative">
                        <button
                            onClick={() => setShowEditModal(null)}
                            className="absolute top-4 right-4 h-9 w-9 rounded-xl border border-slate-300/80 dark:border-white/[0.12] bg-white/75 dark:bg-white/[0.04] text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.09] transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>

                        <div className="px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 dark:border-white/[0.07] bg-gradient-to-r from-slate-100/70 to-white dark:from-white/[0.03] dark:to-transparent">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Edit Job Position</h2>
                            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Refine title and section copy while keeping the structure clear.</p>
                        </div>

                        <form onSubmit={handleEditJob} className="space-y-5 overflow-y-auto px-5 md:px-7 pb-5 md:pb-7 pt-4 pr-2 flex-1 min-h-0">
                            <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/90 dark:bg-black/20 p-4 md:p-5">
                                <label className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Job Title</label>
                                <input
                                    type="text"
                                    required
                                    value={newJobTitle}
                                    onChange={e => setNewJobTitle(e.target.value)}
                                    placeholder="e.g. Registered Nurse, Senior Administrator"
                                    className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                />

                                <label className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest pt-2 block">Location <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={newJobLocation}
                                        onChange={e => setNewJobLocation(e.target.value)}
                                        className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                    >
                                        <option value="">Select a state…</option>
                                        {LOCATION_OPTIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        value={newJobCity}
                                        onChange={e => setNewJobCity(e.target.value)}
                                        placeholder="City (optional)"
                                        className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {renderJobImageField()}

                            {/* Dynamic Sections builder (editable + reorderable) */}
                            {renderSectionsBuilder()}

                            <div className="sticky bottom-0 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/[0.07] bg-gradient-to-t from-white dark:from-slate-900 via-white/95 dark:via-slate-900/95 to-transparent">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(null)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.03]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || newJobSections.length === 0}
                                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
                                >
                                    {isSubmitting ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Publish Position Selector */}
            {showPublishModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-md max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col p-5 md:p-6 shadow-2xl relative">
                        <button
                            onClick={() => {
                                setShowPublishModal(null);
                                setSelectedFormId("");
                            }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        
                        <h2 className="text-lg font-bold text-white mb-2">Publish Posting</h2>
                        <p className="text-xs text-slate-400 leading-relaxed mb-6">
                            Before opening the job <strong>{showPublishModal.title}</strong> for public applications, please attach a named application form to collect custom fields.
                        </p>

                        <form onSubmit={handlePublishPosition} className="space-y-5 overflow-y-auto pr-1 flex-1 min-h-0">
                            {forms.length === 0 ? (
                                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl text-xs space-y-3">
                                    <div className="flex gap-2">
                                        <Info className="h-4 w-4 shrink-0" />
                                        <span>No application forms found. You must create at least one application form in the "Application Forms" tab before you can publish a job posting.</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPublishModal(null);
                                            setSubTab('forms');
                                        }}
                                        className="w-full bg-amber-500/25 hover:bg-amber-500/35 transition-colors text-white py-1.5 rounded-lg font-bold"
                                    >
                                        Go Create Form
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Select Application Form</label>
                                        <select
                                            required
                                            value={selectedFormId}
                                            onChange={e => setSelectedFormId(e.target.value)}
                                            className="w-full text-sm bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-cyan-500"
                                        >
                                            <option value="">Select a named form...</option>
                                            {forms.map(f => (
                                                <option key={f._id} value={f._id}>{f.name} ({f.customFields.length} fields)</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowPublishModal(null);
                                                setSelectedFormId("");
                                            }}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !selectedFormId}
                                            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
                                        >
                                            {isSubmitting ? "Publishing..." : "Attach & Publish"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Form Builder */}
            {showFormModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
                    <div className="w-full max-w-4xl max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-white/95 dark:bg-[#101830] border border-slate-200/80 dark:border-white/[0.10] rounded-[28px] shadow-[0_28px_90px_-24px_rgba(2,6,23,0.6)] relative">
                        <button
                            onClick={() => setShowFormModal(false)}
                            className="absolute top-4 right-4 h-9 w-9 rounded-xl border border-slate-300/80 dark:border-white/[0.12] bg-white/75 dark:bg-white/[0.04] text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.09] transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>

                        <div className="px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 dark:border-white/[0.07] bg-gradient-to-r from-slate-100/70 to-white dark:from-white/[0.03] dark:to-transparent">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                                {editingFormId ? "Edit Application Form" : "Create Application Form"}
                            </h2>
                            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Define questions and template documents with clear validation rules.</p>
                        </div>

                        <form onSubmit={handleSaveForm} className="space-y-6 overflow-y-auto px-5 md:px-7 pb-5 md:pb-7 pt-4 pr-2 flex-1 min-h-0">
                            <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/90 dark:bg-black/20 p-4 md:p-5">
                                <label className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Form Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    placeholder="e.g. Caregiver Application Form, Nurse Screening Quiz"
                                    className="w-full text-sm bg-white dark:bg-black/35 border border-slate-300/80 dark:border-white/10 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                />
                            </div>

                            {/* Dynamic Question Builder */}
                            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/20 p-4 md:p-5 space-y-4">
                                <h3 className="text-sm font-black tracking-wide text-slate-900 dark:text-white">Questions / Fields</h3>
                                
                                {formFields.length > 0 && (
                                    <div className="space-y-2 bg-white dark:bg-black/25 p-4 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500">
                                            Edit the wording, options, section, or required flag in place. Drag the handle (or use
                                            the arrows) to reorder — applicants see the questions in this order, and sections
                                            appear in the order their first question appears.
                                        </p>
                                        {formFields.map((field, idx) => {
                                            const rowSection = sectionOfField(field);
                                            const startsBlock = idx === 0 || sectionOfField(formFields[idx - 1]) !== rowSection;
                                            // A second block for a section the applicant already saw earlier.
                                            const isSplitBlock = startsBlock && (firstIndexBySection.get(rowSection) ?? idx) < idx;
                                            return (
                                            <div key={`${field.name}-${idx}`}>
                                            {startsBlock && (
                                                <div className={`flex items-center gap-2 flex-wrap px-1 ${idx === 0 ? 'pb-1.5' : 'pt-3 pb-1.5'}`}>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Step</span>
                                                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">{rowSection}</span>
                                                    {isSplitBlock && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                            Split — applicants see these merged into the earlier {rowSection} step
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <div
                                                draggable={armedDragIdx === idx}
                                                onDragStart={e => { setDragFieldIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
                                                onDragEnd={() => { setDragFieldIdx(null); setDragOverFieldIdx(null); setArmedDragIdx(null); }}
                                                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverFieldIdx !== idx) setDragOverFieldIdx(idx); }}
                                                onDrop={e => { e.preventDefault(); handleFieldDrop(idx); }}
                                                className={`flex items-start gap-3 text-xs bg-slate-100/85 dark:bg-white/[0.03] border p-3 rounded-xl transition-all ${
                                                    dragFieldIdx === idx
                                                        ? 'opacity-40 border-cyan-500/60'
                                                        : dragOverFieldIdx === idx && dragFieldIdx !== null
                                                            ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                                                            : 'border-slate-200 dark:border-white/[0.06]'
                                                }`}
                                            >
                                                <div className="shrink-0 flex items-center gap-1 pt-0.5">
                                                    <span
                                                        onMouseDown={() => setArmedDragIdx(idx)}
                                                        onMouseUp={() => setArmedDragIdx(null)}
                                                        title="Drag to reorder"
                                                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                    >
                                                        <GripVertical className="h-4 w-4" />
                                                    </span>
                                                    <span className="w-4 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500">{idx + 1}</span>
                                                    <div className="flex flex-col -space-y-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveField(idx, idx - 1)}
                                                            disabled={idx === 0}
                                                            title="Move up"
                                                            aria-label={`Move ${field.label} up`}
                                                            className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400"
                                                        >
                                                            <ChevronUp className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveField(idx, idx + 1)}
                                                            disabled={idx === formFields.length - 1}
                                                            title="Move down"
                                                            aria-label={`Move ${field.label} down`}
                                                            className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400"
                                                        >
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="min-w-0 flex-1 space-y-1.5">
                                                    <input
                                                        type="text"
                                                        value={field.label}
                                                        onChange={e => handleFieldChange(idx, { label: e.target.value })}
                                                        placeholder="Question label"
                                                        aria-label="Question label"
                                                        className="w-full text-[13px] font-bold bg-white dark:bg-black/30 border border-slate-200 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                                    />
                                                    {(field.type === 'select' || field.type === 'checkbox') && (
                                                        <input
                                                            type="text"
                                                            value={(field.options || []).join(', ')}
                                                            onChange={e => handleFieldChange(idx, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                                                            placeholder="Options (comma separated)"
                                                            aria-label="Options"
                                                            className="w-full text-[11px] bg-white dark:bg-black/30 border border-slate-200 dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                                        />
                                                    )}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-slate-200/70 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-300/60 dark:border-white/[0.08]">{field.type}</span>
                                                        <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">{field.name}</span>
                                                        <span className="inline-flex items-center gap-1">
                                                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Section</span>
                                                            <input
                                                                type="text"
                                                                list="form-section-suggestions"
                                                                value={field.section || ''}
                                                                onChange={e => handleFieldChange(idx, { section: e.target.value })}
                                                                placeholder={DEFAULT_SECTION}
                                                                className="w-36 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 outline-none focus:ring-1 focus:ring-cyan-500/40"
                                                            />
                                                        </span>
                                                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={field.required}
                                                                onChange={e => handleFieldChange(idx, { required: e.target.checked })}
                                                                className="h-3.5 w-3.5 rounded"
                                                            /> Required
                                                        </label>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveField(idx)}
                                                    className="shrink-0 text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 font-bold"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white dark:bg-black/25 p-4 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Field Key (No Spaces)</label>
                                        <input
                                            type="text"
                                            value={fieldName}
                                            onChange={e => setFieldName(normalizeFieldKey(e.target.value))}
                                            placeholder="years_experience"
                                            className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                        />
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500">Used internally in saved data. Spaces are converted to underscores automatically.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Display Question Label</label>
                                        <input
                                            type="text"
                                            value={fieldLabel}
                                            onChange={e => setFieldLabel(e.target.value)}
                                            placeholder="Years of Nursing Experience"
                                            className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                        />
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500">This is what applicants will see on the application form.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Input Type</label>
                                        <select
                                            value={fieldType}
                                            onChange={e => setFieldType(e.target.value as CustomField['type'])}
                                            className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                        >
                                            <option value="text">Short Answer</option>
                                            <option value="paragraph">Paragraph Text</option>
                                            <option value="number">Number Input</option>
                                            <option value="date">Date Picker</option>
                                            <option value="select">Dropdown Selection</option>
                                            <option value="checkbox">Checkbox Selections</option>
                                            <option value="file">File Upload Link</option>
                                        </select>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500">Choose the answer format you want from applicants.</p>
                                    </div>

                                    <div className="space-y-1.5 col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Section</label>
                                        <input
                                            type="text"
                                            list="form-section-suggestions"
                                            value={fieldSection}
                                            onChange={e => setFieldSection(e.target.value)}
                                            placeholder="e.g. Personal details"
                                            className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                        />
                                        <datalist id="form-section-suggestions">
                                            {Array.from(new Set([...SECTION_SUGGESTIONS, ...formFields.map(f => f.section).filter(Boolean) as string[]])).map(s => (
                                                <option key={s} value={s} />
                                            ))}
                                        </datalist>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500">Questions with the same section are shown together as one step on the application form.</p>
                                    </div>

                                    {(fieldType === 'select' || fieldType === 'checkbox') && (
                                        <div className="space-y-1.5 col-span-2">
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dropdown/Checkbox Options (Comma separated)</label>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-500">Tip: include <span className="font-mono font-bold">Other</span> to let applicants type a value that isn’t listed.</p>
                                            <input
                                                type="text"
                                                value={fieldOptionsRaw}
                                                onChange={e => setFieldOptionsRaw(e.target.value)}
                                                placeholder="Yes, No, Other"
                                                className="w-full text-sm bg-white dark:bg-black/40 border border-slate-300/80 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                            />
                                            {(() => {
                                                const opts = fieldOptionsRaw.split(',').map(o => o.trim()).filter(Boolean);
                                                return opts.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1 pt-1">
                                                        {opts.map((opt, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded-md text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">{opt}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-500 pt-1">Options preview appears here as you type.</p>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-4 col-span-2">
                                        <input
                                            type="checkbox"
                                            id="fieldRequired"
                                            checked={fieldRequired}
                                            onChange={e => setFieldRequired(e.target.checked)}
                                            className="h-4 w-4 text-cyan-500 bg-white dark:bg-black border-slate-300 dark:border-white/10 rounded focus:ring-cyan-500"
                                        />
                                        <label htmlFor="fieldRequired" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase cursor-pointer">Required Field</label>
                                    </div>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-500 col-span-2">If enabled, applicants must answer this before submitting.</p>

                                    <div className="col-span-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleAddField}
                                            disabled={!fieldName || !fieldLabel}
                                            className="bg-slate-900 hover:bg-slate-800 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] disabled:opacity-40 text-white dark:text-white font-bold text-xs px-4 py-2 rounded-xl border border-transparent dark:border-white/[0.10] transition-colors"
                                        >
                                            Add Question
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/20 p-4 md:p-5 space-y-4">
                                <div>
                                    <h3 className="text-sm font-black tracking-wide text-slate-900 dark:text-white">Required Documents</h3>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        Documents are now managed centrally in <span className="font-bold">Compliance → Requirements</span>. Any
                                        requirement marked <span className="font-bold">“Collect on job application forms”</span> is attached automatically —
                                        global ones to every form, and position-targeted ones to jobs for that position. This form only defines the
                                        questions above.
                                    </p>
                                </div>

                                {catalogAppDocs.length > 0 ? (
                                    <div className="space-y-2 bg-white dark:bg-black/25 p-4 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
                                        {catalogAppDocs.map((doc) => {
                                            const positioned = doc.appliesToPositions.length > 0;
                                            const global = doc.appliesToAll;
                                            return (
                                                <div key={doc.key} className="flex justify-between items-center text-xs bg-slate-100/85 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-2.5 rounded-xl gap-3">
                                                    <div>
                                                        <span className="font-bold text-slate-800 dark:text-slate-300">{doc.label}</span>
                                                        <span className="text-slate-500 ml-2 font-mono">({doc.key})</span>
                                                        <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${doc.isMandatory ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-white/[0.03] text-slate-400 border border-white/[0.08]'}`}>
                                                            {doc.isMandatory ? 'required' : 'optional'}
                                                        </span>
                                                        <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${doc.evidenceMode !== 'metadata_only' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
                                                            {doc.evidenceMode !== 'metadata_only' ? 'file upload' : 'metadata only'}
                                                        </span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                                        {global ? 'all forms' : positioned ? 'by position' : 'not targeted'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="bg-white dark:bg-black/25 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400">
                                        No requirements are set to collect on application yet. Add them in Compliance → Requirements.
                                    </div>
                                )}
                            </div>

                            <div className="sticky bottom-0 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/[0.07] bg-gradient-to-t from-white dark:from-slate-900 via-white/95 dark:via-slate-900/95 to-transparent">
                                <button
                                    type="button"
                                    onClick={() => setShowFormModal(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.03]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !formFields.length}
                                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20"
                                >
                                    {isSubmitting ? "Saving Form..." : "Save Application Form"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Application Review Detail */}
            {selectedApplication && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-3 md:p-6"
                    onClick={() => setSelectedApplication(null)}
                >
                    <div
                        className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-4xl h-[calc(100vh-1.5rem)] md:h-[calc(100vh-3rem)] overflow-hidden flex flex-col relative shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >

                        {/* Title Bar */}
                        <div className="px-6 py-4 border-b border-border-card bg-surface-card/40 shrink-0 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-11 w-11 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                                    <span className="text-sm font-black text-brand-primary">
                                        {selectedApplication.applicantName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-black text-text-primary truncate">{selectedApplication.applicantName}</h2>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-xs text-text-muted truncate">{selectedApplication.jobTitle || 'Application'}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${APPLICATION_STATUS_META[selectedApplication.status].badge}`}>
                                            {APPLICATION_STATUS_META[selectedApplication.status].label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={handleExportApplicationPdf}
                                    disabled={isExportingPdf}
                                    className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20 text-brand-primary text-xs font-bold transition-colors disabled:opacity-50"
                                    title="Export application to PDF"
                                >
                                    {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
                                </button>
                                <button
                                    onClick={() => setSelectedApplication(null)}
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-border-card bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-card/60 transition-colors"
                                    aria-label="Close application review"
                                    title="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body Scroll */}
                        <div className="p-5 md:p-8 overflow-y-auto flex-1 min-h-0 space-y-6">
                            
                            {/* Layout Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                
                                {/* Info & Answers */}
                                <div className="lg:col-span-2 space-y-6">
                                    {/* Candidate Card */}
                                    <div className="crm-panel p-5 rounded-2xl space-y-4">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                            <User className="h-4 w-4 text-brand-primary" /> Candidate Profile
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Full Name</span>
                                                <span className="font-bold text-text-primary text-sm">{selectedApplication.applicantName}</span>
                                            </div>
                                            <div className="space-y-0.5 min-w-0">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Email Address</span>
                                                <a href={`mailto:${selectedApplication.applicantEmail}`} className="font-bold text-text-primary text-sm flex items-center gap-1.5 hover:text-brand-primary transition-colors truncate">
                                                    <Mail className="h-3.5 w-3.5 text-text-muted shrink-0" /> <span className="truncate">{selectedApplication.applicantEmail}</span>
                                                </a>
                                            </div>
                                            <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Applied For</span>
                                                <span className="font-bold text-text-primary text-sm">{selectedApplication.jobTitle || '—'}</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Submitted</span>
                                                <span className="font-bold text-text-primary text-sm">{selectedApplication.createdAt ? new Date(selectedApplication.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Answers */}
                                    <div className="space-y-3">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                            <FileText className="h-4 w-4 text-brand-primary" /> Questionnaire Responses
                                        </h3>

                                        {selectedApplication.customFields && selectedApplication.customFields.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                {selectedApplication.customFields.map((field) => {
                                                    const rawVal = selectedApplication.customFieldValues[field.name];
                                                    const isFile = field.type === 'file' && typeof rawVal === 'string' && rawVal.startsWith('http');
                                                    const isEmpty = rawVal === undefined || rawVal === null || rawVal === '';
                                                    // Long-form answers (paragraph / long text) span the full width.
                                                    const isWide = field.type === 'paragraph' || (typeof rawVal === 'string' && rawVal.length > 60);
                                                    const displayVal = Array.isArray(rawVal) ? rawVal.join(', ') : rawVal;

                                                    return (
                                                        <div
                                                            key={field.name}
                                                            className={`ui-card-soft rounded-xl px-3.5 py-2.5 space-y-1 ${isWide ? 'sm:col-span-2' : ''}`}
                                                        >
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">{field.label}</span>
                                                            <div className="text-sm font-semibold text-text-primary whitespace-pre-wrap leading-relaxed break-words">
                                                                {isFile ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openAdminFile(rawVal, field.label || 'Document')}
                                                                        className="inline-flex items-center gap-1.5 text-brand-primary hover:text-brand-primary-dark font-bold transition-colors"
                                                                    >
                                                                        <FileText className="h-3.5 w-3.5" /> View uploaded document
                                                                    </button>
                                                                ) : isEmpty ? (
                                                                    <span className="text-text-muted italic font-normal">No answer provided</span>
                                                                ) : (
                                                                    displayVal
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="crm-panel rounded-2xl p-5 text-xs text-text-muted italic text-center">No questionnaire fields configured.</div>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                            <ClipboardList className="h-4 w-4 text-brand-primary" /> Submitted Documents
                                        </h3>

                                        <div className="crm-panel p-5 rounded-2xl space-y-4">
                                            {isLoadingApplicationDocuments ? (
                                                <div className="flex items-center gap-2 text-text-muted text-xs py-2">
                                                    <Loader2 className="h-4 w-4 animate-spin text-brand-primary" /> Loading documents...
                                                </div>
                                            ) : applicationDocumentsError ? (
                                                <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{applicationDocumentsError}</div>
                                            ) : selectedApplicationDocuments.length > 0 ? (
                                                selectedApplicationDocuments.map((doc) => (
                                                    <div key={doc._id} className="border-b last:border-0 border-border-card pb-4 last:pb-0 space-y-2">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <span className="text-[11px] font-bold text-text-primary uppercase block">{getDocumentLabel(doc.documentType)}</span>
                                                                <span className="text-[10px] text-text-muted uppercase tracking-wider">{doc.deliveryMethod === 'email' ? 'Email submission' : 'Uploaded file'}</span>
                                                                <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${docIsMetadataOnly(doc.documentType) ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'}`}>
                                                                    {docIsMetadataOnly(doc.documentType) ? 'Metadata only' : 'File upload'}
                                                                </span>
                                                            </div>
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${doc.status === 'verified' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : doc.status === 'rejected' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : doc.status === 'expired' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                                                                {doc.status.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                            <div>
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                                                                    {docIsMetadataOnly(doc.documentType) ? 'Recorded value' : 'File'}
                                                                </span>
                                                                {doc.fileUrl ? (
                                                                    <button type="button" onClick={() => openAdminFile(doc.fileUrl, doc.fileName || 'Document')} className="font-bold text-brand-primary hover:text-brand-primary-dark break-all transition-colors text-left inline-flex items-center gap-1">
                                                                        <Eye className="h-3.5 w-3.5 shrink-0" /> {doc.fileName || 'Open file'}
                                                                    </button>
                                                                ) : docIsMetadataOnly(doc.documentType) ? (
                                                                    doc.value ? (
                                                                        <span className="font-bold text-text-primary break-all">{doc.value}</span>
                                                                    ) : (
                                                                        <span className="font-semibold text-text-muted italic">Metadata-only document. No value recorded yet.</span>
                                                                    )
                                                                ) : (
                                                                    <span className="font-semibold text-text-muted italic">No file attached yet</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Expiry Date</span>
                                                                <span className="font-semibold text-text-secondary">
                                                                    {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'Not set'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Admin Reverification Date</label>
                                                                <input
                                                                    type="date"
                                                                    value={documentExpiryDrafts[doc._id] || ""}
                                                                    onChange={(e) => setDocumentExpiryDrafts(prev => ({ ...prev, [doc._id]: e.target.value }))}
                                                                    // Open the native picker on a click anywhere in the field, not just the calendar icon.
                                                                    onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                                                                    className="ui-input w-full text-xs cursor-pointer"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap md:justify-end">
                                                                {!docIsMetadataOnly(doc.documentType) && (
                                                                    <>
                                                                        <input
                                                                            id={`admin-upload-${doc._id}`}
                                                                            type="file"
                                                                            className="hidden"
                                                                            onChange={(e) => {
                                                                                void handleAdminUploadDocument(doc.documentType, e.target.files?.[0] || null);
                                                                                e.currentTarget.value = '';
                                                                            }}
                                                                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                                                                        />
                                                                        <label
                                                                            htmlFor={`admin-upload-${doc._id}`}
                                                                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/15 transition-colors cursor-pointer"
                                                                        >
                                                                            {uploadingAdminDocumentType === doc.documentType ? 'Uploading...' : 'Upload file'}
                                                                        </label>
                                                                    </>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDocumentReviewAction(doc._id, 'verify')}
                                                                    disabled={savingDocumentId === doc._id}
                                                                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-60"
                                                                >
                                                                    {savingDocumentId === doc._id ? 'Saving...' : 'Verify'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDocumentReviewAction(doc._id, 'reject', 'Rejected by admin')}
                                                                    disabled={savingDocumentId === doc._id}
                                                                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/15 transition-colors disabled:opacity-60"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-text-muted italic text-center py-4">No application documents uploaded.</div>
                                            )}

                                            {/* Requirements this applicant has not provided — including ones
                                                added to the compliance catalog after they applied. */}
                                            {!isLoadingApplicationDocuments && missingApplicationRequirements.length > 0 && (
                                                <div className="pt-4 border-t border-border-card space-y-2">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Outstanding requirements</p>
                                                    {missingApplicationRequirements.map((req) => (
                                                        <div key={req.documentType} className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                                                            <div className="min-w-0">
                                                                <span className="text-[11px] font-bold text-text-primary uppercase block">{req.label || getDocumentLabel(req.documentType)}</span>
                                                                <span className="text-[9px] text-text-muted uppercase tracking-wider">{req.requiresFile ? 'File upload' : 'Recorded value'}</span>
                                                            </div>
                                                            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${req.required ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-white/5 text-text-secondary border-border-card'}`}>
                                                                {req.required ? 'Required · not provided' : 'Optional · not provided'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    <p className="text-[10px] text-text-muted">Set the application to <span className="font-bold">Request Changes</span> to let the candidate provide these.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Review Actions & Notes */}
                                <div className="space-y-6">
                                    {/* Action Status Block */}
                                    <div className="crm-panel p-5 rounded-2xl space-y-4">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-text-muted">Application State</h3>

                                        <div className="grid grid-cols-2 gap-2">
                                            {([
                                                { status: 'reviewed' as const, label: 'Reviewed', color: 'hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' },
                                                { status: 'shortlisted' as const, label: 'Shortlist', color: 'hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
                                                { status: 'changes_requested' as const, label: 'Request Changes', color: 'hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
                                                { status: 'accepted' as const, label: 'Accept', color: 'hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
                                                { status: 'rejected' as const, label: 'Reject', color: 'hover:bg-rose-500/10 text-rose-500 border-rose-500/30' },
                                            ]).map(cfg => (
                                                <button
                                                    key={cfg.status}
                                                    onClick={() => setStatusConfirm({ id: selectedApplication._id, status: cfg.status, label: cfg.label })}
                                                    className={`py-2 px-2 rounded-xl text-[10px] font-bold border transition-all active:scale-95 text-center flex items-center justify-center ${
                                                        selectedApplication.status === cfg.status
                                                            ? cfg.status === 'accepted' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20' :
                                                              cfg.status === 'rejected' ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20' :
                                                              cfg.status === 'changes_requested' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' :
                                                              cfg.status === 'shortlisted' ? 'bg-cyan-500 text-white border-cyan-500 shadow-md shadow-cyan-500/20' :
                                                              'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-500/20'
                                                            : `ui-card-soft ${cfg.color}`
                                                    }`}
                                                >
                                                    {cfg.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Review Notes Form */}
                                    <div className="crm-panel p-5 rounded-2xl space-y-4">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                            <MessageSquare className="h-3.5 w-3.5 text-brand-primary" /> Reviewer Notes
                                        </h3>

                                        <form onSubmit={handleAddNote} className="space-y-3">
                                            <textarea
                                                required
                                                rows={3}
                                                value={noteText}
                                                onChange={e => setNoteText(e.target.value)}
                                                placeholder="Add internal feedback note..."
                                                className="ui-input w-full text-xs resize-none"
                                            />
                                            <button
                                                type="submit"
                                                disabled={isSavingNote || !noteText.trim()}
                                                className="w-full bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl transition-all active:scale-95"
                                            >
                                                {isSavingNote ? "Saving..." : "Add Note"}
                                            </button>
                                        </form>

                                        {/* Notes List */}
                                        <div className="space-y-2 max-h-56 overflow-y-auto pt-3 border-t border-border-card">
                                            {selectedApplication.notes && selectedApplication.notes.length > 0 ? (
                                                selectedApplication.notes.map((note) => (
                                                    <div key={note._id} className="ui-card-soft p-3 rounded-xl text-xs space-y-1">
                                                        <div className="flex justify-between text-[9px] text-text-muted">
                                                            <span className="font-bold text-text-secondary">{note.author}</span>
                                                            <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        <p className="text-text-secondary leading-normal">{note.text}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-text-muted italic text-center py-4">No internal notes logged.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Theme Confirmation Dialog */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center space-y-4">
                        <div className="h-12 w-12 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto">
                            <AlertCircle className="h-6 w-6 text-rose-500 animate-pulse" />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-base font-bold text-text-primary">Confirm Deletion</h3>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                {deleteConfirm.message}
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-text-secondary dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl border border-sidebar-border transition-all active:scale-95 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const { id, type } = deleteConfirm;
                                    setDeleteConfirm(null);
                                    if (type === 'job') {
                                        await handleDeleteJob(id);
                                    } else if (type === 'form') {
                                        await handleDeleteForm(id);
                                    } else {
                                        await handleDeleteApplication(id);
                                    }
                                }}
                                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-lg shadow-rose-500/20 active:scale-95 cursor-pointer"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm any application state change before it happens */}
            {statusConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center space-y-4">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center mx-auto border ${
                            statusConfirm.status === 'accepted' ? 'bg-emerald-500/10 border-emerald-500/20' :
                            statusConfirm.status === 'rejected' ? 'bg-rose-500/10 border-rose-500/20' :
                            'bg-cyan-500/10 border-cyan-500/20'
                        }`}>
                            <AlertCircle className={`h-6 w-6 ${
                                statusConfirm.status === 'accepted' ? 'text-emerald-500' :
                                statusConfirm.status === 'rejected' ? 'text-rose-500' :
                                'text-cyan-500'
                            }`} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-base font-bold text-text-primary">Confirm status change</h3>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                Set this application to <span className="font-bold text-text-primary">{statusConfirm.label}</span>?
                                {statusConfirm.status === 'accepted' && ' The applicant will be accepted and their verified documents linked to their staff compliance record.'}
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStatusConfirm(null)}
                                className="flex-1 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-text-secondary dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl border border-sidebar-border transition-all active:scale-95 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const { id, status, label } = statusConfirm;
                                    setStatusConfirm(null);
                                    handleStatusUpdate(id, status, label);
                                }}
                                className={`flex-1 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer ${
                                    statusConfirm.status === 'accepted' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' :
                                    statusConfirm.status === 'rejected' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' :
                                    'bg-cyan-500 hover:bg-cyan-600 shadow-cyan-500/20'
                                }`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Theme Alert Dialog */}
            {customAlert && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center space-y-4">
                        <div className="h-12 w-12 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center mx-auto">
                            <Info className="h-6 w-6 text-cyan-500" />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-base font-bold text-text-primary">{customAlert.title}</h3>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                {customAlert.message}
                            </p>
                        </div>
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setCustomAlert(null)}
                                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* In-page file viewer for submitted documents (streamed via /api/admin/file). */}
            {viewerFile && (() => {
                const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(viewerFile.name || '');
                return (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setViewerFile(null)}>
                        <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-border-modal bg-surface-modal shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-modal">
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
