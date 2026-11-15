export type UserRole = 'admin' | 'member' | 'client';

export type ClientOnboardingStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'overdue'
  | 'archived';

export type InvitationStatus =
  | 'pending'
  | 'sent'
  | 'accepted'
  | 'expired'
  | 'revoked';

export type OnboardingSectionKey =
  | 'company_info'
  | 'brand_assets'
  | 'website_content'
  | 'project_requirements'
  | 'access_credentials'
  | 'additional_documents';

export type SectionCompletionStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_revision';

export type AssetCategory =
  | 'primary_logo'
  | 'secondary_logo'
  | 'brand_icon'
  | 'brand_guidelines'
  | 'website_media'
  | 'additional_document';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agencyId: string;
  agencyName: string;
  clientId?: string | null;
  title?: string;
}

export interface AgencySettings {
  id: string;
  name: string;
  supportEmail: string;
  website: string;
  primaryColor: string;
  defaultInviteExpiryDays: number;
  sessionDurationHours: number;
  notifyOnSubmission: boolean;
  notifyOnAssetUpload: boolean;
  requiredSections: OnboardingSectionKey[];
}

export interface TeamMember {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  title: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ProgressSummary {
  overallPercentage: number;
  completedSections: number;
  totalSections: number;
  requiredSectionsCount: number;
  missingRequiredItems: {
    sectionKey: OnboardingSectionKey;
    sectionTitle: string;
    fieldLabel: string;
  }[];
  pendingAssetSlots: {
    category: AssetCategory;
    label: string;
  }[];
  lastActivityAt: string | null;
}

export interface ClientRecord {
  id: string;
  agencyId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  description: string;
  internalNotes: string;
  status: ClientOnboardingStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  progress: ProgressSummary;
  latestInvitationStatus: InvitationStatus | null;
}

export interface InvitationRecord {
  id: string;
  agencyId: string;
  clientId: string;
  clientName?: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  portalPreviewUrl?: string;
  emailDelivery?: {
    configured: boolean;
    delivered: boolean;
    reason?: string;
  };
}

export interface CompanyInfoData {
  companyName: string;
  businessDescription: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  businessAddress: string;
  socialLinks: {
    linkedin: string;
    instagram: string;
    twitter: string;
    facebook: string;
  };
}

export interface BrandAssetsData {
  brandColors: string[];
  typographyNotes: string;
  designReferences: string;
  brandVoiceNotes: string;
}

export interface WebsiteContentData {
  homepageCopy: string;
  aboutCopy: string;
  servicesCopy: string;
  contactPageCopy: string;
  existingWebsiteRefs: string;
}

export interface ProjectRequirementsData {
  projectGoals: string;
  requiredFeatures: string;
  designPreferences: string;
  functionalRequirements: string;
  referenceWebsites: string;
  targetDeadline: string;
  additionalInstructions: string;
}

export interface AccessCredentialsMetaData {
  accessMethodPreference: string;
  delegatedAccessNotes: string;
  confirmedSecurityReview: boolean;
}

export interface AdditionalDocumentsMetaData {
  documentNotes: string;
  noAdditionalDocsNeeded: boolean;
}

export type SectionPayloadMap = {
  company_info: CompanyInfoData;
  brand_assets: BrandAssetsData;
  website_content: WebsiteContentData;
  project_requirements: ProjectRequirementsData;
  access_credentials: AccessCredentialsMetaData;
  additional_documents: AdditionalDocumentsMetaData;
};

export type AnySectionData = SectionPayloadMap[OnboardingSectionKey];

export interface CreateClientInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  industry: string;
  description?: string;
  internalNotes?: string;
  assignedToId?: string | null;
  dueDate?: string | null;
}

export type UpdateClientPatch = Partial<CreateClientInput> & {
  status?: ClientOnboardingStatus;
};

export interface OnboardingSectionState<K extends OnboardingSectionKey = OnboardingSectionKey> {
  sectionKey: K;
  title: string;
  description: string;
  required: boolean;
  status: SectionCompletionStatus;
  data: SectionPayloadMap[K];
  reviewerNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
}

export interface CredentialSummary {
  id: string;
  clientId: string;
  serviceName: string;
  category: 'hosting' | 'domain' | 'cms' | 'analytics' | 'other';
  accessType: 'delegated_invite' | 'temporary_token' | 'username_password';
  loginUrl: string;
  usernameMasked: string;
  notes: string;
  createdByRole: UserRole;
  createdAt: string;
  lastRevealedAt: string | null;
}

export interface RevealedCredential {
  id: string;
  username: string;
  secretValue: string;
  revealedAt: string;
}

export interface AssetRecord {
  id: string;
  agencyId: string;
  clientId: string;
  clientName?: string;
  category: AssetCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fileFormat?: string;
  resourceType?: 'image' | 'video' | 'raw';
  description?: string;
  sectionKey?: OnboardingSectionKey | null;
  storageProvider?: 'cloudinary' | 'legacy_pending';
  uploadedByName: string;
  uploadedByRole: UserRole;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ActivityLogRecord {
  id: string;
  agencyId: string;
  clientId: string | null;
  clientName: string | null;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  agencyId: string;
  clientId: string | null;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PendingRequirementSummary {
  clientId: string;
  companyName: string;
  status: ClientOnboardingStatus;
  dueDate: string | null;
  missingCount: number;
  nextRequirementLabel: string;
  nextSectionKey: OnboardingSectionKey;
}

export interface DashboardOverview {
  stats: {
    totalClients: number;
    activeOnboardings: number;
    completedOnboardings: number;
    pendingOnboardings: number;
    overdueOnboardings: number;
    averageCompletion: number;
    totalAssets: number;
  };
  statusDistribution: {
    status: ClientOnboardingStatus;
    label: string;
    count: number;
  }[];
  sectionCompletionRates: {
    sectionKey: OnboardingSectionKey;
    title: string;
    completedCount: number;
    totalClients: number;
    percentage: number;
  }[];
  recentClients: ClientRecord[];
  pendingRequirements: PendingRequirementSummary[];
  recentAssets: AssetRecord[];
  recentActivity: ActivityLogRecord[];
}
