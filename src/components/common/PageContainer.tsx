import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { themeSpacing } from '../../theme';

interface PageContainerProps {
  children: ReactNode;
  maxWidth?: number | string;
}

export function PageContainer({ children, maxWidth = 1280 }: PageContainerProps) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth,
        mx: 'auto',
        px: themeSpacing.pagePaddingX,
        py: themeSpacing.pagePaddingY,
      }}
    >
      {children}
    </Box>
  );
}
