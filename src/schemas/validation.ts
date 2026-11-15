import { z } from 'zod';

const DANGEROUS_URI_SCHEME_PATTERN = /^\s*(javascript|vbscript|data)\s*:/i;

function safeUrlField(maxLen: number) {
  return z
    .string()
    .trim()
    .max(maxLen)
    .refine(
      (val) => {
        if (!val) return true;
        if (DANGEROUS_URI_SCHEME_PATTERN.test(val)) return false;
        if (val.includes('://')) {
          return /^https?:\/\//i.test(val);
        }
        return true;
      },
      { message: 'URL must use http:// or https:// and cannot contain unsafe schemes' },
    );
}

export const clientStatusEnum = z.enum([
  'pending',
  'in_progress',
  'in_review',
  'completed',
  'overdue',
  'archived',
]);

export const sectionKeyEnum = z.enum([
  'company_info',
  'brand_assets',
  'website_content',
  'project_requirements',
  'access_credentials',
  'additional_documents',
]);

export const assetCategoryEnum = z.enum([
  'primary_logo',
  'secondary_logo',
  'brand_icon',
  'brand_guidelines',
  'website_media',
  'additional_document',
]);

export const requestMagicLinkSchema = z.object({
  email: z.string().trim().email('Enter a valid work email address').max(160),
});

export const registerAgencySchema = z.object({
  agencyName: z.string().trim().min(2, 'Agency name must be at least 2 characters').max(120),
  ownerName: z.string().trim().min(2, 'Your name is required').max(120),
  email: z.string().trim().email('Enter a valid email address').max(160),
});

export const createClientSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(140),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  email: z.string().trim().email('Enter a valid client email').max(160),
  phone: z.string().trim().max(40).optional().default(''),
  website: safeUrlField(240).optional().default(''),
  industry: z.string().trim().min(2, 'Industry is required').max(100),
  description: z.string().trim().max(2000).optional().default(''),
  internalNotes: z.string().trim().max(4000).optional().default(''),
  assignedToId: z.string().trim().nullable().optional(),
  dueDate: z.string().trim().nullable().optional(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  status: clientStatusEnum.optional(),
});

export const invitationCreateSchema = z.object({
  clientId: z.string().trim().min(1, 'Client is required'),
  expiresInDays: z.number().int().min(1).max(60).optional().default(14),
  sendEmail: z.boolean().optional().default(true),
});

export const companyInfoSchema = z.object({
  companyName: z.string().trim().max(160),
  businessDescription: z.string().trim().max(3000),
  industry: z.string().trim().max(120),
  contactName: z.string().trim().max(120),
  contactEmail: z.string().trim().max(160),
  contactPhone: z.string().trim().max(40),
  website: safeUrlField(240),
  businessAddress: z.string().trim().max(300),
  socialLinks: z.object({
    linkedin: safeUrlField(240),
    instagram: safeUrlField(240),
    twitter: safeUrlField(240),
    facebook: safeUrlField(240),
  }),
});

export const brandAssetsSchema = z.object({
  brandColors: z
    .array(z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/, 'Brand colors must be valid hex codes'))
    .max(12),
  typographyNotes: z.string().trim().max(2000),
  designReferences: z.string().trim().max(3000),
  brandVoiceNotes: z.string().trim().max(2000),
});

export const websiteContentSchema = z.object({
  homepageCopy: z.string().trim().max(6000),
  aboutCopy: z.string().trim().max(6000),
  servicesCopy: z.string().trim().max(6000),
  contactPageCopy: z.string().trim().max(3000),
  existingWebsiteRefs: safeUrlField(2000),
});

export const projectRequirementsSchema = z.object({
  projectGoals: z.string().trim().max(4000),
  requiredFeatures: z.string().trim().max(4000),
  designPreferences: z.string().trim().max(3000),
  functionalRequirements: z.string().trim().max(4000),
  referenceWebsites: safeUrlField(2000),
  targetDeadline: z.string().trim().max(60),
  additionalInstructions: z.string().trim().max(3000),
});

export const accessCredentialsMetaSchema = z.object({
  accessMethodPreference: z.string().trim().max(80),
  delegatedAccessNotes: z.string().trim().max(3000),
  confirmedSecurityReview: z.boolean(),
});

export const additionalDocumentsMetaSchema = z.object({
  documentNotes: z.string().trim().max(2000),
  noAdditionalDocsNeeded: z.boolean(),
});

export const credentialInputSchema = z.object({
  serviceName: z.string().trim().min(2, 'Service name is required').max(120),
  category: z.enum(['hosting', 'domain', 'cms', 'analytics', 'other']),
  accessType: z.enum(['delegated_invite', 'temporary_token', 'username_password']),
  loginUrl: safeUrlField(240).optional().default(''),
  username: z.string().trim().min(1, 'Username or account email is required').max(180),
  secretValue: z.string().min(1, 'Credential / token / invite details are required').max(2000),
  notes: z.string().trim().max(1000).optional().default(''),
});

export const agencySettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  supportEmail: z.string().trim().email().max(160),
  website: safeUrlField(240),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color'),
  defaultInviteExpiryDays: z.number().int().min(1).max(60),
  sessionDurationHours: z.number().int().min(1).max(720),
  notifyOnSubmission: z.boolean(),
  notifyOnAssetUpload: z.boolean(),
  requiredSections: z.array(sectionKeyEnum).min(1),
});

export const teamInviteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  role: z.enum(['admin', 'member']),
  title: z.string().trim().min(2).max(100),
});

export const updateAssetMetadataSchema = z
  .object({
    originalName: z.string().trim().min(1, 'File name cannot be empty').max(140).optional(),
    category: assetCategoryEnum.optional(),
    description: z.string().trim().max(500).optional(),
    sectionKey: sectionKeyEnum.nullable().optional(),
  })
  .refine(
    (val) =>
      val.originalName !== undefined ||
      val.category !== undefined ||
      val.description !== undefined ||
      val.sectionKey !== undefined,
    { message: 'At least one asset field must be provided for update' },
  );

