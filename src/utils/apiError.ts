export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    if ('data' in err && err.data && typeof err.data === 'object' && 'error' in err.data) {
      const msg = (err.data as { error?: unknown }).error;
      if (typeof msg === 'string' && msg.trim().length > 0) {
        return msg;
      }
    }
    if ('error' in err && typeof (err as { error?: unknown }).error === 'string') {
      return (err as { error: string }).error;
    }
    if ('message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
  }
  return fallback;
}

export function getApiMissingItems(err: unknown): string[] {
  if (err && typeof err === 'object' && 'data' in err && err.data && typeof err.data === 'object') {
    const missing = (err.data as { missing?: unknown }).missing;
    if (Array.isArray(missing)) {
      return missing.filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}

export function triggerAssetDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
