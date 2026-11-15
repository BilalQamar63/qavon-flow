import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { ONBOARDING_SECTIONS } from '../../constants/onboarding';
import {
  useGetSessionQuery,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/uiSlice';
import { FONT_MONO, themePalette } from '../../theme';
import type { OnboardingSectionKey } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const { data: sessionData } = useGetSessionQuery();
  const isAdmin = sessionData?.user.role === 'admin';

  const { data, isLoading, isError, refetch } = useGetSettingsQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateSettingsMutation();

  const [name, setName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#EDA320');
  const [defaultInviteExpiryDays, setDefaultInviteExpiryDays] = useState(14);
  const [sessionDurationHours, setSessionDurationHours] = useState(72);
  const [notifyOnSubmission, setNotifyOnSubmission] = useState(true);
  const [notifyOnAssetUpload, setNotifyOnAssetUpload] = useState(true);
  const [requiredSections, setRequiredSections] = useState<OnboardingSectionKey[]>([]);

  useEffect(() => {
    if (!data?.agency) return;
    setName(data.agency.name);
    setSupportEmail(data.agency.supportEmail);
    setWebsite(data.agency.website);
    setPrimaryColor(data.agency.primaryColor);
    setDefaultInviteExpiryDays(data.agency.defaultInviteExpiryDays);
    setSessionDurationHours(data.agency.sessionDurationHours);
    setNotifyOnSubmission(data.agency.notifyOnSubmission);
    setNotifyOnAssetUpload(data.agency.notifyOnAssetUpload);
    setRequiredSections(data.agency.requiredSections);
  }, [data]);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState rows={5} />
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <ErrorState message="Unable to load workspace settings." onRetry={refetch} />
      </PageContainer>
    );
  }

  const toggleSectionRequired = (key: OnboardingSectionKey) => {
    if (requiredSections.includes(key)) {
      if (requiredSections.length <= 1) return; // At least one required section
      setRequiredSections(requiredSections.filter((k) => k !== key));
    } else {
      setRequiredSections([...requiredSections, key]);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        name,
        supportEmail,
        website,
        primaryColor,
        defaultInviteExpiryDays,
        sessionDurationHours,
        notifyOnSubmission,
        notifyOnAssetUpload,
        requiredSections,
      }).unwrap();
      dispatch(showToast({ severity: 'success', text: 'Agency settings saved' }));
    } catch (err: unknown) {
      dispatch(
        showToast({ severity: 'error', text: getApiErrorMessage(err, 'Failed to update settings') }),
      );
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Workspace Settings"
        subtitle="Configure agency profile, notification preferences, onboarding template requirements, and security posture."
      />

      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          Settings are read-only for Team Members. Contact an Agency Administrator to update workspace configuration.
        </Alert>
      )}

      <Box component="form" onSubmit={handleSave}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h4" sx={{ mb: 2 }}>
                  Agency Profile & Branding
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Agency Name"
                      required
                      fullWidth
                      disabled={!isAdmin}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Support / Reply-To Email"
                      type="email"
                      required
                      fullWidth
                      disabled={!isAdmin}
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      label="Agency Website"
                      fullWidth
                      disabled={!isAdmin}
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Brand Accent Hex"
                      fullWidth
                      disabled={!isAdmin}
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h4" sx={{ mb: 0.5 }}>
                  Onboarding Template Requirements
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
                  Choose which sections count toward each client’s dynamic completion percentage.
                </Typography>

                <Stack divider={<Divider />} spacing={0}>
                  {ONBOARDING_SECTIONS.map((sec) => (
                    <Box key={sec.key} sx={{ py: 1 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            disabled={!isAdmin}
                            checked={requiredSections.includes(sec.key)}
                            onChange={() => toggleSectionRequired(sec.key)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                              {sec.title}
                            </Typography>
                            <Typography variant="caption">{sec.description}</Typography>
                          </Box>
                        }
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 5 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h4" sx={{ mb: 2 }}>
                  Invitations & Notifications
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Default Invitation Expiry (Days)"
                    type="number"
                    disabled={!isAdmin}
                    value={defaultInviteExpiryDays}
                    onChange={(e) => setDefaultInviteExpiryDays(Number(e.target.value))}
                  />
                  <TextField
                    label="Session Duration (Hours)"
                    type="number"
                    disabled={!isAdmin}
                    value={sessionDurationHours}
                    onChange={(e) => setSessionDurationHours(Number(e.target.value))}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        disabled={!isAdmin}
                        checked={notifyOnSubmission}
                        onChange={(e) => setNotifyOnSubmission(e.target.checked)}
                      />
                    }
                    label="Notify team when client submits a section"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        disabled={!isAdmin}
                        checked={notifyOnAssetUpload}
                        onChange={(e) => setNotifyOnAssetUpload(e.target.checked)}
                      />
                    }
                    label="Notify team when client uploads new assets"
                  />
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                  <ShieldCheck size={18} color={themePalette.status.success} />
                  <Typography variant="h4">Security & Infrastructure Status</Typography>
                </Stack>
                <Stack spacing={1.25}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">Credential Encryption</Typography>
                    <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                      {data.securityStatus.encryptionAlgorithm}
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">Explicit ENCRYPTION_KEY Env</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {data.securityStatus.encryptionKeyConfigured
                        ? 'Configured'
                        : 'Local Persisted Dev Key'}
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">SMTP Mail Transport</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {data.securityStatus.smtpConfigured
                        ? 'Configured'
                        : 'Preview Mode (No SMTP)'}
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">Database Engine</Typography>
                    <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                      {data.securityStatus.databaseDriver === 'postgresql'
                        ? 'postgresql (Neon)'
                        : data.securityStatus.databaseDriver || 'sqlite'}
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">File Storage Driver</Typography>
                    <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                      {data.securityStatus.storageDriver}
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}
                  >
                    <Typography variant="body2">Cloudinary Credentials</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: data.securityStatus.cloudinaryConfigured
                          ? themePalette.status.success
                          : themePalette.status.warning,
                      }}
                    >
                      {data.securityStatus.cloudinaryConfigured
                        ? 'Configured'
                        : 'Missing CLOUDINARY_* Env'}
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            {isAdmin && (
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                disabled={saving}
                startIcon={<Save size={16} />}
              >
                {saving ? 'Saving Settings...' : 'Save Agency Settings'}
              </Button>
            )}
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
}
