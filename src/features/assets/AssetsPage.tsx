import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Download,
  Eye,
  FolderOpen,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AssetManageDialog } from '../../components/common/AssetManageDialog';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { FilePreviewDialog } from '../../components/common/FilePreviewDialog';
import { FileTypeBadge } from '../../components/common/FileTypeBadge';
import { FileUploader } from '../../components/common/FileUploader';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { ASSET_CATEGORY_LABELS } from '../../constants/onboarding';
import {
  useDeleteAssetMutation,
  useGetAssetDownloadUrlMutation,
  useGetAssetsQuery,
  useGetClientsQuery,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { openClientWorkspace, setActivePage, showToast } from '../../store/slices/uiSlice';
import { FONT_DISPLAY, themePalette } from '../../theme';
import type { AssetCategory, AssetRecord } from '../../types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { triggerAssetDownload } from '../../utils/apiError';
import { formatBytes, formatShortDate } from '../../utils/format';

type AssetSortMode = 'newest' | 'oldest' | 'name_asc' | 'size_desc';

function AssetThumbnail({ asset, onClick }: { asset: AssetRecord; onClick: () => void }) {
  const [getDownloadUrl] = useGetAssetDownloadUrlMutation();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const isImage = asset.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) {
      setThumbUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadUrl({ id: asset.id })
      .unwrap()
      .then((res) => {
        if (!cancelled) setThumbUrl(`${res.url}&inline=1`);
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, isImage, getDownloadUrl]);

  return (
    <Box
      onClick={onClick}
      sx={{
        height: 132,
        bgcolor: themePalette.background.subtle,
        borderBottom: `1px solid ${themePalette.divider}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
        p: 2,
      }}
    >
      {isImage && thumbUrl ? (
        <img
          src={thumbUrl}
          alt={asset.originalName}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <FileTypeBadge filename={asset.originalName} mimeType={asset.mimeType} size={46} />
      )}
    </Box>
  );
}

export function AssetsPage() {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState('');
  const [clientIdFilter, setClientIdFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<AssetSortMode>('newest');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadClientId, setUploadClientId] = useState('');
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>('primary_logo');
  const [uploadDescription, setUploadDescription] = useState('');
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [editTarget, setEditTarget] = useState<AssetRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);
  const { data: clientsData } = useGetClientsQuery({ status: 'all' });
  const { data, isLoading, isError, refetch } = useGetAssetsQuery({
    search: debouncedSearch,
    clientId: clientIdFilter,
    category: '',
  });

  const [getDownloadUrl] = useGetAssetDownloadUrlMutation();
  const [deleteAsset, { isLoading: deleting }] = useDeleteAssetMutation();

  const clients = clientsData?.clients || [];
  const allMatchingAssets = data?.assets || [];

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allMatchingAssets) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [allMatchingAssets]);

  const assets = useMemo(() => {
    const filtered = categoryFilter
      ? allMatchingAssets.filter((a) => a.category === categoryFilter)
      : [...allMatchingAssets];

    if (sortBy === 'name_asc') {
      filtered.sort((a, b) => a.originalName.localeCompare(b.originalName));
    } else if (sortBy === 'size_desc') {
      filtered.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else {
      const tsMap = new Map<string, number>();
      for (const item of filtered) {
        tsMap.set(item.id, Date.parse(item.createdAt));
      }
      filtered.sort((a, b) =>
        sortBy === 'oldest'
          ? (tsMap.get(a.id) ?? 0) - (tsMap.get(b.id) ?? 0)
          : (tsMap.get(b.id) ?? 0) - (tsMap.get(a.id) ?? 0),
      );
    }

    return filtered;
  }, [allMatchingAssets, categoryFilter, sortBy]);

  const totalSizeBytes = useMemo(
    () => assets.reduce((sum, item) => sum + item.sizeBytes, 0),
    [assets],
  );

  const hasFilters = Boolean(search || clientIdFilter || categoryFilter);

  const handleStartUpload = () => {
    if (clients.length === 0) {
      dispatch(setActivePage('clients'));
      dispatch(
        showToast({
          severity: 'info',
          text: 'Create a client workspace before uploading an asset.',
        }),
      );
      return;
    }

    setUploadClientId(clientIdFilter || clients[0].id);
    setUploadModalOpen(true);
  };

  const handleDownload = async (asset: AssetRecord) => {
    try {
      const { url } = await getDownloadUrl({ id: asset.id }).unwrap();
      triggerAssetDownload(url, asset.originalName);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to generate download link' }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset({ id: deleteTarget.id, clientId: deleteTarget.clientId }).unwrap();
      dispatch(showToast({ severity: 'success', text: `Deleted ${deleteTarget.originalName}` }));
      setDeleteTarget(null);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to delete file' }));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Asset Library"
        subtitle="Browse, preview, and download client brand files, website media, and onboarding documents managed in QavonFlow."
        actions={
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={16} />}
            onClick={handleStartUpload}
          >
            Upload Asset
          </Button>
        }
      />

      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { xs: 'stretch', lg: 'center' } }}
            >
              <Box sx={{ flex: 1 }}>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search filename or client..."
                  fullWidth
                />
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: 'center' }}>
                <TextField
                  select
                  label="Client"
                  value={clientIdFilter}
                  onChange={(e) => setClientIdFilter(e.target.value)}
                  sx={{ minWidth: { xs: '100%', sm: 190 } }}
                >
                  <MenuItem value="">All Clients</MenuItem>
                  {clients.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.companyName}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Sort By"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as AssetSortMode)}
                  sx={{ minWidth: { xs: '100%', sm: 165 } }}
                >
                  <MenuItem value="newest">Newest First</MenuItem>
                  <MenuItem value="oldest">Oldest First</MenuItem>
                  <MenuItem value="name_asc">Name (A–Z)</MenuItem>
                  <MenuItem value="size_desc">Largest First</MenuItem>
                </TextField>

                {hasFilters && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSearch('');
                      setClientIdFilter('');
                      setCategoryFilter('');
                    }}
                  >
                    Clear
                  </Button>
                )}

                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{
                    border: `1px solid ${themePalette.divider}`,
                    borderRadius: '8px',
                    p: 0.375,
                    bgcolor: themePalette.background.default,
                    alignSelf: { xs: 'flex-end', sm: 'center' },
                  }}
                >
                  <Tooltip title="Table View">
                    <IconButton
                      size="small"
                      aria-label="Table View"
                      onClick={() => setViewMode('table')}
                      sx={{
                        bgcolor: viewMode === 'table' ? themePalette.background.paper : 'transparent',
                        color:
                          viewMode === 'table'
                            ? themePalette.text.primary
                            : themePalette.text.muted,
                      }}
                    >
                      <ListIcon size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Grid View">
                    <IconButton
                      size="small"
                      aria-label="Grid View"
                      onClick={() => setViewMode('grid')}
                      sx={{
                        bgcolor: viewMode === 'grid' ? themePalette.background.paper : 'transparent',
                        color:
                          viewMode === 'grid'
                            ? themePalette.text.primary
                            : themePalette.text.muted,
                      }}
                    >
                      <LayoutGrid size={16} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Stack>

            {/* Category Filter Controls */}
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                pt: 1.5,
                borderTop: `1px solid ${themePalette.divider}`,
              }}
            >
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  size="small"
                  variant={categoryFilter === '' ? 'contained' : 'outlined'}
                  color={categoryFilter === '' ? 'primary' : 'inherit'}
                  onClick={() => setCategoryFilter('')}
                  sx={{
                    minHeight: 30,
                    px: 1.5,
                    fontSize: '0.75rem',
                    fontFamily: FONT_DISPLAY,
                    borderColor: themePalette.divider,
                    color: categoryFilter === '' ? themePalette.primary.contrastText : themePalette.text.secondary,
                  }}
                >
                  All ({allMatchingAssets.length})
                </Button>
                {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((cat) => {
                  const active = categoryFilter === cat;
                  const count = categoryCounts[cat] || 0;
                  return (
                    <Button
                      key={cat}
                      size="small"
                      variant={active ? 'contained' : 'outlined'}
                      color={active ? 'primary' : 'inherit'}
                      onClick={() => setCategoryFilter(active ? '' : cat)}
                      sx={{
                        minHeight: 30,
                        px: 1.5,
                        fontSize: '0.75rem',
                        fontFamily: FONT_DISPLAY,
                        borderColor: themePalette.divider,
                        color: active ? themePalette.primary.contrastText : themePalette.text.secondary,
                      }}
                    >
                      {ASSET_CATEGORY_LABELS[cat]} ({count})
                    </Button>
                  );
                })}
              </Stack>

              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {assets.length} {assets.length === 1 ? 'asset' : 'assets'} · {formatBytes(totalSizeBytes)}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {isLoading && <LoadingState variant="table" rows={5} />}
      {isError && <ErrorState message="Unable to load assets." onRetry={refetch} />}

      {!isLoading && !isError && assets.length === 0 && (
        <EmptyState
          title="No assets found"
          description={
            hasFilters
              ? 'No uploaded assets match your current filters.'
              : clients.length === 0
                ? 'Create a client workspace before uploading assets. Each asset must be associated with a client.'
                : 'Upload logos, guidelines, media, or documents from a client onboarding workspace or using the Upload Asset button.'
          }
          actionLabel={
            hasFilters ? 'Clear Filters' : clients.length === 0 ? 'Create Client' : 'Upload Asset'
          }
          onAction={() => {
            if (hasFilters) {
              setSearch('');
              setClientIdFilter('');
              setCategoryFilter('');
            } else {
              handleStartUpload();
            }
          }}
          icon={<FolderOpen size={20} />}
        />
      )}

      {!isLoading && !isError && assets.length > 0 && viewMode === 'table' && (
        <Card>
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Client</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Category</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    Size
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Uploaded</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <FileTypeBadge
                          filename={asset.originalName}
                          mimeType={asset.mimeType}
                          size={34}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="subtitle2"
                            onClick={() => setPreviewAsset(asset)}
                            sx={{
                              color: themePalette.text.primary,
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {asset.originalName}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            by {asset.uploadedByName} ({asset.uploadedByRole})
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: { xs: 'block', sm: 'none' },
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {asset.clientName} · {formatBytes(asset.sizeBytes)}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography
                        variant="body2"
                        onClick={() => dispatch(openClientWorkspace(asset.clientId))}
                        sx={{
                          cursor: 'pointer',
                          fontWeight: 500,
                          color: themePalette.text.primary,
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {asset.clientName || 'Client'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {ASSET_CATEGORY_LABELS[asset.category]}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontVariantNumeric: 'tabular-nums', display: { xs: 'none', sm: 'table-cell' } }}
                    >
                      {formatBytes(asset.sizeBytes)}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        display: { xs: 'none', lg: 'table-cell' },
                      }}
                    >
                      {formatShortDate(asset.createdAt)}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="Preview">
                          <IconButton size="small" aria-label="Preview" onClick={() => setPreviewAsset(asset)}>
                            <Eye size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download">
                          <IconButton size="small" aria-label="Download" onClick={() => handleDownload(asset)}>
                            <Download size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit / Replace">
                          <IconButton size="small" aria-label="Edit or replace asset" onClick={() => setEditTarget(asset)}>
                            <Pencil size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label="Delete"
                            onClick={() => setDeleteTarget(asset)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}

      {!isLoading && !isError && assets.length > 0 && viewMode === 'grid' && (
        <Grid container spacing={2}>
          {assets.map((asset) => (
            <Grid key={asset.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <AssetThumbnail asset={asset} onClick={() => setPreviewAsset(asset)} />
                <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box sx={{ mb: 1.5 }}>
                    <Typography
                      variant="subtitle2"
                      onClick={() => setPreviewAsset(asset)}
                      sx={{
                        color: themePalette.text.primary,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {asset.originalName}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                      {ASSET_CATEGORY_LABELS[asset.category]}
                    </Typography>
                    <Typography
                      variant="caption"
                      onClick={() => dispatch(openClientWorkspace(asset.clientId))}
                      sx={{
                        display: 'block',
                        cursor: 'pointer',
                        fontWeight: 500,
                        color: themePalette.text.secondary,
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {asset.clientName || 'Client'}
                    </Typography>
                  </Box>

                  <Stack
                    direction="row"
                    sx={{
                      pt: 1,
                      borderTop: `1px solid ${themePalette.divider}`,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatBytes(asset.sizeBytes)} · {formatShortDate(asset.createdAt)}
                    </Typography>
                    <Stack direction="row" spacing={0.25}>
                      <Tooltip title="Preview">
                        <IconButton size="small" aria-label="Preview" onClick={() => setPreviewAsset(asset)}>
                          <Eye size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton size="small" aria-label="Download" onClick={() => handleDownload(asset)}>
                          <Download size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit / Replace">
                        <IconButton size="small" aria-label="Edit or replace asset" onClick={() => setEditTarget(asset)}>
                          <Pencil size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" aria-label="Delete" onClick={() => setDeleteTarget(asset)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Client Asset</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              select
              label="Target Client"
              fullWidth
              value={uploadClientId}
              onChange={(e) => setUploadClientId(e.target.value)}
            >
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.companyName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Asset Category"
              fullWidth
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as AssetCategory)}
            >
              {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {ASSET_CATEGORY_LABELS[cat]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Asset Notes / Description (Optional)"
              placeholder="e.g., Primary vector lockup for dark backgrounds"
              fullWidth
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
            />
            {uploadClientId && (
              <FileUploader
                clientId={uploadClientId}
                category={uploadCategory}
                description={uploadDescription}
                label="Choose file to upload"
                onUploaded={() => {
                  refetch();
                  setUploadDescription('');
                  setUploadModalOpen(false);
                  dispatch(showToast({ severity: 'success', text: 'Asset uploaded to Cloudinary storage' }));
                }}
                onError={(msg) => dispatch(showToast({ severity: 'error', text: msg }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setUploadModalOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <FilePreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      <AssetManageDialog
        asset={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => refetch()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.originalName}?`}
        description="This permanently removes the file from Cloudinary cloud storage."
        confirmLabel="Delete Asset"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageContainer>
  );
}
