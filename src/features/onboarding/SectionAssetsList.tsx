import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Download, Eye, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AssetManageDialog } from '../../components/common/AssetManageDialog';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { FilePreviewDialog } from '../../components/common/FilePreviewDialog';
import { FileTypeBadge } from '../../components/common/FileTypeBadge';
import { ASSET_CATEGORY_LABELS } from '../../constants/onboarding';
import {
  useDeleteAssetMutation,
  useGetAssetDownloadUrlMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import { themePalette } from '../../theme';
import type { AssetRecord } from '../../types';
import { triggerAssetDownload } from '../../utils/apiError';
import { formatBytes, formatShortDate } from '../../utils/format';

interface SectionAssetsListProps {
  assets: AssetRecord[];
  clientId: string;
  readOnly?: boolean;
}

export function SectionAssetsList({ assets, clientId, readOnly = false }: SectionAssetsListProps) {
  const dispatch = useAppDispatch();
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [editTarget, setEditTarget] = useState<AssetRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);
  const [getDownloadUrl] = useGetAssetDownloadUrlMutation();
  const [deleteAsset, { isLoading: deleting }] = useDeleteAssetMutation();

  const handleDownload = async (asset: AssetRecord) => {
    try {
      const { url } = await getDownloadUrl({ id: asset.id }).unwrap();
      triggerAssetDownload(url, asset.originalName);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Unable to generate download link' }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset({ id: deleteTarget.id, clientId }).unwrap();
      dispatch(showToast({ severity: 'success', text: `Deleted ${deleteTarget.originalName}` }));
      setDeleteTarget(null);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to delete asset' }));
    }
  };

  if (assets.length === 0) {
    return (
      <Typography variant="caption" sx={{ display: 'block', py: 1 }}>
        No files uploaded in this section yet.
      </Typography>
    );
  }

  return (
    <>
      <Stack spacing={1}>
        {assets.map((asset) => (
          <Stack
            key={asset.id}
            direction="row"
            spacing={1.5}
            sx={{
              px: 1.5,
              py: 1.125,
              border: `1px solid ${themePalette.divider}`,
              borderRadius: '8px',
              bgcolor: themePalette.background.paper,
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'background-color 120ms ease, border-color 120ms ease',
              '&:hover': {
                bgcolor: themePalette.background.default,
                borderColor: themePalette.text.muted,
              },
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}>
              <FileTypeBadge filename={asset.originalName} mimeType={asset.mimeType} size={34} />
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: themePalette.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {asset.originalName}
                </Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {ASSET_CATEGORY_LABELS[asset.category]} · {formatBytes(asset.sizeBytes)} ·{' '}
                  {formatShortDate(asset.createdAt)}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Tooltip title="Preview">
                <IconButton size="small" onClick={() => setPreviewAsset(asset)}>
                  <Eye size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download">
                <IconButton size="small" onClick={() => handleDownload(asset)}>
                  <Download size={15} />
                </IconButton>
              </Tooltip>
              {!readOnly && (
                <Tooltip title="Edit / Replace">
                  <IconButton size="small" aria-label="Edit or replace asset" onClick={() => setEditTarget(asset)}>
                    <Pencil size={15} />
                  </IconButton>
                </Tooltip>
              )}
              {!readOnly && (
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(asset)}>
                    <Trash2 size={15} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        ))}
      </Stack>

      <FilePreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      <AssetManageDialog asset={editTarget} onClose={() => setEditTarget(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.originalName}?`}
        description="This permanently removes the file from Cloudinary cloud storage."
        confirmLabel="Delete File"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
