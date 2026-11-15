import {
  Avatar,
  Box,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ChevronRight, LogOut, Menu as MenuIcon, Search, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { useGetClientsQuery, useLogoutMutation } from '../../store/api/hubApi';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setActivePage,
  setGlobalSearch,
  setMobileNavOpen,
  type AgencyNavPage,
} from '../../store/slices/uiSlice';
import { FONT_DISPLAY, themePalette, themeSpacing } from '../../theme';
import type { SessionUser } from '../../types';
import { NotificationMenu } from '../notifications/NotificationMenu';

interface TopbarProps {
  user: SessionUser;
}

const PAGE_TITLES: Record<AgencyNavPage, string> = {
  overview: 'Overview',
  clients: 'Clients',
  onboarding: 'Onboarding Workspaces',
  assets: 'Asset Library',
  team: 'Team Management',
  activity: 'Activity & Audit Log',
  settings: 'Workspace Settings',
};

export function Topbar({ user }: TopbarProps) {
  const dispatch = useAppDispatch();
  const activePage = useAppSelector((s) => s.ui.activePage);
  const selectedClientId = useAppSelector((s) => s.ui.selectedClientId);
  const globalSearch = useAppSelector((s) => s.ui.globalSearch);
  const { data: clientsData } = useGetClientsQuery(
    { status: 'all' },
    { skip: activePage !== 'onboarding' },
  );
  const [logout] = useLogoutMutation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const selectedClient =
    activePage === 'onboarding'
      ? clientsData?.clients.find((c) => c.id === selectedClientId) || clientsData?.clients[0]
      : null;

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <Box
      component="header"
      sx={{
        height: themeSpacing.topbarHeight,
        bgcolor: themePalette.background.paper,
        borderBottom: `1px solid ${themePalette.divider}`,
        px: { xs: 2, md: 4 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}>
        <IconButton
          aria-label="Open navigation"
          onClick={() => dispatch(setMobileNavOpen(true))}
          sx={{ display: { xs: 'inline-flex', md: 'none' } }}
        >
          <MenuIcon size={20} />
        </IconButton>

        {activePage === 'onboarding' && selectedClient ? (
          <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: 'center' }}>
            <Typography
              component="button"
              type="button"
              onClick={() => dispatch(setActivePage('clients'))}
              sx={{
                border: 'none',
                background: 'transparent',
                p: 0,
                cursor: 'pointer',
                fontFamily: FONT_DISPLAY,
                fontWeight: 500,
                fontSize: '0.875rem',
                color: themePalette.text.secondary,
                whiteSpace: 'nowrap',
                display: { xs: 'none', sm: 'inline' },
                '&:hover': { color: themePalette.text.primary },
              }}
            >
              Clients
            </Typography>
            <Box
              component="span"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                color: themePalette.text.muted,
                alignItems: 'center',
              }}
            >
              <ChevronRight size={14} />
            </Box>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: '0.9375rem',
                color: themePalette.text.primary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {selectedClient.companyName}
            </Typography>
          </Stack>
        ) : (
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: '0.9375rem',
              color: themePalette.text.primary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {PAGE_TITLES[activePage]}
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, width: { sm: 210, md: 250 } }}>
          <TextField
            value={globalSearch}
            onChange={(e) => {
              dispatch(setGlobalSearch(e.target.value));
              if (e.target.value.trim() && activePage !== 'clients') {
                dispatch(setActivePage('clients'));
              }
            }}
            placeholder="Search clients..."
            size="small"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={15} color={themePalette.text.muted} />
                  </InputAdornment>
                ),
                endAdornment: globalSearch ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="Clear client search"
                      size="small"
                      edge="end"
                      onClick={() => dispatch(setGlobalSearch(''))}
                      sx={{ color: themePalette.text.muted }}
                    >
                      <X size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        </Box>

        <NotificationMenu />

        <Box
          component="button"
          type="button"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            border: `1px solid ${themePalette.divider}`,
            borderRadius: '8px',
            bgcolor: themePalette.background.paper,
            px: 1.25,
            py: 0.625,
            cursor: 'pointer',
            transition: 'background-color 150ms ease, border-color 150ms ease',
            '&:hover': {
              bgcolor: themePalette.background.subtle,
              borderColor: themePalette.text.muted,
            },
          }}
        >
          <Avatar
            sx={{
              width: 26,
              height: 26,
              bgcolor: themePalette.primary.main,
              color: themePalette.accent.main,
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '6px',
            }}
          >
            {initials}
          </Avatar>
          <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left' }}>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                lineHeight: 1.2,
                color: themePalette.text.primary,
                whiteSpace: 'nowrap',
              }}
            >
              {user.name}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.7rem',
                lineHeight: 1.2,
                color: themePalette.text.muted,
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
              }}
            >
              {user.role}
            </Typography>
          </Box>
        </Box>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
              {user.name}
            </Typography>
            <Typography variant="caption">{user.email}</Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              dispatch(setActivePage('settings'));
            }}
          >
            <Settings size={15} style={{ marginRight: 8 }} />
            Account & Settings
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              void logout();
            }}
          >
            <LogOut size={15} style={{ marginRight: 8 }} />
            Sign Out
          </MenuItem>
        </Menu>
      </Stack>
    </Box>
  );
}
