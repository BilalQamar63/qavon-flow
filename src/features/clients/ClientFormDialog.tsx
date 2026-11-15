import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';
import { CLIENT_STATUS_LABELS } from '../../constants/onboarding';
import {
  useCreateClientMutation,
  useGetSessionQuery,
  useGetSettingsQuery,
  useUpdateClientMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import type { ClientOnboardingStatus, ClientRecord } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';

interface ClientFormDialogProps {
  open: boolean;
  client: ClientRecord | null;
  onClose: () => void;
}

export function ClientFormDialog({ open, client, onClose }: ClientFormDialogProps) {
  const dispatch = useAppDispatch();
  const { data: sessionData } = useGetSessionQuery();
  const isAdmin = sessionData?.user.role === 'admin';
  const { data: settingsData } = useGetSettingsQuery();
  const [createClient, { isLoading: creating }] = useCreateClientMutation();
  const [updateClient, { isLoading: updating }] = useUpdateClientMutation();

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<ClientOnboardingStatus>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setCompanyName(client.companyName);
      setContactName(client.contactName);
      setEmail(client.email);
      setPhone(client.phone);
      setWebsite(client.website);
      setIndustry(client.industry);
      setDescription(client.description);
      setInternalNotes(client.internalNotes);
      setAssignedToId(client.assignedToId || '');
      setDueDate(client.dueDate ? client.dueDate.slice(0, 10) : '');
      setStatus(client.status);
    } else {
      setCompanyName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setWebsite('');
      setIndustry('');
      setDescription('');
      setInternalNotes('');
      setAssignedToId('');
      setDueDate('');
      setStatus('pending');
    }
    setErrorMsg(null);
  }, [client, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      if (client) {
        await updateClient({
          id: client.id,
          patch: {
            companyName,
            contactName,
            email,
            phone,
            website,
            industry,
            description,
            internalNotes,
            ...(isAdmin ? { assignedToId: assignedToId || null } : {}),
            dueDate: dueDate || null,
            status,
          },
        }).unwrap();
        dispatch(showToast({ severity: 'success', text: `Updated ${companyName}` }));
      } else {
        await createClient({
          companyName,
          contactName,
          email,
          phone,
          website,
          industry,
          description,
          internalNotes,
          ...(isAdmin ? { assignedToId: assignedToId || null } : {}),
          dueDate: dueDate || null,
        }).unwrap();
        dispatch(showToast({ severity: 'success', text: `Created workspace for ${companyName}` }));
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Unable to save client record'));
    }
  };

  const team = settingsData?.team || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {client ? `Edit ${client.companyName}` : 'Add New Client Workspace'}
        </DialogTitle>
        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Company Name"
                required
                fullWidth
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Industry"
                required
                fullWidth
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. SaaS, Logistics, Healthcare"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Primary Contact Name"
                required
                fullWidth
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Contact Email"
                type="email"
                required
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Phone Number"
                fullWidth
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Website"
                fullWidth
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
              />
            </Grid>
            {isAdmin && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="Assigned Team Member"
                  fullWidth
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {team.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name} ({m.title})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Target Onboarding Due Date"
                type="date"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Grid>
            {client && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="Onboarding Status"
                  fullWidth
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ClientOnboardingStatus)}
                >
                  {(Object.keys(CLIENT_STATUS_LABELS) as ClientOnboardingStatus[])
                    .filter((key) => isAdmin || key !== 'archived')
                    .map((key) => (
                      <MenuItem key={key} value={key}>
                        {CLIENT_STATUS_LABELS[key]}
                      </MenuItem>
                    ))}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Company Description"
                multiline
                rows={2}
                fullWidth
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Internal Agency Notes (Hidden from client)"
                multiline
                rows={2}
                fullWidth
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={creating || updating}>
            {creating || updating ? 'Saving...' : client ? 'Save Changes' : 'Create Client'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
