import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Copy, Eye, EyeOff, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  useAddCredentialMutation,
  useDeleteCredentialMutation,
  useRevealCredentialMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import { FONT_MONO, themePalette } from '../../theme';
import type { CredentialSummary, RevealedCredential, UserRole } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatShortDate } from '../../utils/format';

interface CredentialVaultPanelProps {
  clientId: string;
  credentials: CredentialSummary[];
  viewerRole: UserRole;
  readOnly?: boolean;
}

const ACCESS_TYPE_LABELS: Record<CredentialSummary['accessType'], string> = {
  delegated_invite: 'Delegated Invite',
  temporary_token: 'Temporary Token',
  username_password: 'Username / Password',
};

export function CredentialVaultPanel({
  clientId,
  credentials,
  viewerRole,
  readOnly = false,
}: CredentialVaultPanelProps) {
  const dispatch = useAppDispatch();
  const [addCredential, { isLoading: adding }] = useAddCredentialMutation();
  const [revealCredential, { isLoading: revealing }] = useRevealCredentialMutation();
  const [deleteCredential, { isLoading: deleting }] = useDeleteCredentialMutation();

  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState<'hosting' | 'domain' | 'cms' | 'analytics' | 'other'>('hosting');
  const [accessType, setAccessType] = useState<'delegated_invite' | 'temporary_token' | 'username_password'>('delegated_invite');
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showSecretInput, setShowSecretInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [revealedMap, setRevealedMap] = useState<Record<string, RevealedCredential>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canReveal = viewerRole === 'admin' || viewerRole === 'member';
  const shouldMaskInput = accessType !== 'delegated_invite' && !showSecretInput;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!serviceName.trim() || !username.trim() || !secretValue.trim()) {
      setErrorMsg('Please enter the service name, account email/username, and access secret or invite confirmation.');
      return;
    }
    try {
      await addCredential({
        clientId,
        serviceName: serviceName.trim(),
        category,
        accessType,
        loginUrl: loginUrl.trim(),
        username: username.trim(),
        secretValue: secretValue.trim(),
        notes: notes.trim(),
      }).unwrap();
      setServiceName('');
      setLoginUrl('');
      setUsername('');
      setSecretValue('');
      setShowSecretInput(false);
      setNotes('');
      dispatch(
        showToast({
          severity: 'success',
          text: 'Credential encrypted (AES-256-GCM) and stored securely',
        }),
      );
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to save encrypted credential'));
    }
  };

  const handleReveal = async (credId: string) => {
    if (revealedMap[credId]) {
      const next = { ...revealedMap };
      delete next[credId];
      setRevealedMap(next);
      return;
    }
    try {
      const res = await revealCredential({ clientId, credId }).unwrap();
      setRevealedMap((prev) => ({ ...prev, [credId]: res }));
      dispatch(
        showToast({
          severity: 'info',
          text: 'Credential decrypted and logged to audit trail',
        }),
      );
    } catch (err: unknown) {
      dispatch(
        showToast({
          severity: 'error',
          text: getApiErrorMessage(err, 'Not authorized to reveal this credential'),
        }),
      );
    }
  };

  const handleCopy = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      dispatch(showToast({ severity: 'success', text: `${label} copied to clipboard` }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Unable to copy to clipboard' }));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCredential({ clientId, credId: deleteId }).unwrap();
      setDeleteId(null);
      dispatch(showToast({ severity: 'success', text: 'Credential removed from vault' }));
    } catch {
      dispatch(showToast({ severity: 'error', text: 'Failed to remove credential' }));
    }
  };

  return (
    <Box>
      <Alert severity="info" icon={<Lock size={18} />} sx={{ mb: 2.5 }}>
        Prefer <strong>delegated collaborator invites</strong> or <strong>temporary tokens</strong> over permanent passwords. Every entry is encrypted at rest with AES-256-GCM and masked in standard responses.
      </Alert>

      {/* Add Credential Form */}
      {!readOnly && (
      <Box
        component="form"
        onSubmit={handleAdd}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: '8px',
          bgcolor: themePalette.background.default,
          border: `1px solid ${themePalette.divider}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Add Encrypted Access Entry
        </Typography>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Service Name"
              required
              fullWidth
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Cloudflare DNS, WP Engine"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              select
              label="Category"
              fullWidth
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as 'hosting' | 'domain' | 'cms' | 'analytics' | 'other')
              }
            >
              <MenuItem value="hosting">Hosting</MenuItem>
              <MenuItem value="domain">Domain / DNS</MenuItem>
              <MenuItem value="cms">CMS / Admin</MenuItem>
              <MenuItem value="analytics">Analytics / Tag Manager</MenuItem>
              <MenuItem value="other">Third-Party Service</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              select
              label="Access Method"
              fullWidth
              value={accessType}
              onChange={(e) =>
                setAccessType(
                  e.target.value as 'delegated_invite' | 'temporary_token' | 'username_password',
                )
              }
            >
              <MenuItem value="delegated_invite">Delegated Invite (Recommended)</MenuItem>
              <MenuItem value="temporary_token">Temporary API Token</MenuItem>
              <MenuItem value="username_password">Username / Password</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Login / Console URL"
              fullWidth
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://dash.cloudflare.com"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Account Email or Username"
              required
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ops@company.com"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label={
                accessType === 'delegated_invite'
                  ? 'Invite Code / Confirmation Note'
                  : accessType === 'temporary_token'
                    ? 'Temporary API Token'
                    : 'Account Password'
              }
              type={shouldMaskInput ? 'password' : 'text'}
              required
              fullWidth
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder={
                accessType === 'delegated_invite'
                  ? 'e.g. Invite sent to engineering@agency.co'
                  : 'Enter secret value'
              }
              slotProps={{
                input:
                  accessType !== 'delegated_invite'
                    ? {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              aria-label={showSecretInput ? 'Hide secret' : 'Show secret'}
                              onClick={() => setShowSecretInput((v) => !v)}
                              edge="end"
                            >
                              {showSecretInput ? <EyeOff size={15} /> : <Eye size={15} />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }
                    : undefined,
              }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="2FA / Access Instructions (Optional)"
              fullWidth
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Authenticator contact or workspace role details"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={adding}
              startIcon={<Plus size={15} />}
            >
              {adding ? 'Encrypting & Saving...' : 'Encrypt & Save Access'}
            </Button>
          </Grid>
        </Grid>
      </Box>
      )}

      {/* Saved Encrypted Entries */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Stored Access Entries ({credentials.length})
      </Typography>

      {credentials.length === 0 ? (
        <Typography variant="body2">
          No encrypted credentials added yet. Add a delegated invite or temporary token above, or enter delegated access notes if invites were already sent by email.
        </Typography>
      ) : (
        <Stack
          divider={<Divider />}
          spacing={0}
          sx={{ border: `1px solid ${themePalette.divider}`, borderRadius: '8px', bgcolor: themePalette.background.paper }}
        >
          {credentials.map((cred) => {
            const revealed = revealedMap[cred.id];
            return (
              <Box key={cred.id} sx={{ p: 2 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                      {cred.serviceName}
                    </Typography>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {cred.category.toUpperCase()} · {ACCESS_TYPE_LABELS[cred.accessType]} · Added{' '}
                      {formatShortDate(cred.createdAt)}
                      {cred.lastRevealedAt ? ` · Last decrypted ${formatShortDate(cred.lastRevealedAt)}` : ''}
                    </Typography>
                    {cred.loginUrl && (
                      <Typography variant="caption" sx={{ display: 'block', color: themePalette.text.secondary }}>
                        URL: {cred.loginUrl}
                      </Typography>
                    )}
                    <Typography
                      sx={{
                        fontFamily: FONT_MONO,
                        fontSize: '0.8125rem',
                        mt: 0.5,
                        color: themePalette.text.primary,
                      }}
                    >
                      User: {revealed ? revealed.username : cred.usernameMasked}
                    </Typography>
                    {cred.notes && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                        Note: {cred.notes}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    {canReveal ? (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={revealing}
                        startIcon={revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        onClick={() => handleReveal(cred.id)}
                      >
                        {revealed ? 'Hide Secret' : 'Reveal Secret'}
                      </Button>
                    ) : (
                      <Stack direction="row" spacing={0.5} sx={{ color: themePalette.status.success, alignItems: 'center' }}>
                        <ShieldCheck size={14} />
                        <Typography variant="caption" sx={{ color: themePalette.status.success, fontWeight: 500 }}>
                          AES-256-GCM Encrypted
                        </Typography>
                      </Stack>
                    )}
                    {!readOnly && (
                      <Tooltip title="Remove Credential">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Remove ${cred.serviceName}`}
                          onClick={() => setDeleteId(cred.id)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>

                {revealed && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      borderRadius: '6px',
                      bgcolor: themePalette.accent.soft,
                      border: `1px solid ${themePalette.accent.border}`,
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                      }}
                    >
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                        Secret: {revealed.secretValue}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Copy size={13} />}
                        onClick={() => handleCopy(revealed.secretValue, 'Secret')}
                        sx={{ flexShrink: 0 }}
                      >
                        Copy
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Remove Encrypted Credential?"
        description="This permanently deletes the encrypted access record from the client vault."
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </Box>
  );
}
