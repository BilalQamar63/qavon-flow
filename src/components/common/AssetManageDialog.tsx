import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ASSET_CATEGORY_LABELS } from '../../constants/onboarding';
import { useUpdateAssetMetadataMutation } from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import type { AssetCategory, AssetRecord } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { FileUploader } from './FileUploader';

interface AssetManageDialogProps {
  asset: AssetRecord | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export function AssetManageDialog({ asset, onClose, onUpdated }: AssetManageDialogProps) {
  const dispatch = useAppDispatch();
  const [updateMetadata, { isLoading: saving }] = useUpdateAssetMetadataMutation();

  const [originalName, setOriginalName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('primary_logo');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!asset) return;
    setOriginalName(asset.originalName);
    setCategory(asset.category);
    setDescription(asset.description || '');
  }, [asset]);

  if (!asset) return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateMetadata({
        id: asset.id,
        clientId: asset.clientId,
        originalName: originalName.trim(),
        category,
        description: description.trim(),
      }).unwrap();
      dispatch(showToast({ severity: 'success', text: 'Asset details updated' }));
      onUpdated?.();
      onClose();
    } catch (err: unknown) {
      dispatch(
        showToast({ severity: 'error', text: getApiErrorMessage(err, 'Failed to update asset details') }),
      );
    }
  };

  return (
    <Dialog open={Boolean(asset)} onClose={onClose} maxWidth="sm" fullWidth>
      <BoxFormWrapper onSubmit={handleSave}>
        <DialogTitle>Edit & Replace Asset</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.25}>
            <TextField
              label="File Display Name"
              required
              fullWidth
              value={originalName}
              onChange={(e) => setOriginalName(e.target.value)}
            />
            <TextField
              select
              label="Asset Category"
              fullWidth
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
            >
              {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {ASSET_CATEGORY_LABELS[cat]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Asset Notes / Description"
              placeholder="Usage instructions, color mode, print specs..."
              multiline
              minRows={2}
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Divider />

            <Stack spacing={1}>
              <Typography variant="subtitle2">Replace File in Cloudinary</Typography>
              <Typography variant="caption">
                Uploading a replacement atomically updates the cloud object and cleans up the previous file after database commit.
              </Typography>
              <FileUploader
                clientId={asset.clientId}
                category={category}
                replaceAssetId={asset.id}
                label={`Replace ${asset.originalName}`}
                onUploaded={() => {
                  dispatch(showToast({ severity: 'success', text: 'Asset file replaced in cloud storage' }));
                  onUpdated?.();
                  onClose();
                }}
                onError={(msg) => dispatch(showToast({ severity: 'error', text: msg }))}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={saving || !originalName.trim()}
            startIcon={<Save size={16} />}
          >
            {saving ? 'Saving...' : 'Save Metadata'}
          </Button>
        </DialogActions>
      </BoxFormWrapper>
    </Dialog>
  );
}

function BoxFormWrapper({
  onSubmit,
  children,
}: {
  onSubmit: (e: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      {children}
    </form>
  );
}
