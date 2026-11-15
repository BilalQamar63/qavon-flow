import path from 'node:path';

export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/zip',
  'video/mp4',
]);

export const ALLOWED_EXTENSIONS_BY_MIME: Record<string, Set<string>> = {
  'image/png': new Set(['.png']),
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/webp': new Set(['.webp']),
  'image/svg+xml': new Set(['.svg']),
  'application/pdf': new Set(['.pdf']),
  'application/msword': new Set(['.doc']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['.docx']),
  'text/plain': new Set(['.txt', '.md', '.csv']),
  'application/zip': new Set(['.zip']),
  'video/mp4': new Set(['.mp4']),
};

export const SAFE_INLINE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

const DANGEROUS_SVG_PATTERN =
  /(<script\b|<foreignobject\b|<iframe\b|<object\b|<embed\b|<meta\b|javascript:|vbscript:|data\s*:\s*text\/html|\bon[a-z]+\s*=)/i;

export function isExtensionAllowedForMime(originalName: string, mimeType: string): boolean {
  const allowedExts = ALLOWED_EXTENSIONS_BY_MIME[mimeType];
  if (!allowedExts) return false;
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return false;
  return allowedExts.has(ext);
}

export function validateFileSignature(mimeType: string, buffer: Buffer): boolean {
  if (buffer.byteLength === 0) return false;

  switch (mimeType) {
    case 'image/png':
      return (
        buffer.byteLength >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case 'image/jpeg':
      return buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/webp':
      return (
        buffer.byteLength >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.byteLength >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return (
        buffer.byteLength >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
      );
    case 'application/msword':
      return (
        buffer.byteLength >= 8 &&
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0
      );
    case 'video/mp4':
      return buffer.byteLength >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'image/svg+xml': {
      if (buffer.includes(0x00)) return false;
      const svgText = buffer.toString('utf8');
      if (!svgText.toLowerCase().includes('<svg')) return false;
      if (DANGEROUS_SVG_PATTERN.test(svgText)) return false;
      return true;
    }
    case 'text/plain':
      return !buffer.includes(0x00);
    default:
      return false;
  }
}

export function sanitizeFilename(originalName: string): string {
  return originalName.replace(/[^\w.\-() ]+/g, '_').slice(0, 140) || 'asset';
}

export function validateUploadedFile(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): { ok: true; safeName: string } | { ok: false; error: string } {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      ok: false,
      error: `Unsupported file type (${file.mimetype}). Allowed: PNG, JPG, WEBP, SVG, PDF, DOC, DOCX, TXT, ZIP, MP4.`,
    };
  }
  if (!isExtensionAllowedForMime(file.originalname, file.mimetype)) {
    return {
      ok: false,
      error: `File extension does not match declared ${file.mimetype} content type.`,
    };
  }
  if (!validateFileSignature(file.mimetype, file.buffer)) {
    return {
      ok: false,
      error: `File contents are empty, unsafe, or do not match the declared ${file.mimetype} format.`,
    };
  }
  return {
    ok: true,
    safeName: sanitizeFilename(file.originalname),
  };
}
