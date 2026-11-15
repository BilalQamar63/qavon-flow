import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Lock, LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { QAVONFLOW_BRANDING } from '../../constants/branding';
import { useGetOnboardingWorkspaceQuery, useLogoutMutation } from '../../store/api/hubApi';
import { themePalette, themeSpacing } from '../../theme';
import type { SessionUser } from '../../types';
import { BrandLogo } from '../common/BrandLogo';

interface ClientPortalShellProps {
  user: SessionUser;
  children: ReactNode;
}

export function ClientPortalShell({ user, children }: ClientPortalShellProps) {
  const [logout] = useLogoutMutation();
  const { data: workspace } = useGetOnboardingWorkspaceQuery(user.clientId || '', {
    skip: !user.clientId,
  });
  const companyName = workspace?.client?.companyName;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: themePalette.background.default,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        component="header"
        sx={{
          height: themeSpacing.topbarHeight,
          bgcolor: themePalette.background.darkSurface,
          color: themePalette.text.onDark,
          px: { xs: 2, md: 4 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderBottom: `2px solid ${themePalette.accent.main}`,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: 'center' }}>
          <BrandLogo surface="dark" size="sm" />
          <Typography
            sx={{
              display: { xs: 'none', sm: 'block' },
              fontSize: '0.8125rem',
              color: themePalette.text.onDarkMuted,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            / {user.agencyName}
            {companyName ? ` · ${companyName}` : ''}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ flexShrink: 0, alignItems: 'center' }}>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              display: { xs: 'none', sm: 'flex' },
              color: themePalette.text.onDarkMuted,
              alignItems: 'center',
            }}
          >
            <ShieldCheck size={15} color={themePalette.accent.main} />
            <Typography sx={{ fontSize: '0.75rem', color: themePalette.text.onDarkMuted }}>
              Private Client Onboarding Portal
            </Typography>
          </Stack>

          <Button
            size="small"
            variant="outlined"
            startIcon={<LogOut size={14} />}
            onClick={() => logout()}
            sx={{
              color: themePalette.text.onDark,
              borderColor: 'rgba(255,255,255,0.22)',
              bgcolor: 'transparent',
              '&:hover': {
                borderColor: themePalette.accent.main,
                bgcolor: 'rgba(255,255,255,0.08)',
              },
            }}
          >
            Sign Out
          </Button>
        </Stack>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 }, flex: 1 }}>
        {children}
      </Container>

      <Box
        component="footer"
        sx={{
          borderTop: `1px solid ${themePalette.divider}`,
          bgcolor: themePalette.background.paper,
          py: 2,
          px: { xs: 2, md: 4 },
        }}
      >
        <Container maxWidth="lg" disableGutters>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Lock size={13} color={themePalette.text.muted} />
              <Typography variant="caption">
                Private {QAVONFLOW_BRANDING.name} workspace prepared by {user.agencyName}
                {companyName ? ` for ${companyName}` : ''}. Files &amp; credentials are strictly isolated to this workspace.
              </Typography>
            </Stack>
            <Typography variant="caption">
              {QAVONFLOW_BRANDING.signature} · Signed in as {user.email}
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
