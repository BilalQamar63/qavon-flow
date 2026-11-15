import { Box, Typography } from '@mui/material';
import { FONT_MONO, themePalette } from '../../theme';

interface FileTypeBadgeProps {
  filename: string;
  mimeType: string;
  size?: number;
}

export function FileTypeBadge({ filename, mimeType, size = 34 }: FileTypeBadgeProps) {
  const extFromName = filename.split('.').pop()?.toUpperCase() || '';
  const ext =
    extFromName.length > 0 && extFromName.length <= 4
      ? extFromName
      : mimeType.includes('pdf')
        ? 'PDF'
        : mimeType.startsWith('image/')
          ? 'IMG'
          : mimeType.startsWith('video/')
            ? 'MP4'
            : 'FILE';

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  const bg = isPdf
    ? themePalette.status.errorSoft
    : isImage
      ? themePalette.accent.soft
      : themePalette.background.subtle;

  const fg = isPdf
    ? themePalette.status.error
    : isImage
      ? themePalette.accent.hover
      : themePalette.text.secondary;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '6px',
        bgcolor: bg,
        border: `1px solid ${themePalette.divider}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.625rem',
          fontWeight: 700,
          color: fg,
          letterSpacing: '0.02em',
        }}
      >
        {ext}
      </Typography>
    </Box>
  );
}
