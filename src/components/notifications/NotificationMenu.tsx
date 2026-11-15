import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  Stack,
  Typography,
} from '@mui/material';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '../../store/api/hubApi';
import { useAppDispatch } from '../../store/hooks';
import { openClientWorkspace } from '../../store/slices/uiSlice';
import { themePalette } from '../../theme';
import { formatRelativeTime } from '../../utils/format';

export function NotificationMenu() {
  const dispatch = useAppDispatch();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { data } = useGetNotificationsQuery(undefined, {
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <>
      <IconButton
        aria-label="Notifications"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          border: `1px solid ${themePalette.divider}`,
          borderRadius: '8px',
          width: 38,
          height: 38,
          bgcolor: themePalette.background.paper,
        }}
      >
        <Badge
          badgeContent={unreadCount}
          color="secondary"
          sx={{
            '& .MuiBadge-badge': {
              bgcolor: themePalette.accent.main,
              color: themePalette.accent.contrastText,
              fontWeight: 700,
              fontSize: '0.6875rem',
            },
          }}
        >
          <Bell size={17} color={themePalette.text.primary} />
        </Badge>
      </IconButton>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 360,
              maxWidth: '92vw',
              mt: 1,
              border: `1px solid ${themePalette.divider}`,
              borderRadius: '10px',
            },
          },
        }}
      >
        <Stack
          direction="row"
          sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={<CheckCheck size={14} />}
              onClick={() => {
                void markAllRead().unwrap().catch(() => {});
              }}
              sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
            >
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider />
        <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2">No notifications yet.</Typography>
            </Box>
          ) : (
            notifications.map((item) => (
              <Box
                key={item.id}
                onClick={() => {
                  if (!item.isRead) {
                    void markRead({ id: item.id }).unwrap().catch(() => {});
                  }
                  if (item.clientId) {
                    dispatch(openClientWorkspace(item.clientId));
                    setAnchorEl(null);
                  }
                }}
                sx={{
                  px: 2,
                  py: 1.5,
                  cursor: item.clientId ? 'pointer' : 'default',
                  bgcolor: item.isRead ? 'transparent' : themePalette.accent.soft,
                  borderBottom: `1px solid ${themePalette.divider}`,
                  '&:hover': {
                    bgcolor: themePalette.background.subtle,
                  },
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Typography variant="subtitle2" sx={{ color: themePalette.text.primary }}>
                    {item.title}
                  </Typography>
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                    {formatRelativeTime(item.createdAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', mt: 0.25 }}>
                  {item.message}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
