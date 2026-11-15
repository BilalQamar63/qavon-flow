import { Box, Stack, Typography } from '@mui/material';
import { QAVONFLOW_BRANDING } from '../../constants/branding';
import { FONT_DISPLAY, themePalette } from '../../theme';

interface BrandLogoProps {
  surface?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showByline?: boolean;
  iconOnly?: boolean;
}

const SIZE_MAP = {
  sm: { icon: 28, title: '0.96rem', byline: '0.625rem', gap: 1.25 },
  md: { icon: 32, title: '1.0625rem', byline: '0.65rem', gap: 1.375 },
  lg: { icon: 38, title: '1.225rem', byline: '0.6875rem', gap: 1.5 },
} as const;

export function BrandLogo({
  surface = 'light',
  size = 'md',
  showByline = false,
  iconOnly = false,
}: BrandLogoProps) {
  const dims = SIZE_MAP[size];
  const isDark = surface === 'dark';
  const titleColor = isDark ? themePalette.text.onDark : themePalette.text.primary;
  const subColor = isDark ? themePalette.text.onDarkMuted : themePalette.text.secondary;

  return (
    <Stack
      direction="row"
      spacing={dims.gap}
      sx={{ alignItems: 'center', minWidth: 0, flexShrink: 0 }}
    >
      <Box
        component="svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        sx={{
          width: dims.icon,
          height: dims.icon,
          flexShrink: 0,
          display: 'block',
        }}
      >
        <rect
          width="40"
          height="40"
          rx="9"
          fill={isDark ? '#25272C' : themePalette.primary.main}
          stroke={isDark ? 'rgba(255,255,255,0.14)' : 'none'}
          strokeWidth="1"
        />
        <circle cx="18.5" cy="19.5" r="9" stroke="#FAF7F0" strokeWidth="2.75" />
        <path
          d="M21.5 22.5L29.5 30.5M29.5 30.5H24.25M29.5 30.5V25.25"
          stroke={themePalette.accent.main}
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="19.5" r="2.5" fill={themePalette.accent.main} />
      </Box>

      {!iconOnly && (
        <Box sx={{ minWidth: 0, lineHeight: 1 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: dims.title,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: titleColor,
              whiteSpace: 'nowrap',
            }}
          >
            {QAVONFLOW_BRANDING.name}
          </Typography>
          {showByline && (
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: dims.byline,
                letterSpacing: '0.09em',
                lineHeight: 1.25,
                color: subColor,
                whiteSpace: 'nowrap',
                mt: 0.125,
              }}
            >
              {QAVONFLOW_BRANDING.byline}
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  );
}
