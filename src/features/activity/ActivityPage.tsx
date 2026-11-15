import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { useGetActivityLogsQuery } from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { openClientWorkspace } from '../../store/slices/uiSlice';
import { themePalette } from '../../theme';
import { formatShortDate, formatShortTime } from '../../utils/format';

export function ActivityPage() {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useGetActivityLogsQuery();

  const filteredLogs = useMemo(() => {
    const logs = data?.activity || [];
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        (log.clientName || '').toLowerCase().includes(q),
    );
  }, [data?.activity, search]);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState variant="table" rows={6} />
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <ErrorState message="Unable to load audit activity log." onRetry={refetch} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Activity & Audit Log"
        subtitle="Immutable record of onboarding submissions, file uploads, client invitations, and audited credential decryption events."
        actions={
          data.activity.length > 0 ? (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Filter audit events..."
            />
          ) : undefined
        }
      />

      {filteredLogs.length === 0 ? (
        <EmptyState
          title={search ? 'No matching audit events' : 'No activity logged yet'}
          description={
            search
              ? 'Try clearing your audit filter to view all recorded events.'
              : 'Events will appear here as clients submit sections, upload brand assets, or access credentials.'
          }
          actionLabel={search ? 'Clear Filter' : undefined}
          onAction={search ? () => setSearch('') : undefined}
          icon={<Activity size={20} />}
        />
      ) : (
        <Card>
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Timestamp</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Details</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Actor</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        display: { xs: 'none', sm: 'table-cell' },
                      }}
                    >
                      {formatShortDate(log.createdAt)} · {formatShortTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                        {log.action}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ display: { xs: 'block', md: 'none' }, mt: 0.25 }}
                      >
                        {log.details}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: { xs: 'block', sm: 'none' },
                          fontVariantNumeric: 'tabular-nums',
                          mt: 0.25,
                        }}
                      >
                        {formatShortDate(log.createdAt)} · {log.actorName}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {log.details}
                    </TableCell>
                    <TableCell>
                      {log.clientId && log.clientName ? (
                        <Typography
                          variant="body2"
                          onClick={() => dispatch(openClientWorkspace(log.clientId!))}
                          sx={{
                            cursor: 'pointer',
                            fontWeight: 500,
                            color: themePalette.text.primary,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {log.clientName}
                        </Typography>
                      ) : (
                        <Typography variant="caption">Agency</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, whiteSpace: 'nowrap' }}>
                      {log.actorName} ({log.actorRole})
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}
    </PageContainer>
  );
}
