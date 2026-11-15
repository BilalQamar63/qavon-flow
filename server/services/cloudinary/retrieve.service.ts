import path from 'node:path';
import {
  getConfiguredCloudinary,
  type CloudinaryDeliveryType,
  type CloudinaryResourceType,
} from '../../config/cloudinary.ts';

export interface SignedCloudinaryUrls {
  originalUrl: string;
  previewUrl: string;
  downloadUrl: string;
  expiresAtUnix: number;
}

export function generateSignedCloudinaryUrls(params: {
  publicId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  fileFormat?: string;
  originalName: string;
  mimeType: string;
  expiresInSeconds?: number;
}): SignedCloudinaryUrls {
  const cld = getConfiguredCloudinary();
  const ttlSeconds = Math.max(60, Math.min(3600, params.expiresInSeconds ?? 300));
  const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlSeconds;
  const fallbackFormat = path.extname(params.originalName).replace(/^\./, '').toLowerCase();
  const format = (params.fileFormat || fallbackFormat || '').trim();

  const isTransformableImage =
    params.resourceType === 'image' && params.mimeType !== 'image/svg+xml';

  const originalUrl = cld.url(params.publicId, {
    resource_type: params.resourceType,
    type: params.deliveryType,
    sign_url: true,
    secure: true,
    expires_at: expiresAtUnix,
  });

  const previewUrl = isTransformableImage
    ? cld.url(params.publicId, {
        resource_type: params.resourceType,
        type: params.deliveryType,
        sign_url: true,
        secure: true,
        expires_at: expiresAtUnix,
        transformation: [
          {
            width: 1600,
            crop: 'limit',
            quality: 'auto',
            fetch_format: 'auto',
          },
        ],
      })
    : originalUrl;

  let downloadUrl: string;
  if (params.deliveryType === 'authenticated' || params.deliveryType === 'private') {
    downloadUrl = cld.utils.private_download_url(params.publicId, format, {
      resource_type: params.resourceType,
      type: params.deliveryType,
      expires_at: expiresAtUnix,
      attachment: true,
    });
  } else {
    downloadUrl = cld.url(params.publicId, {
      resource_type: params.resourceType,
      type: params.deliveryType,
      sign_url: true,
      secure: true,
      expires_at: expiresAtUnix,
      flags: 'attachment',
    });
  }

  return {
    originalUrl,
    previewUrl,
    downloadUrl,
    expiresAtUnix,
  };
}
