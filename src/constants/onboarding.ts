import type {
  AssetCategory,
  ClientOnboardingStatus,
  InvitationStatus,
  OnboardingSectionKey,
  SectionCompletionStatus,
  SectionPayloadMap,
} from '../types';

export interface SectionDefinition {
  key: OnboardingSectionKey;
  title: string;
  shortTitle: string;
  description: string;
  requiredFields: { path: string; label: string }[];
  requiredAssetCategories?: { category: AssetCategory; label: string }[];
}

export const ONBOARDING_SECTIONS: SectionDefinition[] = [
  {
    key: 'company_info',
    title: 'Company Information',
    shortTitle: 'Company',
    description: 'Core business profile, primary point of contact, address, and official social links.',
    requiredFields: [
      { path: 'companyName', label: 'Company name' },
      { path: 'businessDescription', label: 'Business description' },
      { path: 'industry', label: 'Industry' },
      { path: 'contactName', label: 'Primary contact name' },
      { path: 'contactEmail', label: 'Contact email' },
    ],
  },
  {
    key: 'brand_assets',
    title: 'Brand Assets',
    shortTitle: 'Brand',
    description: 'Logos, brand guidelines, official color palette, typography, and visual references.',
    requiredFields: [
      { path: 'brandColors', label: 'Brand color palette' },
      { path: 'typographyNotes', label: 'Typography guidelines' },
    ],
    requiredAssetCategories: [
      { category: 'primary_logo', label: 'Primary Logo' },
    ],
  },
  {
    key: 'website_content',
    title: 'Website Content',
    shortTitle: 'Content',
    description: 'Copywriting for key pages, service descriptions, and supporting media assets.',
    requiredFields: [
      { path: 'homepageCopy', label: 'Homepage messaging' },
      { path: 'aboutCopy', label: 'About section copy' },
      { path: 'servicesCopy', label: 'Services overview' },
    ],
  },
  {
    key: 'project_requirements',
    title: 'Project Requirements',
    shortTitle: 'Requirements',
    description: 'Project objectives, core functionality, reference sites, and target launch dates.',
    requiredFields: [
      { path: 'projectGoals', label: 'Project goals' },
      { path: 'requiredFeatures', label: 'Required features' },
      { path: 'targetDeadline', label: 'Target deadline' },
    ],
  },
  {
    key: 'access_credentials',
    title: 'Access & Credentials',
    shortTitle: 'Access',
    description: 'Encrypted credentials or delegated collaborator access for hosting, DNS, and CMS.',
    requiredFields: [
      { path: 'accessMethodPreference', label: 'Access preference' },
    ],
  },
  {
    key: 'additional_documents',
    title: 'Additional Documents',
    shortTitle: 'Documents',
    description: 'Signed agreements, compliance PDFs, sitemaps, or supplemental project briefs.',
    requiredFields: [],
  },
];

export const DEFAULT_SECTION_DATA: SectionPayloadMap = {
  company_info: {
    companyName: '',
    businessDescription: '',
    industry: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    businessAddress: '',
    socialLinks: {
      linkedin: '',
      instagram: '',
      twitter: '',
      facebook: '',
    },
  },
  brand_assets: {
    brandColors: ['#191A1D', '#EDA320'],
    typographyNotes: '',
    designReferences: '',
    brandVoiceNotes: '',
  },
  website_content: {
    homepageCopy: '',
    aboutCopy: '',
    servicesCopy: '',
    contactPageCopy: '',
    existingWebsiteRefs: '',
  },
  project_requirements: {
    projectGoals: '',
    requiredFeatures: '',
    designPreferences: '',
    functionalRequirements: '',
    referenceWebsites: '',
    targetDeadline: '',
    additionalInstructions: '',
  },
  access_credentials: {
    accessMethodPreference: 'delegated_invite',
    delegatedAccessNotes: '',
    confirmedSecurityReview: false,
  },
  additional_documents: {
    documentNotes: '',
    noAdditionalDocsNeeded: false,
  },
};

export const CLIENT_STATUS_LABELS: Record<ClientOnboardingStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  completed: 'Completed',
  overdue: 'Overdue',
  archived: 'Archived',
};

export const SECTION_STATUS_LABELS: Record<SectionCompletionStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'Draft Saved',
  completed: 'Submitted',
  needs_revision: 'Needs Revision',
};

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  primary_logo: 'Primary Logo',
  secondary_logo: 'Secondary Logo',
  brand_icon: 'Brand Icon',
  brand_guidelines: 'Brand Guidelines',
  website_media: 'Website Media',
  additional_document: 'Additional Document',
};

export function getNestedObjectValue(obj: object, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function isOnboardingValueFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
