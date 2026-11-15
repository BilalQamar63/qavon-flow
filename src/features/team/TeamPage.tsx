import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ClientAvatar } from '../../components/common/ClientAvatar';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import {
  useAddTeamMemberMutation,
  useGetSessionQuery,
  useGetSettingsQuery,
  useRemoveTeamMemberMutation,
  useUpdateTeamRoleMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import { themePalette } from '../../theme';
import type { TeamMember } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatRelativeTime } from '../../utils/format';

export function TeamPage() {
  const dispatch = useAppDispatch();
  const { data: sessionData } = useGetSessionQuery();
  const isAdmin = sessionData?.user.role === 'admin';
  const currentUserId = sessionData?.user.id;

  const { data, isLoading, isError, refetch } = useGetSettingsQuery();
  const [addMember, { isLoading: adding }] = useAddTeamMemberMutation();
  const [updateRole] = useUpdateTeamRoleMutation();
  const [removeMember, { isLoading: removing }] = useRemoveTeamMemberMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [formError, setFormError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState variant="table" rows={4} />
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <ErrorState message="Unable to load agency team members." onRetry={refetch} />
      </PageContainer>
    );
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await addMember({ name, email, role, title }).unwrap();
      setDialogOpen(false);
      setName('');
      setEmail('');
      setTitle('');
      setRole('member');
      dispatch(showToast({ severity: 'success', text: `Added ${res.member.name} to the team` }));
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Failed to add team member'));
    }
  };

  const handleRoleChange = async (member: TeamMember, nextRole: 'admin' | 'member') => {
    try {
      await updateRole({ userId: member.id, role: nextRole }).unwrap();
      dispatch(showToast({ severity: 'success', text: `Updated ${member.name}'s role` }));
    } catch (err: unknown) {
      dispatch(showToast({ severity: 'error', text: getApiErrorMessage(err, 'Role update failed') }));
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMember({ userId: removeTarget.id }).unwrap();
      dispatch(showToast({ severity: 'success', text: `Removed ${removeTarget.name}` }));
      setRemoveTarget(null);
    } catch (err: unknown) {
      dispatch(showToast({ severity: 'error', text: getApiErrorMessage(err, 'Removal failed') }));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Team & Permissions"
        subtitle="Manage agency administrators and producers who can review submissions and decrypt client credentials."
        actions={
          isAdmin ? (
            <Button
              variant="contained"
              color="primary"
              startIcon={<UserPlus size={16} />}
              onClick={() => setDialogOpen(true)}
            >
              Add Team Member
            </Button>
          ) : undefined
        }
      />

      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          You are signed in as an Agency Team Member. Only Agency Administrators can add, remove, or modify team roles.
        </Alert>
      )}

      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Member</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Title</TableCell>
                <TableCell>Role</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Last Active</TableCell>
                {isAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.team.map((member) => (
                <TableRow key={member.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <ClientAvatar name={member.name} size={34} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                          {member.name}
                          {member.id === currentUserId ? ' (You)' : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {member.email}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ display: { xs: 'block', sm: 'none' }, color: themePalette.text.secondary }}
                        >
                          {member.title}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{member.title}</TableCell>
                  <TableCell>
                    {isAdmin && member.id !== currentUserId ? (
                      <TextField
                        select
                        size="small"
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as 'admin' | 'member')
                        }
                        sx={{ minWidth: { xs: 120, sm: 145 } }}
                      >
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="member">Team Member</MenuItem>
                      </TextField>
                    ) : (
                      <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 500 }}>
                        {member.role}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      display: { xs: 'none', md: 'table-cell' },
                    }}
                  >
                    {formatRelativeTime(member.lastActiveAt)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      {member.id !== currentUserId && (
                        <Tooltip title="Remove Team Member">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setRemoveTarget(member)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setFormError(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <Box component="form" onSubmit={handleAdd}>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogContent dividers>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <Stack spacing={2}>
              <TextField
                label="Full Name"
                required
                fullWidth
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Work Email"
                type="email"
                required
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Job Title"
                required
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Creative Director"
              />
              <TextField
                select
                label="Role"
                fullWidth
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              >
                <MenuItem value="member">Team Member (Assigned clients & asset review)</MenuItem>
                <MenuItem value="admin">Administrator (Full agency & settings access)</MenuItem>
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary" disabled={adding}>
              {adding ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name}?`}
        description="They will immediately lose access to the agency workspace and client portals."
        confirmLabel="Remove Member"
        destructive
        loading={removing}
        onConfirm={handleRemove}
        onClose={() => setRemoveTarget(null)}
      />
    </PageContainer>
  );
}
