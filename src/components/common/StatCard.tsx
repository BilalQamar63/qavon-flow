import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { FONT_DISPLAY, themePalette } from '../../theme';

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  detail,
  tone = 'neutral',
  icon,
  onClick,
}: StatCardProps) {
  const valueColor =
    tone === 'success'
      ? themePalette.status.success
      : tone === 'warning'
        ? themePalette.status.warning
        : tone === 'danger'
          ? themePalette.status.error
          : tone === 'accent'
            ? themePalette.accent.hover
            : themePalette.text.primary;

  return (
    <Card
      onClick={onClick}
      sx={{
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 150ms ease, background-color 150ms ease',
        ...(onClick && {
          '&:hover': {
            borderColor: themePalette.text.secondary,
            bgcolor: '#FFFEFA',
          },
        }),
      }}
    >
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ color: themePalette.text.secondary, lineHeight: 1.3 }}>
            {label}
          </Typography>
          {icon && (
            <Box sx={{ color: valueColor, opacity: 0.85, flexShrink: 0, mt: 0.125 }}>
              {icon}
            </Box>
          )}
        </Stack>
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontSize: '1.75rem',
            fontWeight: 700,
            lineHeight: 1.15,
            fontVariantNumeric: 'tabular-nums',
            color: valueColor,
          }}
        >
          {value}
        </Typography>
        {detail && (
          <Box sx={{ mt: 0.75 }}>
            <Typography variant="caption" sx={{ color: themePalette.text.muted }}>
              {detail}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
