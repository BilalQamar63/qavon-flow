import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FolderOpen,
  Hourglass,
  Mail,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ClientAvatar } from '../../components/common/ClientAvatar';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { FilePreviewDialog } from '../../components/common/FilePreviewDialog';
import { FileTypeBadge } from '../../components/common/FileTypeBadge';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { ProgressIndicator } from '../../components/common/ProgressIndicator';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { QAVONFLOW_BRANDING } from '../../constants/branding';
import { ASSET_CATEGORY_LABELS } from '../../constants/onboarding';
import {
  useGetAssetDownloadUrlMutation,
  useGetClientsQuery,
  useGetDashboardOverviewQuery,
  useGetSessionQuery,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import {
  navigateClientsWithFilter,
  openClientWorkspace,
  setActivePage,
  showToast,
  type ClientStatusFilter,
} from '../../store/slices/uiSlice';
import { FONT_DISPLAY, themePalette } from '../../theme';
import type { AssetRecord, ClientOnboardingStatus, ClientRecord } from '../../types';
import { triggerAssetDownload } from '../../utils/apiError';
import { formatBytes, formatRelativeTime, formatShortDate } from '../../utils/format';
import { ClientFormDialog } from '../clients/ClientFormDialog';
import { InviteClientDialog } from '../clients/InviteClientDialog';

const STATUS_BAR_COLORS: Record<ClientOnboardingStatus, string> = {
  completed: themePalette.status.success,
  in_review: themePalette.status.info,
  in_progress: themePalette.accent.main,
  pending: themePalette.text.muted,
  overdue: themePalette.status.error,
  archived: themePalette.divider,
};

const TODAY_HEADER_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

function StatusDonutChart({
  segments,
  total,
  averageCompletion,
}: {
  segments: { status: ClientOnboardingStatus; label: string; count: number }[];
  total: number;
  averageCompletion: number;
}) {
  const size = 128;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = useMemo(() => {
    if (total === 0) return [];
    const activeSegments = segments.filter((s) => s.count > 0);
    const gap = activeSegments.length > 1 ? 2.5 : 0;
    let cumulativeOffset = 0;

    return activeSegments.map((s) => {
      const length = (s.count / total) * circumference;
      const visibleLen = Math.max(0, length - gap);
      const dashOffset = -cumulativeOffset;
      cumulativeOffset += length;
      return {
        ...s,
        color: STATUS_BAR_COLORS[s.status],
        dashArray: `${visibleLen} ${circumference - visibleLen}`,
        dashOffset,
      };
    });
  }, [segments, total, circumference]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Average onboarding completion ${averageCompletion}% across ${total} clients`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={themePalette.background.subtle}
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.status}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontSize: '1.375rem',
            fontWeight: 700,
            lineHeight: 1.1,
            color: themePalette.text.primary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {averageCompletion}%
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6875rem' }}>
          Avg. completion
        </Typography>
      </Box>
    </Box>
  );
}

export function OverviewPage() {
  const dispatch = useAppDispatch();
  const { data: sessionData } = useGetSessionQuery();
  const { data, isLoading, isError, refetch } = useGetDashboardOverviewQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [selectedInviteClientId, setSelectedInviteClientId] = useState('');
  const [invitingClient, setInvitingClient] = useState<ClientRecord | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);

  const { data: clientsData } = useGetClientsQuery(
    { status: 'all' },
    { skip: !invitePickerOpen && !invitingClient },
  );
  const [getDownloadUrl] = useGetAssetDownloadUrlMutation();

  const allClients = clientsData?.clients || data?.recentClients || [];

  useEffect(() => {
    if (!invitePickerOpen || !clientsData?.clients?.length || selectedInviteClientId) return;
    const preferred =
      clientsData.clients.find((c) => c.latestInvitationStatus !== 'accepted') ||
      clientsData.clients[0];
    setSelectedInviteClientId(preferred.id);
  }, [invitePickerOpen, clientsData, selectedInviteClientId]);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState variant="dashboard" />
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <ErrorState message="Failed to load dashboard overview from the database." onRetry={refetch} />
      </PageContainer>
    );
  }

  const {
    stats,
    statusDistribution,
    sectionCompletionRates,
    recentClients,
    pendingRequirements,
    recentAssets,
    recentActivity,
  } = data;

  const user = sessionData?.user;
  const firstName = user?.name.split(/\s+/)[0] || 'Team';
  const todayLabel = TODAY_HEADER_FORMATTER.format(new Date());

  const pendingRequestCount = stats.pendingOnboardings + stats.overdueOnboardings;

  const handleOpenInviteQuickAction = () => {
    if (stats.totalClients === 0 && recentClients.length === 0) {
      setCreateOpen(true);
      return;
    }
    const source = clientsData?.clients || recentClients;
    const preferred =
      source.find((c) => c.latestInvitationStatus !== 'accepted') || source[0];
    setSelectedInviteClientId(preferred?.id || '');
    setInvitePickerOpen(true);
  };

  const handleConfirmInviteClient = () => {
    const match = allClients.find((c) => c.id === selectedInviteClientId);
    setInvitePickerOpen(false);
    if (match) {
      setInvitingClient(match);
    }
  };

  const handleDownloadAsset = async (asset: AssetRecord) => {
    try {
      const { url } = await getDownloadUrl({ id: asset.id }).unwrap();
      triggerAssetDownload(url, asset.originalName);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to generate download link' }));
    }
  };

  return (
    <PageContainer>
      {/* 1. Welcome Section with Agency Context + 8. Quick Actions */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2.5}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', lg: 'center' },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 600,
                  color: themePalette.text.secondary,
                  mb: 0.5,
                }}
              >
                {user?.agencyName || 'Agency Workspace'} · {QAVONFLOW_BRANDING.name} · {todayLabel}
              </Typography>
              <Typography variant="h1" sx={{ textWrap: 'balance', mb: 0.75 }}>
                Welcome back, {firstName}
              </Typography>
              <Typography variant="body2" sx={{ maxWidth: 660 }}>
                {stats.totalClients === 0
                  ? `${QAVONFLOW_BRANDING.marketingPhrase} Create your first client workspace to collect brand assets, copy, and credentials in one centralized place.`
                  : `${stats.activeOnboardings} active onboarding${stats.activeOnboardings === 1 ? '' : 's'} and ${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'} across ${stats.totalClients} client workspace${stats.totalClients === 1 ? '' : 's'}, averaging ${stats.averageCompletion}% completion. ${QAVONFLOW_BRANDING.marketingPhrase}`}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1.25}
              useFlexGap
              sx={{ flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}
            >
              <Button
                variant="contained"
                color="primary"
                startIcon={<Plus size={16} />}
                onClick={() => setCreateOpen(true)}
              >
                New Client
              </Button>
              <Button
                variant="outlined"
                startIcon={<Mail size={15} />}
                onClick={handleOpenInviteQuickAction}
              >
                Send Portal Invite
              </Button>
              <Button
                variant="outlined"
                startIcon={<FolderOpen size={15} />}
                onClick={() => dispatch(setActivePage('assets'))}
              >
                Asset Library
              </Button>
              <Button
                variant="outlined"
                startIcon={<Settings size={15} />}
                onClick={() => dispatch(setActivePage('settings'))}
              >
                Template
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* 2. Overview Statistics (4 Balanced Cards) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Total Clients"
            value={stats.totalClients}
            detail="Active client workspaces"
            icon={<Users size={17} />}
            onClick={() => dispatch(navigateClientsWithFilter('all'))}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Active Onboardings"
            value={stats.activeOnboardings}
            detail={`${stats.averageCompletion}% average completion`}
            tone="accent"
            icon={<Clock size={17} />}
            onClick={() => dispatch(navigateClientsWithFilter('in_progress'))}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Completed Onboardings"
            value={stats.completedOnboardings}
            detail="Approved & ready for delivery"
            tone="success"
            icon={<CheckCircle2 size={17} />}
            onClick={() => dispatch(navigateClientsWithFilter('completed'))}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Pending Requests"
            value={pendingRequestCount}
            detail={`${stats.pendingOnboardings} awaiting start · ${stats.overdueOnboardings} overdue`}
            tone={stats.overdueOnboardings > 0 ? 'danger' : 'neutral'}
            icon={
              stats.overdueOnboardings > 0 ? (
                <AlertTriangle size={17} />
              ) : (
                <Hourglass size={17} />
              )
            }
            onClick={() =>
              dispatch(
                navigateClientsWithFilter(stats.overdueOnboardings > 0 ? 'overdue' : 'pending'),
              )
            }
          />
        </Grid>
      </Grid>

      {/* 3. Onboarding Completion Analytics */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{
                  mb: 2.5,
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                }}
              >
                <Box>
                  <Typography variant="h4">Onboarding Completion Analytics</Typography>
                  <Typography variant="caption">
                    Client completion rate across each required onboarding module
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: themePalette.text.primary,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stats.totalClients} active client{stats.totalClients === 1 ? '' : 's'}
                </Typography>
              </Stack>

              {stats.totalClients === 0 ? (
                <EmptyState
                  embedded
                  title="No onboarding metrics yet"
                  description="Add a client workspace to track completion progress across the six onboarding modules."
                  icon={<Briefcase size={18} />}
                />
              ) : (
                <Stack spacing={2}>
                  {sectionCompletionRates.map((item) => (
                    <Box key={item.sectionKey}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ mb: 0.625, justifyContent: 'space-between', alignItems: 'baseline' }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, color: themePalette.text.primary }}
                        >
                          {item.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                        >
                          {item.completedCount}/{item.totalClients} clients ·{' '}
                          <Box
                            component="span"
                            sx={{ fontWeight: 700, color: themePalette.text.primary }}
                          >
                            {item.percentage}%
                          </Box>
                        </Typography>
                      </Stack>
                      <ProgressIndicator percentage={item.percentage} showPercent={false} height={7} />
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                Workspace Status Distribution
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mb: 2.5 }}>
                Click any status to inspect matching client workspaces
              </Typography>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2.5}
                sx={{ alignItems: { xs: 'center', sm: 'center' } }}
              >
                <StatusDonutChart
                  segments={statusDistribution}
                  total={stats.totalClients}
                  averageCompletion={stats.averageCompletion}
                />

                <Stack divider={<Divider />} spacing={0} sx={{ flex: 1, width: '100%' }}>
                  {statusDistribution.map((row) => {
                    const pct =
                      stats.totalClients === 0
                        ? 0
                        : Math.round((row.count / stats.totalClients) * 100);
                    return (
                      <Stack
                        key={row.status}
                        direction="row"
                        onClick={() =>
                          dispatch(navigateClientsWithFilter(row.status as ClientStatusFilter))
                        }
                        sx={{
                          py: 1,
                          px: 0.75,
                          mx: -0.75,
                          borderRadius: '6px',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: themePalette.background.default },
                        }}
                      >
                        <StatusBadge status={row.status} kind="client" />
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: FONT_DISPLAY,
                              fontWeight: 700,
                              color: themePalette.text.primary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.count}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                          >
                            {pct}%
                          </Typography>
                          <ChevronRight size={14} color={themePalette.text.muted} />
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 5. Recently Created Clients + 6. Pending Client Requirements */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction="row"
                sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Box>
                  <Typography variant="h4">Recently Created Clients</Typography>
                  <Typography variant="caption">
                    Newest onboarding workspaces and completion progress
                  </Typography>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowRight size={14} />}
                  onClick={() => dispatch(navigateClientsWithFilter('all'))}
                >
                  All Clients
                </Button>
              </Stack>

              {recentClients.length === 0 ? (
                <EmptyState
                  embedded
                  title="No client workspaces yet"
                  description="Create your first client to generate a magic portal link and start onboarding."
                  actionLabel="Create Client"
                  onAction={() => setCreateOpen(true)}
                  icon={<Briefcase size={18} />}
                />
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Client</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          Progress
                        </TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          Due Date
                        </TableCell>
                        <TableCell align="right" sx={{ width: 28 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recentClients.map((client) => (
                        <TableRow
                          key={client.id}
                          hover
                          onClick={() => dispatch(openClientWorkspace(client.id))}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                              <ClientAvatar name={client.companyName} size={32} />
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
                                  {client.companyName}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  {client.contactName} · {client.industry}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: { xs: 'block', sm: 'none' },
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {client.progress.overallPercentage}% · Due{' '}
                                  {formatShortDate(client.dueDate)}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={client.status} kind="client" />
                          </TableCell>
                          <TableCell sx={{ minWidth: 130, display: { xs: 'none', sm: 'table-cell' } }}>
                            <ProgressIndicator
                              percentage={client.progress.overallPercentage}
                              height={5}
                            />
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                              display: { xs: 'none', md: 'table-cell' },
                            }}
                          >
                            {formatShortDate(client.dueDate)}
                          </TableCell>
                          <TableCell align="right" sx={{ px: 0.5 }}>
                            <ChevronRight size={15} color={themePalette.text.muted} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction="row"
                sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Box>
                  <Typography variant="h4">Pending Client Requirements</Typography>
                  <Typography variant="caption">
                    Outstanding required fields and missing asset slots
                  </Typography>
                </Box>
                {pendingRequirements.length > 0 && (
                  <Button
                    size="small"
                    endIcon={<ArrowRight size={14} />}
                    onClick={() => dispatch(navigateClientsWithFilter('pending'))}
                  >
                    Follow Up
                  </Button>
                )}
              </Stack>

              {pendingRequirements.length === 0 ? (
                <EmptyState
                  embedded
                  title="All requirements fulfilled"
                  description="Active clients have submitted all required onboarding fields and asset slots."
                  icon={<CheckCircle2 size={18} />}
                />
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {pendingRequirements.map((item) => (
                    <Stack
                      key={item.clientId}
                      direction="row"
                      spacing={1.5}
                      onClick={() => dispatch(openClientWorkspace(item.clientId))}
                      sx={{
                        py: 1.375,
                        px: 0.75,
                        mx: -0.75,
                        borderRadius: '6px',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'background-color 120ms ease',
                        '&:hover': { bgcolor: themePalette.background.default },
                      }}
                    >
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
                          {item.companyName}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.8125rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Next: {item.nextRequirementLabel}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {item.missingCount} item{item.missingCount === 1 ? '' : 's'} remaining · Due{' '}
                          {formatShortDate(item.dueDate)}
                        </Typography>
                      </Box>
                      <StatusBadge status={item.status} kind="client" />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 7. Recent Uploaded Assets + 4. Recent Client Activity */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction="row"
                sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Box>
                  <Typography variant="h4">Recent Uploaded Assets</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {stats.totalAssets} total file{stats.totalAssets === 1 ? '' : 's'} stored across active workspaces
                  </Typography>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowRight size={14} />}
                  onClick={() => dispatch(setActivePage('assets'))}
                >
                  Asset Library
                </Button>
              </Stack>

              {recentAssets.length === 0 ? (
                <EmptyState
                  embedded
                  title="No assets uploaded yet"
                  description="Client logos, brand guidelines, website media, and contracts appear here once uploaded."
                  actionLabel="Open Asset Library"
                  onAction={() => dispatch(setActivePage('assets'))}
                  icon={<FolderOpen size={18} />}
                />
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {recentAssets.map((asset) => (
                    <Stack
                      key={asset.id}
                      direction="row"
                      spacing={1.5}
                      sx={{
                        py: 1.25,
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: 'center' }}>
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
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {asset.originalName}
                          </Typography>
                          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', display: 'block' }}>
                            <Box
                              component="span"
                              onClick={() => dispatch(openClientWorkspace(asset.clientId))}
                              sx={{
                                cursor: 'pointer',
                                fontWeight: 500,
                                color: themePalette.text.secondary,
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              {asset.clientName || 'Client'}
                            </Box>{' '}
                            · {ASSET_CATEGORY_LABELS[asset.category]} · {formatBytes(asset.sizeBytes)} ·{' '}
                            {formatRelativeTime(asset.createdAt)}
                          </Typography>
                        </Box>
                      </Stack>

                      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <Tooltip title="Preview File">
                          <IconButton size="small" onClick={() => setPreviewAsset(asset)}>
                            <Eye size={15} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download File">
                          <IconButton size="small" onClick={() => handleDownloadAsset(asset)}>
                            <Download size={15} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction="row"
                sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Box>
                  <Typography variant="h4">Recent Client Activity</Typography>
                  <Typography variant="caption">
                    Latest submissions, uploads, and reviews
                  </Typography>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowRight size={14} />}
                  onClick={() => dispatch(setActivePage('activity'))}
                >
                  Audit Log
                </Button>
              </Stack>

              {recentActivity.length === 0 ? (
                <EmptyState
                  embedded
                  title="No activity recorded yet"
                  description="Submissions, asset uploads, and portal events will stream here."
                />
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {recentActivity.slice(0, 6).map((log) => (
                    <Box
                      key={log.id}
                      onClick={
                        log.clientId ? () => dispatch(openClientWorkspace(log.clientId!)) : undefined
                      }
                      sx={{
                        py: 1.25,
                        px: 0.75,
                        mx: -0.75,
                        borderRadius: '6px',
                        cursor: log.clientId ? 'pointer' : 'default',
                        transition: 'background-color 120ms ease',
                        '&:hover': log.clientId ? { bgcolor: themePalette.background.default } : undefined,
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
                      >
                        <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                          {log.action}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                        >
                          {formatRelativeTime(log.createdAt)}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                        {log.details}
                      </Typography>
                      <Typography variant="caption">
                        {log.actorName} ({log.actorRole})
                        {log.clientName ? ` · ${log.clientName}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dashboard Quick Action Modals */}
      <ClientFormDialog
        open={createOpen}
        client={null}
        onClose={() => setCreateOpen(false)}
      />

      <Dialog
        open={invitePickerOpen}
        onClose={() => setInvitePickerOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Select Client to Invite</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Choose a client workspace to generate or resend a secure portal invitation link.
          </Typography>
          <TextField
            select
            label="Client Workspace"
            fullWidth
            value={selectedInviteClientId}
            onChange={(e) => setSelectedInviteClientId(e.target.value)}
          >
            {allClients.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.companyName} ({c.contactName})
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setInvitePickerOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!selectedInviteClientId}
            onClick={handleConfirmInviteClient}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      <InviteClientDialog
        client={invitingClient}
        onClose={() => setInvitingClient(null)}
      />

      <FilePreviewDialog
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
      />
    </PageContainer>
  );
}
