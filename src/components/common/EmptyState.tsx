import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { themePalette } from '../../theme';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  embedded?: boolean;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  embedded = false,
}: EmptyStateProps) {
  const inner = (
    <Box
      sx={{
        py: embedded ? 4 : 6,
        px: embedded ? 2 : 3,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '8px',
            bgcolor: themePalette.background.subtle,
            color: themePalette.text.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1.75,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h4" sx={{ mb: 0.75 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 420, mb: actionLabel ? 2.25 : 0 }}>
        {description}
      </Typography>
      {actionLabel && onAction && (
        <Button variant="contained" color="primary" size="small" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );

  if (embedded) return inner;

  return (
    <Card>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>{inner}</CardContent>
    </Card>
  );
}
