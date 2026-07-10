import type { DocumentType } from '@/models/ApplicationDocument';

export interface DocumentMetadata {
  label: string;
  description: string;
  mandatory: boolean;
  defaultOnApplication: boolean;
  emailOnly: boolean;
  storageMode: 'file' | 'metadata_only';
  requiresExpiry: boolean;
  expiryCheckDays?: number; // days to consider for "soon to expire"
}

export const DOCUMENT_METADATA: Record<DocumentType, DocumentMetadata> = {
  practicing_license: {
    label: 'Practicing License',
    description: 'Active professional/medical license',
    mandatory: true,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 30,
  },
  certification: {
    label: 'Certifications',
    description: 'Relevant professional certifications',
    mandatory: true,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 30,
  },
  state_id: {
    label: 'State ID or Driving License',
    description: 'Valid government-issued ID (re-verified on expiry)',
    mandatory: true,
    defaultOnApplication: false,
    emailOnly: true,
    storageMode: 'metadata_only',
    requiresExpiry: true,
    expiryCheckDays: 60,
  },
  work_authorization: {
    label: 'Work Authorization',
    description: 'Work Permit, Green Card, or US Passport',
    mandatory: true,
    defaultOnApplication: false,
    emailOnly: true,
    storageMode: 'metadata_only',
    requiresExpiry: true,
    expiryCheckDays: 60,
  },
  tb_test: {
    label: 'TB Test',
    description: 'Tuberculosis clearance certificate',
    mandatory: true,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 365, // Typically annual
  },
  hepatitis_ab: {
    label: 'Hepatitis A/B Vaccination',
    description: 'Hepatitis A and/or B vaccination records',
    mandatory: false,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 365,
  },
  first_aid_cpr_bls: {
    label: 'First Aid/CPR/BLS Certification',
    description: 'Current First Aid, CPR, or BLS certification',
    mandatory: true,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 60,
  },
  car_insurance: {
    label: 'Car Insurance',
    description: 'Active vehicle insurance (if role requires travel)',
    mandatory: false,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 30,
  },
  food_handlers: {
    label: 'Food Handlers Certificate',
    description: 'Food safety and handling certification',
    mandatory: true,
    defaultOnApplication: true,
    emailOnly: false,
    storageMode: 'file',
    requiresExpiry: true,
    expiryCheckDays: 365,
  },
  ssn: {
    label: 'Social Security Number (SSN)',
    description: 'Tax ID verification document',
    mandatory: true,
    defaultOnApplication: false,
    emailOnly: true,
    storageMode: 'metadata_only',
    requiresExpiry: false,
  },
};

export function getDocumentLabel(docType: DocumentType): string {
  return DOCUMENT_METADATA[docType]?.label || docType;
}

export function isMandatory(docType: DocumentType): boolean {
  return DOCUMENT_METADATA[docType]?.mandatory ?? false;
}

export function isExpiringDocument(docType: DocumentType): boolean {
  return DOCUMENT_METADATA[docType]?.requiresExpiry ?? false;
}

export function getExpiryCheckDays(docType: DocumentType): number {
  return DOCUMENT_METADATA[docType]?.expiryCheckDays ?? 30;
}

export function classifyDocuments(): {
  mandatory: DocumentType[];
  optional: DocumentType[];
  expiring: DocumentType[];
  nonExpiring: DocumentType[];
  defaultOnApplication: DocumentType[];
  emailOnly: DocumentType[];
} {
  const entries = Object.entries(DOCUMENT_METADATA) as [DocumentType, DocumentMetadata][];
  
  return {
    mandatory: entries.filter(([_, meta]) => meta.mandatory).map(([type]) => type),
    optional: entries.filter(([_, meta]) => !meta.mandatory).map(([type]) => type),
    expiring: entries.filter(([_, meta]) => meta.requiresExpiry).map(([type]) => type),
    nonExpiring: entries.filter(([_, meta]) => !meta.requiresExpiry).map(([type]) => type),
    defaultOnApplication: entries.filter(([_, meta]) => meta.defaultOnApplication).map(([type]) => type),
    emailOnly: entries.filter(([_, meta]) => meta.emailOnly).map(([type]) => type),
  };
}

export function getDefaultApplicationDocuments(): DocumentType[] {
  return classifyDocuments().defaultOnApplication;
}

export function getEmailOnlyDocuments(): DocumentType[] {
  return classifyDocuments().emailOnly;
}

export function usesMetadataOnlyStorage(docType: DocumentType): boolean {
  return DOCUMENT_METADATA[docType]?.storageMode === 'metadata_only';
}

export function requiresFileUpload(docType: DocumentType): boolean {
  return DOCUMENT_METADATA[docType]?.storageMode !== 'metadata_only';
}
