import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { BrandLogo } from '../../components/common/BrandLogo';
import { QAVONFLOW_BRANDING } from '../../constants/branding';
import {
  useRegisterAgencyMutation,
  useRequestMagicLinkMutation,
  useVerifyMagicTokenMutation,
} from '../../store/api/hubApi';
import { FONT_MONO, themePalette } from '../../theme';
import { getApiErrorMessage } from '../../utils/apiError';

export function AuthView() {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('alex@studioamber.co');
  const [agencyName, setAgencyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [requestMagicLink, { isLoading: requesting }] = useRequestMagicLinkMutation();
  const [verifyMagicToken, { isLoading: verifying }] = useVerifyMagicTokenMutation();
  const [registerAgency, { isLoading: registering }] = useRegisterAgencyMutation();

  const handleRequestLink = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setPreviewUrl(null);
    try {
      const res = await requestMagicLink({ email }).unwrap();
      setInfoMsg(res.message);
      if (res.previewMagicUrl) {
        setPreviewUrl(res.previewMagicUrl);
      }
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Unable to generate magic link'));
    }
  };

  const handleVerifyPreviewLink = async () => {
    if (!previewUrl) return;
    setErrorMsg(null);
    try {
      const url = new URL(previewUrl, window.location.origin);
      const token = url.searchParams.get('magicToken') || '';
      await verifyMagicToken({ token }).unwrap();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Magic link verification failed'));
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await registerAgency({ agencyName, ownerName, email }).unwrap();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Unable to create agency workspace'));
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: themePalette.background.default,
        display: 'flex',
        flexDirection: { xs: 'column', lg: 'row' },
      }}
    >
      {/* Left Narrative Panel */}
      <Box
        sx={{
          flex: { lg: '0 0 46%' },
          bgcolor: themePalette.background.darkSurface,
          color: themePalette.text.onDark,
          p: { xs: 4, md: 7 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Box sx={{ mb: 5 }}>
            <BrandLogo surface="dark" size="lg" showByline />
          </Box>

          <Typography
            variant="h1"
            sx={{
              color: themePalette.text.onDark,
              fontSize: { xs: '1.85rem', md: '2.35rem' },
              lineHeight: 1.15,
              maxWidth: 460,
              textWrap: 'balance',
            }}
          >
            {QAVONFLOW_BRANDING.tagline}
          </Typography>

          <Typography
            sx={{
              mt: 2.5,
              color: themePalette.text.onDarkMuted,
              fontSize: '0.975rem',
              lineHeight: 1.6,
              maxWidth: 460,
            }}
          >
            {QAVONFLOW_BRANDING.supportingDescription} Collect brand assets, project requirements, website copy, and encrypted credentials with single-use magic links.
          </Typography>

          <Stack spacing={2} sx={{ mt: 5, maxWidth: 440 }}>
            {[
              'Passwordless magic-link authentication for agency teams & invited clients',
              'Six structured onboarding modules with real-time progress calculation',
              'Short-lived signed asset downloads & audited credential decryption',
            ].map((item) => (
              <Stack key={item} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <CheckCircle2
                  size={18}
                  color={themePalette.accent.main}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <Typography sx={{ fontSize: '0.875rem', color: themePalette.text.onDark }}>
                  {item}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ pt: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <ShieldCheck size={16} color={themePalette.accent.main} />
              <Typography sx={{ fontSize: '0.8125rem', color: themePalette.text.onDarkMuted }}>
                {QAVONFLOW_BRANDING.marketingPhrase}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: '0.75rem', color: themePalette.text.onDarkMuted }}>
              {QAVONFLOW_BRANDING.signature}
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* Right Authentication Card */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2.5, sm: 4, md: 6 },
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 460 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Tabs
              value={tab}
              onChange={(_, val: 'signin' | 'register') => {
                setTab(val);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              sx={{
                mb: 3,
                borderBottom: `1px solid ${themePalette.divider}`,
              }}
            >
              <Tab label="Agency Sign In" value="signin" />
              <Tab label="Create Agency" value="register" />
            </Tabs>

            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {errorMsg}
              </Alert>
            )}

            {tab === 'signin' ? (
              <Box component="form" onSubmit={handleRequestLink}>
                <Typography variant="h3" sx={{ mb: 0.75 }}>
                  Sign in with a magic link
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                  Enter your agency email to receive a single-use 15-minute verification link.
                </Typography>

                <TextField
                  label="Work Email"
                  type="email"
                  required
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@agency.com"
                  sx={{ mb: 2 }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  disabled={requesting}
                  endIcon={<KeyRound size={16} />}
                >
                  {requesting ? 'Generating Magic Link...' : 'Send Magic Link'}
                </Button>

                {infoMsg && (
                  <Box
                    sx={{
                      mt: 2.5,
                      p: 2,
                      borderRadius: '8px',
                      bgcolor: themePalette.accent.soft,
                      border: `1px solid ${themePalette.accent.border}`,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ color: themePalette.text.primary, mb: 0.5 }}>
                      Single-Use Verification Ready
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem', mb: previewUrl ? 1.5 : 0 }}>
                      {infoMsg}
                    </Typography>
                    {previewUrl && (
                      <Stack spacing={1.25}>
                        <Typography
                          sx={{
                            fontFamily: FONT_MONO,
                            fontSize: '0.72rem',
                            wordBreak: 'break-all',
                            bgcolor: themePalette.background.paper,
                            p: 1,
                            borderRadius: '6px',
                            border: `1px solid ${themePalette.divider}`,
                          }}
                        >
                          {previewUrl}
                        </Typography>
                        <Button
                          variant="contained"
                          color="secondary"
                          fullWidth
                          disabled={verifying}
                          onClick={handleVerifyPreviewLink}
                          endIcon={<ArrowRight size={16} />}
                        >
                          {verifying ? 'Verifying Token...' : 'Verify & Sign In Now'}
                        </Button>
                      </Stack>
                    )}
                  </Box>
                )}

                <Divider sx={{ my: 3 }} />
                <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                  Seeded demo accounts in database:
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setEmail('alex@studioamber.co')}
                  >
                    Admin: alex@studioamber.co
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setEmail('maya@studioamber.co')}
                  >
                    Member: maya@studioamber.co
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleRegister}>
                <Typography variant="h3" sx={{ mb: 0.75 }}>
                  Create your {QAVONFLOW_BRANDING.name} workspace
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                  Set up a new tenant-isolated onboarding workspace for your agency and clients.
                </Typography>

                <Stack spacing={2}>
                  <TextField
                    label="Agency Name"
                    required
                    fullWidth
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Acme Digital Studio"
                  />
                  <TextField
                    label="Your Full Name"
                    required
                    fullWidth
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Jordan Taylor"
                  />
                  <TextField
                    label="Work Email"
                    type="email"
                    required
                    fullWidth
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jordan@acmedigital.co"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    disabled={registering}
                    endIcon={<ArrowRight size={16} />}
                  >
                    {registering ? 'Creating Workspace...' : 'Create Agency Workspace'}
                  </Button>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
