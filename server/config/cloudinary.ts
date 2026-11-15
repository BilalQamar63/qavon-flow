import { v2 as cloudinary } from 'cloudinary';
import type { AssetCategory, OnboardingSectionKey, UserRole } from '../../src/types/index.ts';

if (typeof window !== 'undefined') {
  throw new Error('Cloudinary server configuration must never be imported in browser code.');
}

export type CloudinaryResourceType = 'image' | 'video' | 'raw';
export type CloudinaryDeliveryType = 'authenticated' | 'private' | 'upload';

export interface CloudinaryUploadRequest {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  agencyId: string;
  clientId: string;
  category: AssetCategory;
  assetId?: string;
}

export interface CloudinaryUploadResult {
  publicId: string;
  assetId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  secureUrl: string;
  format: string;
  bytes: number;
}

export interface CloudinaryAssetMetadata {
  cloudinaryPublicId: string;
  cloudinaryAssetId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  secureUrl: string;
  fileFormat: string;
  description: string;
  sectionKey: OnboardingSectionKey | null;
  updatedAt: string | null;
}

export interface AssetOwnershipContext {
  assetId: string;
  agencyId: string;
  clientId: string;
  assignedToId: string | null;
  uploadedByRole: UserRole;
  clientStatus: string;
}

export interface CloudinaryDeleteResult {
  deleted: boolean;
  result: string;
  queuedForRetry: boolean;
}

export interface AssetApiResponse {
  id: string;
  agencyId: string;
  clientId: string;
  clientName?: string;
  category: AssetCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fileFormat?: string;
  resourceType?: CloudinaryResourceType;
  description?: string;
  sectionKey?: OnboardingSectionKey | null;
  uploadedByName: string;
  uploadedByRole: UserRole;
  createdAt: string;
  updatedAt?: string | null;
}

export class CloudinaryConfigError extends Error {
  public readonly statusCode = 503;
  public readonly missingVars: string[];

  constructor(missingVars: string[]) {
    super(
      `Cloudinary storage is not configured. Missing required server environment variables: ${missingVars.join(', ')}.`,
    );
    this.name = 'CloudinaryConfigError';
    this.missingVars = missingVars;
  }
}

export function getMissingCloudinaryVars(): string[] {
  const missing: string[] = [];
  if (!process.env.CLOUDINARY_CLOUD_NAME?.trim()) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!process.env.CLOUDINARY_API_KEY?.trim()) missing.push('CLOUDINARY_API_KEY');
  if (!process.env.CLOUDINARY_API_SECRET?.trim()) missing.push('CLOUDINARY_API_SECRET');
  return missing;
}

export function isCloudinaryConfigured(): boolean {
  return getMissingCloudinaryVars().length === 0;
}

export function assertCloudinaryConfigured(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const missing = getMissingCloudinaryVars();
  if (missing.length > 0) {
    throw new CloudinaryConfigError(missing);
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY!.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET!.trim(),
  };
}

export function getConfiguredCloudinary(): typeof cloudinary {
  const creds = assertCloudinaryConfigured();
  cloudinary.config({
    cloud_name: creds.cloudName,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    secure: true,
  });
  return cloudinary;
}
