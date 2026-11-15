import {
  Box,
  Button,
  Card,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { Archive, Briefcase, Edit2, ExternalLink, Mail, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ClientAvatar } from '../../components/common/ClientAvatar';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressIndicator } from '../../components/common/ProgressIndicator';
import { SearchInput } from '../../components/common/SearchInput';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  useDeleteClientMutation,
  useGetClientsQuery,
  useGetSessionQuery,
} from '../../store/api/hubApi';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  openClientWorkspace,
  setClientStatusFilter,
  setGlobalSearch,
  showToast,
  type ClientStatusFilter,
} from '../../store/slices/uiSlice';
import { themePalette } from '../../theme';
import type { ClientRecord } from '../../types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatRelativeTime, formatShortDate } from '../../utils/format';
import { ClientFormDialog } from './ClientFormDialog';
import { InviteClientDialog } from './InviteClientDialog';

const STATUS_TABS: { value: ClientStatusFilter; label: string }[] = [
  { value: 'all', label: 'All Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'archived', label: 'Archived' },
];

export function ClientsPage() {
  const dispatch = useAppDispatch();
  const globalSearch = useAppSelector((s) => s.ui.globalSearch);
  const statusFilter = useAppSelector((s) => s.ui.clientStatusFilter);
  const { data: sessionData } = useGetSessionQuery();
  const isAdmin = sessionData?.user.role === 'admin';

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [invitingClient, setInvitingClient] = useState<ClientRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    client: ClientRecord;
    permanent: boolean;
  } | null>(null);

  const debouncedSearch = useDebouncedValue(globalSearch, 250);
  const { data, isLoading, isError, refetch } = useGetClientsQuery({
    search: debouncedSearch,
    status: statusFilter,
  });
  const [deleteClient, { isLoading: deleting }] = useDeleteClientMutation();

  const clients = data?.clients || [];

  const handleConfirmDelete = async () => {
    if (!confirmAction) return;
    try {
      await deleteClient({
        id: confirmAction.client.id,
        permanent: confirmAction.permanent,
      }).unwrap();
      dispatch(
        showToast({
          severity: 'success',
          text: confirmAction.permanent
            ? `Deleted ${confirmAction.client.companyName}`
            : `Archived ${confirmAction.client.companyName}`,
        }),
      );
      setConfirmAction(null);
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Action failed' }));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Client Workspaces"
        subtitle="Manage client onboarding records, assign producers, and send secure portal invitations."
        actions={
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setEditingClient(null);
              setFormOpen(true);
            }}
          >
            New Client
          </Button>
        }
      />

      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={2}
        sx={{
          mb: 2.5,
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', lg: 'center' },
        }}
      >
        <Tabs
          value={statusFilter}
          onChange={(_, val: ClientStatusFilter) => dispatch(setClientStatusFilter(val))}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: { xs: `1px solid ${themePalette.divider}`, lg: 'none' } }}
        >
          {STATUS_TABS.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>

        <SearchInput
          value={globalSearch}
          onChange={(v) => dispatch(setGlobalSearch(v))}
          placeholder="Search company, contact, industry..."
        />
      </Stack>

      {isLoading && <LoadingState variant="table" rows={5} />}
      {isError && (
        <ErrorState message="Unable to load client workspaces." onRetry={refetch} />
      )}

      {!isLoading && !isError && clients.length === 0 && (
        <EmptyState
          title="No matching clients"
          description={
            globalSearch || statusFilter !== 'all'
              ? 'Try clearing your search filter or switching onboarding status tabs.'
              : 'Create your first client workspace to begin collecting brand assets, website copy, and credentials.'
          }
          actionLabel={
            globalSearch || statusFilter !== 'all' ? 'Reset Filters' : 'Create Client'
          }
          onAction={() => {
            if (globalSearch || statusFilter !== 'all') {
              dispatch(setGlobalSearch(''));
              dispatch(setClientStatusFilter('all'));
            } else {
              setEditingClient(null);
              setFormOpen(true);
            }
          }}
          icon={<Briefcase size={20} />}
        />
      )}

      {!isLoading && !isError && clients.length > 0 && (
        <Card>
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Progress</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Invitation</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Assignee</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Due Date</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id} hover>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={1.5}
                        onClick={() => dispatch(openClientWorkspace(client.id))}
                        sx={{ cursor: 'pointer', alignItems: 'center' }}
                      >
                        <ClientAvatar name={client.companyName} size={36} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                            {client.companyName}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {client.contactName} · {client.email}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: { xs: 'block', sm: 'none' },
                              color: themePalette.text.secondary,
                              fontVariantNumeric: 'tabular-nums',
                              mt: 0.25,
                            }}
                          >
                            {client.progress.overallPercentage}% complete · Due{' '}
                            {formatShortDate(client.dueDate)}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={client.status} kind="client" />
                    </TableCell>
                    <TableCell sx={{ minWidth: 165, display: { xs: 'none', sm: 'table-cell' } }}>
                      <ProgressIndicator percentage={client.progress.overallPercentage} height={6} />
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {client.progress.completedSections}/{client.progress.totalSections} sections ·{' '}
                        {formatRelativeTime(client.progress.lastActivityAt)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {client.latestInvitationStatus ? (
                        <StatusBadge status={client.latestInvitationStatus} kind="invitation" />
                      ) : (
                        <Typography variant="caption">Not invited</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      <Typography variant="body2">
                        {client.assignedToName || 'Unassigned'}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        display: { xs: 'none', md: 'table-cell' },
                      }}
                    >
                      {formatShortDate(client.dueDate)}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="Open Onboarding Workspace">
                          <IconButton
                            size="small"
                            onClick={() => dispatch(openClientWorkspace(client.id))}
                          >
                            <ExternalLink size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Invite / Portal Link">
                          <IconButton
                            size="small"
                            onClick={() => setInvitingClient(client)}
                          >
                            <Mail size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Client">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingClient(client);
                              setFormOpen(true);
                            }}
                          >
                            <Edit2 size={16} />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip
                            title={
                              client.status === 'archived'
                                ? 'Permanently Delete Client'
                                : 'Archive Client'
                            }
                          >
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() =>
                                setConfirmAction({
                                  client,
                                  permanent: client.status === 'archived',
                                })
                              }
                            >
                              {client.status === 'archived' ? (
                                <Trash2 size={16} />
                              ) : (
                                <Archive size={16} />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}

      <ClientFormDialog
        open={formOpen}
        client={editingClient}
        onClose={() => setFormOpen(false)}
      />

      <InviteClientDialog
        client={invitingClient}
        onClose={() => setInvitingClient(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.permanent
            ? `Permanently delete ${confirmAction.client.companyName}?`
            : `Archive ${confirmAction?.client.companyName}?`
        }
        description={
          confirmAction?.permanent
            ? 'This permanently removes the client workspace, onboarding submissions, encrypted credentials, and uploaded files. This cannot be undone.'
            : 'Archiving hides the client from active dashboards and suspends their portal link without deleting stored files.'
        }
        confirmLabel={confirmAction?.permanent ? 'Delete Permanently' : 'Archive Client'}
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmAction(null)}
      />
    </PageContainer>
  );
}
