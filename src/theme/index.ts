import { createTheme } from '@mui/material/styles';
import { themeComponents } from './components';
import { themePalette } from './palette';
import { themeShadows } from './shadows';
import { themeSpacing } from './spacing';
import { themeTypography } from './typography';

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: themePalette.primary.main,
      light: themePalette.primary.light,
      dark: themePalette.primary.dark,
      contrastText: themePalette.primary.contrastText,
    },
    secondary: {
      main: themePalette.accent.main,
      contrastText: themePalette.accent.contrastText,
    },
    background: {
      default: themePalette.background.default,
      paper: themePalette.background.paper,
    },
    text: {
      primary: themePalette.text.primary,
      secondary: themePalette.text.secondary,
    },
    divider: themePalette.divider,
    success: {
      main: themePalette.status.success,
    },
    warning: {
      main: themePalette.status.warning,
    },
    error: {
      main: themePalette.status.error,
    },
  },
  typography: themeTypography,
  spacing: themeSpacing.unit,
  shape: {
    borderRadius: themeSpacing.radius.md,
  },
  shadows: themeShadows,
  components: themeComponents,
});

export { themePalette, themeSpacing };
export { FONT_BODY, FONT_DISPLAY, FONT_MONO } from './typography';
