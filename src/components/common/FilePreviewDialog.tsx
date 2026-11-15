import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSET_CATEGORY_LABELS } from '../../constants/onboarding';
import { useGetAssetDownloadUrlMutation } from '../../store/api/hubApi';
import { themePalette } from '../../theme';
import type { AssetRecord } from '../../types';
import { formatBytes, formatShortDate } from '../../utils/format';

interface FilePreviewDialogProps {
  asset: AssetRecord | null;
  onClose: () => void;
}

export function FilePreviewDialog({ asset, onClose }: FilePreviewDialogProps) {
  const [getDownloadUrl] = useGetAssetDownloadUrlMutation();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeAssetIdRef = useRef<string | null>(null);

  const authorizePreview = useCallback(
    async (target: AssetRecord) => {
      activeAssetIdRef.current = target.id;
      setLoading(true);
      setError(null);
      setSignedUrl(null);
      try {
        const res = await getDownloadUrl({ id: target.id }).unwrap();
        if (activeAssetIdRef.current !== target.id) return;
        setSignedUrl(res.url);
      } catch {
        if (activeAssetIdRef.current !== target.id) return;
        setError('Unable to authorize short-lived preview URL for this asset.');
      } finally {
        if (activeAssetIdRef.current === target.id) {
          setLoading(false);
        }
      }
    },
    [getDownloadUrl],
  );

  useEffect(() => {
    if (!asset) {
      activeAssetIdRef.current = null;
      setSignedUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    void authorizePreview(asset);
    return () => {
      activeAssetIdRef.current = null;
    };
  }, [asset, authorizePreview]);

  if (!asset) return null;

  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';
  const inlineUrl = signedUrl ? `${signedUrl}&inline=1` : null;

  return (
    <Dialog open={Boolean(asset)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Typography variant="h4">{asset.originalName}</Typography>
        <Stack
          direction="row"
          spacing={1.5}
          useFlexGap
          sx={{ mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, color: themePalette.text.primary }}>
            {ASSET_CATEGORY_LABELS[asset.category]}
          </Typography>
          {asset.clientName && (
            <Typography variant="caption">Client: {asset.clientName}</Typography>
          )}
          <Typography variant="caption">
            Uploaded by {asset.uploadedByName} ({asset.uploadedByRole})
          </Typography>
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatBytes(asset.sizeBytes)} · {formatShortDate(asset.createdAt)}
          </Typography>
        </Stack>
        {asset.description && (
          <Typography variant="body2" sx={{ mt: 0.75, color: themePalette.text.secondary }}>
            {asset.description}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                startIcon={<RefreshCw size={14} />}
                onClick={() => void authorizePreview(asset)}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {!error && loading && (
          <Stack direction="row" spacing={1.5} sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}>
            <CircularProgress size={20} sx={{ color: themePalette.accent.main }} />
            <Typography variant="body2">Authorizing short-lived preview URL...</Typography>
          </Stack>
        )}

        {inlineUrl && isImage && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: themePalette.background.subtle,
              borderRadius: '8px',
              p: 3,
              minHeight: 260,
            }}
          >
            <img
              src={inlineUrl}
              alt={asset.originalName}
              referrerPolicy="no-referrer"
              style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }}
            />
          </Box>
        )}
        {inlineUrl && isPdf && (
          <Box sx={{ height: 480, width: '100%' }}>
            <iframe
              src={inlineUrl}
              title={asset.originalName}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 6 }}
            />
          </Box>
        )}
        {inlineUrl && !isImage && !isPdf && (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography variant="body2">
              In-browser preview is available for images and PDFs ({asset.mimeType}). Use the download button below to open this file locally.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1.5,
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: themePalette.text.muted }}>
          <ShieldCheck size={14} style={{ flexShrink: 0 }} />
          <Typography variant="caption">Private asset · 5-minute signed access token</Typography>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={onClose}>
            Close
          </Button>
          {signedUrl && (
            <Button
              component="a"
              href={signedUrl}
              download={asset.originalName}
              variant="contained"
              color="primary"
              startIcon={<Download size={16} />}
            >
              Download File
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
