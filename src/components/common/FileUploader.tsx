import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { hubApi } from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { themePalette } from '../../theme';
import type { AssetCategory } from '../../types';

interface FileUploaderProps {
  clientId: string;
  category: AssetCategory;
  label: string;
  helperText?: string;
  disabled?: boolean;
  replaceAssetId?: string;
  description?: string;
  onUploaded: () => void;
  onError: (msg: string) => void;
}

export function FileUploader({
  clientId,
  category,
  label,
  helperText = 'Drag & drop or browse · PNG, JPG, SVG, WEBP, PDF, DOCX, ZIP, MP4 (max 15 MB)',
  disabled = false,
  replaceAssetId,
  description,
  onUploaded,
  onError,
}: FileUploaderProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const mountedRef = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, []);

  const uploadFile = (file: File) => {
    if (disabled) return;
    if (xhrRef.current) {
      xhrRef.current.abort();
    }

    const formData = new FormData();
    formData.append('file', file);
    if (!replaceAssetId) {
      formData.append('clientId', clientId);
      formData.append('category', category);
      if (description?.trim()) {
        formData.append('description', description.trim());
      }
    }

    setUploading(true);
    setActiveFileName(file.name);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open(
      replaceAssetId ? 'PUT' : 'POST',
      replaceAssetId ? `/api/assets/${replaceAssetId}` : '/api/assets/upload',
      true,
    );
    xhr.withCredentials = true;

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && mountedRef.current) {
        setProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (!mountedRef.current) return;
      setUploading(false);
      setActiveFileName(null);
      if (inputRef.current) inputRef.current.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        dispatch(
          hubApi.util.invalidateTags([
            'Assets',
            'Clients',
            'Dashboard',
            'Activity',
            'Notifications',
            { type: 'Onboarding', id: clientId },
            { type: 'ClientDetail', id: clientId },
          ]),
        );
        onUploaded();
      } else {
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          onError(parsed.error || 'Upload failed');
        } catch {
          onError('Upload failed');
        }
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      if (!mountedRef.current) return;
      setUploading(false);
      setActiveFileName(null);
      if (inputRef.current) inputRef.current.value = '';
      onError('Network error while uploading file');
    };

    xhr.onabort = () => {
      if (xhrRef.current === xhr) {
        xhrRef.current = null;
      }
    };

    xhr.send(formData);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !disabled) uploadFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!uploading && !disabled) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (uploading || disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: `1.5px dashed ${dragging ? themePalette.accent.main : themePalette.divider}`,
        borderRadius: '8px',
        p: 2,
        bgcolor: dragging ? themePalette.accent.soft : themePalette.background.default,
        opacity: disabled ? 0.72 : 1,
        transition: 'border-color 150ms ease, background-color 150ms ease',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        disabled={disabled}
        accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.doc,.docx,.txt,.zip,.mp4"
        onChange={handleFileChange}
      />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              bgcolor: themePalette.background.paper,
              border: `1px solid ${themePalette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dragging ? themePalette.accent.hover : themePalette.text.secondary,
              flexShrink: 0,
            }}
          >
            <UploadCloud size={17} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
              {label}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              {uploading && activeFileName ? `Uploading ${activeFileName}...` : helperText}
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="outlined"
          size="small"
          disabled={uploading || disabled}
          onClick={() => inputRef.current?.click()}
          sx={{ flexShrink: 0 }}
        >
          {uploading ? `${progress}%` : disabled ? 'Locked' : 'Choose File'}
        </Button>
      </Stack>
      {uploading && (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            mt: 1.5,
            height: 5,
            borderRadius: 3,
            bgcolor: themePalette.background.subtle,
            '& .MuiLinearProgress-bar': { bgcolor: themePalette.accent.main },
          }}
        />
      )}
    </Box>
  );
}
