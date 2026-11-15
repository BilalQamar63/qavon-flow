import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { themePalette } from '../../theme';
import type { SessionUser } from '../../types';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AgencyShellProps {
  user: SessionUser;
  children: ReactNode;
}

export function AgencyShell({ user, children }: AgencyShellProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: themePalette.background.default,
      }}
    >
      <Sidebar agencyName={user.agencyName} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar user={user} />
        <Box component="main" sx={{ flex: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
