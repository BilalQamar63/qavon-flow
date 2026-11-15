import {
  Alert,
  Box,
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
import { Ban, Copy, ExternalLink, RefreshCw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  useAcceptInvitationTokenMutation,
  useCreateInvitationMutation,
  useGetInvitationsQuery,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import { FONT_MONO, themePalette } from '../../theme';
import type { ClientRecord } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatShortDate } from '../../utils/format';

interface InviteClientDialogProps {
  client: ClientRecord | null;
  onClose: () => void;
}

export function InviteClientDialog({ client, onClose }: InviteClientDialogProps) {
  const dispatch = useAppDispatch();
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  const { data } = useGetInvitationsQuery(
    { clientId: client?.id },
    { skip: !client },
  );
  const [createInvitation, { isLoading: creating }] = useCreateInvitationMutation();
  const [resendInvitation, { isLoading: resending }] = useResendInvitationMutation();
  const [revokeInvitation, { isLoading: revoking }] = useRevokeInvitationMutation();
  const [acceptPortalToken] = useAcceptInvitationTokenMutation();

  useEffect(() => {
    setGeneratedUrl(null);
    setDeliveryNotice(null);
    setExpiresInDays(14);
  }, [client?.id]);

  if (!client) return null;

  const invitations = data?.invitations || [];

  const handleGenerate = async () => {
    try {
      const res = await createInvitation({
        clientId: client.id,
        expiresInDays,
        sendEmail: true,
      }).unwrap();
      if (res.invitation.portalPreviewUrl) {
        setGeneratedUrl(res.invitation.portalPreviewUrl);
      }
      setDeliveryNotice(
        res.invitation.emailDelivery?.delivered
          ? `Invitation dispatched via email to ${client.email}.`
          : res.invitation.emailDelivery?.reason ||
              'SMTP is not configured. Copy the secure magic portal link below.',
      );
      dispatch(showToast({ severity: 'success', text: 'Secure invitation generated' }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to generate invitation' }));
    }
  };

  const handleResend = async (id: string) => {
    try {
      const res = await resendInvitation({ id }).unwrap();
      if (res.portalPreviewUrl) {
        setGeneratedUrl(res.portalPreviewUrl);
      }
      setDeliveryNotice(
        res.emailDelivery.delivered
          ? 'Invitation resent via email.'
          : res.emailDelivery.reason || 'Fresh link generated. Copy and share below.',
      );
      dispatch(showToast({ severity: 'success', text: 'Fresh invitation link issued' }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to resend invitation' }));
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeInvitation({ id }).unwrap();
      setGeneratedUrl(null);
      dispatch(showToast({ severity: 'info', text: 'Invitation revoked' }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to revoke invitation' }));
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      dispatch(showToast({ severity: 'success', text: 'Portal magic link copied to clipboard' }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Unable to copy to clipboard' }));
    }
  };

  const handlePreviewAsClient = async () => {
    if (!generatedUrl) return;
    try {
      const url = new URL(generatedUrl, window.location.origin);
      const token = url.searchParams.get('portalToken') || '';
      if (!token) return;
      await acceptPortalToken({ token }).unwrap();
      onClose();
    } catch (err: unknown) {
      dispatch(
        showToast({
          severity: 'error',
          text: getApiErrorMessage(err, 'Unable to open client portal preview'),
        }),
      );
    }
  };

  return (
    <Dialog open={Boolean(client)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Client Portal Invitation — {client.companyName}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2.5 }}>
          Generate an expiring, hashed portal invitation for <strong>{client.contactName}</strong> ({client.email}).
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ mb: 2, alignItems: 'stretch' }}
        >
          <TextField
            select
            label="Expiration"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value={3}>3 days</MenuItem>
            <MenuItem value={7}>7 days</MenuItem>
            <MenuItem value={14}>14 days</MenuItem>
            <MenuItem value={30}>30 days</MenuItem>
          </TextField>

          <Button
            variant="contained"
            color="primary"
            disabled={creating}
            startIcon={<Send size={15} />}
            onClick={handleGenerate}
            sx={{ flex: 1 }}
          >
            {creating ? 'Generating...' : 'Generate & Send Invitation'}
          </Button>
        </Stack>

        {deliveryNotice && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {deliveryNotice}
          </Alert>
        )}

        {generatedUrl && (
          <Box
            sx={{
              p: 2,
              mb: 3,
              borderRadius: '8px',
              bgcolor: themePalette.accent.soft,
              border: `1px solid ${themePalette.accent.border}`,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: themePalette.text.primary, mb: 0.75 }}>
              Active Client Portal Magic Link
            </Typography>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                bgcolor: themePalette.background.paper,
                p: 1.25,
                borderRadius: '6px',
                border: `1px solid ${themePalette.divider}`,
                mb: 1.5,
              }}
            >
              {generatedUrl}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={handleCopy}>
                Copy Link
              </Button>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                startIcon={<ExternalLink size={14} />}
                onClick={handlePreviewAsClient}
              >
                Open as Client
              </Button>
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 1.5, color: themePalette.text.primary }}>
          Invitation History
        </Typography>

        {invitations.length === 0 ? (
          <Typography variant="body2">No invitations issued yet for this client.</Typography>
        ) : (
          <Stack divider={<Divider />} spacing={0}>
            {invitations.map((inv) => (
              <Stack
                key={inv.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.25}
                sx={{
                  py: 1.25,
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <StatusBadge status={inv.status} kind="invitation" />
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.25, wordBreak: 'break-word' }}>
                    Expires {formatShortDate(inv.expiresAt)} · {inv.email}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
                  {(inv.status === 'sent' || inv.status === 'pending' || inv.status === 'expired') && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={resending}
                      startIcon={<RefreshCw size={13} />}
                      onClick={() => handleResend(inv.id)}
                    >
                      Resend
                    </Button>
                  )}
                  {(inv.status === 'sent' || inv.status === 'pending') && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={revoking}
                      startIcon={<Ban size={13} />}
                      onClick={() => handleRevoke(inv.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
