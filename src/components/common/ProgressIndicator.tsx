import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { themePalette } from '../../theme';

interface ProgressIndicatorProps {
  percentage: number;
  label?: string;
  showPercent?: boolean;
  height?: number;
}

export function ProgressIndicator({
  percentage,
  label,
  showPercent = true,
  height = 6,
}: ProgressIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const barColor =
    clamped === 100
      ? themePalette.status.success
      : clamped >= 50
        ? themePalette.accent.main
        : themePalette.primary.main;

  return (
    <Box sx={{ width: '100%' }}>
      {(label || showPercent) && (
        <Stack direction="row" sx={{ mb: 0.75, justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: themePalette.text.secondary, fontWeight: 500 }}>
            {label || ''}
          </Typography>
          {showPercent && (
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: themePalette.text.primary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {clamped}%
            </Typography>
          )}
        </Stack>
      )}
      <LinearProgress
        variant="determinate"
        value={clamped}
        sx={{
          height,
          borderRadius: 4,
          backgroundColor: themePalette.background.subtle,
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            backgroundColor: barColor,
          },
        }}
      />
    </Box>
  );
}
