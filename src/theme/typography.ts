import type { ThemeOptions } from '@mui/material/styles';
import { themePalette } from './palette';

export const FONT_DISPLAY = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
export const FONT_BODY = '"DM Sans", system-ui, -apple-system, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

export const themeTypography: ThemeOptions['typography'] = {
  fontFamily: FONT_BODY,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  h1: {
    fontFamily: FONT_DISPLAY,
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
    color: themePalette.text.primary,
  },
  h2: {
    fontFamily: FONT_DISPLAY,
    fontSize: '1.375rem',
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.015em',
    color: themePalette.text.primary,
  },
  h3: {
    fontFamily: FONT_DISPLAY,
    fontSize: '1.125rem',
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
    color: themePalette.text.primary,
  },
  h4: {
    fontFamily: FONT_DISPLAY,
    fontSize: '1rem',
    fontWeight: 600,
    lineHeight: 1.4,
    color: themePalette.text.primary,
  },
  h5: {
    fontFamily: FONT_DISPLAY,
    fontSize: '0.9375rem',
    fontWeight: 600,
    lineHeight: 1.4,
    color: themePalette.text.primary,
  },
  h6: {
    fontFamily: FONT_DISPLAY,
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.4,
    color: themePalette.text.primary,
  },
  subtitle1: {
    fontFamily: FONT_BODY,
    fontSize: '0.9375rem',
    fontWeight: 500,
    lineHeight: 1.5,
    color: themePalette.text.primary,
  },
  subtitle2: {
    fontFamily: FONT_BODY,
    fontSize: '0.8125rem',
    fontWeight: 600,
    lineHeight: 1.45,
    color: themePalette.text.secondary,
  },
  body1: {
    fontFamily: FONT_BODY,
    fontSize: '0.9375rem',
    fontWeight: 400,
    lineHeight: 1.6,
    color: themePalette.text.primary,
  },
  body2: {
    fontFamily: FONT_BODY,
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.55,
    color: themePalette.text.secondary,
  },
  caption: {
    fontFamily: FONT_BODY,
    fontSize: '0.75rem',
    fontWeight: 400,
    lineHeight: 1.4,
    color: themePalette.text.muted,
  },
  overline: {
    fontFamily: FONT_DISPLAY,
    fontSize: '0.75rem',
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '0.04em',
    textTransform: 'none',
    color: themePalette.text.secondary,
  },
  button: {
    fontFamily: FONT_DISPLAY,
    fontSize: '0.875rem',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: '-0.005em',
  },
};
