import { Avatar } from '@mui/material';
import { FONT_DISPLAY, themePalette } from '../../theme';

interface ClientAvatarProps {
  name: string;
  size?: number;
}

export function ClientAvatar({ name, size = 36 }: ClientAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        borderRadius: '8px',
        bgcolor: themePalette.primary.main,
        color: themePalette.accent.main,
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.36)),
        flexShrink: 0,
      }}
    >
      {initials || 'CL'}
    </Avatar>
  );
}
