import crypto from 'node:crypto';
import path from 'node:path';
import type { AssetCategory, OnboardingSectionKey } from '../../../src/types/index.ts';
import {
  getConfiguredCloudinary,
  type CloudinaryResourceType,
  type CloudinaryUploadRequest,
  type CloudinaryUploadResult,
} from '../../config/cloudinary.ts';

const FOLDER_BY_CATEGORY: Record<AssetCategory, string> = {
  primary_logo: 'logos',
  secondary_logo: 'logos',
  brand_icon: 'logos',
  brand_guidelines: 'brand-assets',
  website_media: 'project-files',
  additional_document: 'documents',
};

const SECTION_BY_CATEGORY: Record<AssetCategory, OnboardingSectionKey> = {
  primary_logo: 'brand_assets',
  secondary_logo: 'brand_assets',
  brand_icon: 'brand_assets',
  brand_guidelines: 'brand_assets',
  website_media: 'website_content',
  additional_document: 'additional_documents',
};

export function resolveCloudinaryFolder(
  agencyId: string,
  clientId: string,
  category: AssetCategory,
): string {
  const safeAgency = agencyId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeClient = clientId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const subFolder = FOLDER_BY_CATEGORY[category] || 'documents';
  return `client-onboarding/${safeAgency}/${safeClient}/${subFolder}`;
}

export function resolveResourceType(mimeType: string): CloudinaryResourceType {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  return 'raw';
}

export function resolveDefaultSectionKey(category: AssetCategory): OnboardingSectionKey {
  return SECTION_BY_CATEGORY[category] || 'additional_documents';
}

export function buildUniquePublicId(originalName: string, resourceType: CloudinaryResourceType): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const baseName = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  const stem = baseName || 'asset';
  const suffix = crypto.randomUUID().slice(0, 10);
  if (resourceType === 'raw' && ext) {
    return `${stem}-${suffix}${ext}`;
  }
  return `${stem}-${suffix}`;
}

export async function uploadBufferToCloudinary(
  request: CloudinaryUploadRequest,
): Promise<CloudinaryUploadResult> {
  const cld = getConfiguredCloudinary();
  const folder = resolveCloudinaryFolder(request.agencyId, request.clientId, request.category);
  const resourceType = resolveResourceType(request.mimeType);
  const publicIdName = buildUniquePublicId(request.originalName, resourceType);
  const fallbackExt = path.extname(request.originalName).replace(/^\./, '').toLowerCase();

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadStream = cld.uploader.upload_stream(
      {
        folder,
        public_id: publicIdName,
        resource_type: resourceType,
        type: 'authenticated',
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        context: {
          agencyId: request.agencyId,
          clientId: request.clientId,
          category: request.category,
          ...(request.assetId ? { assetId: request.assetId } : {}),
        },
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary upload failed without a valid result payload'));
          return;
        }

        resolve({
          publicId: result.public_id,
          assetId: result.asset_id || '',
          resourceType: (result.resource_type as CloudinaryResourceType) || resourceType,
          deliveryType: 'authenticated',
          secureUrl: result.secure_url,
          format: result.format || fallbackExt,
          bytes: typeof result.bytes === 'number' ? result.bytes : request.buffer.byteLength,
        });
      },
    );

    uploadStream.end(request.buffer);
  });
}
