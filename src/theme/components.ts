import type { Components, Theme } from '@mui/material/styles';
import { themePalette } from './palette';
import { themeSpacing } from './spacing';

export const themeComponents: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        backgroundColor: themePalette.background.default,
        color: themePalette.text.primary,
        overflowX: 'hidden',
      },
    },
  },
  MuiButton: {
    defaultProps: {
      disableElevation: true,
    },
    variants: [
      {
        props: { variant: 'contained', color: 'primary' },
        style: {
          backgroundColor: themePalette.accent.main,
          color: themePalette.accent.contrastText,
          '&:hover': {
            backgroundColor: themePalette.accent.hover,
          },
        },
      },
      {
        props: { variant: 'contained', color: 'secondary' },
        style: {
          backgroundColor: themePalette.primary.main,
          color: themePalette.primary.contrastText,
          '&:hover': {
            backgroundColor: themePalette.primary.light,
          },
        },
      },
    ],
    styleOverrides: {
      root: {
        borderRadius: themeSpacing.radius.md,
        padding: '7px 16px',
        minHeight: 38,
        whiteSpace: 'nowrap',
        transition:
          'background-color 150ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms ease, transform 120ms ease',
        '&:active': {
          transform: 'translateY(0.5px)',
        },
      },
      sizeSmall: {
        minHeight: 32,
        padding: '5px 12px',
        fontSize: '0.8125rem',
      },
      sizeLarge: {
        minHeight: 44,
        padding: '10px 20px',
      },
      outlined: {
        borderColor: themePalette.divider,
        color: themePalette.text.primary,
        backgroundColor: themePalette.background.paper,
        '&:hover': {
          borderColor: themePalette.text.secondary,
          backgroundColor: themePalette.background.subtle,
        },
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        borderRadius: themeSpacing.radius.md,
        transition: 'background-color 150ms ease, color 150ms ease',
      },
    },
  },
  MuiCard: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        backgroundColor: themePalette.background.paper,
        border: `1px solid ${themePalette.divider}`,
        borderRadius: themeSpacing.radius.lg,
      },
    },
  },
  MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      outlined: {
        borderColor: themePalette.divider,
        borderRadius: themeSpacing.radius.lg,
      },
    },
  },
  MuiTextField: {
    defaultProps: {
      size: 'small',
      variant: 'outlined',
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: themeSpacing.radius.md,
        backgroundColor: themePalette.background.paper,
        fontSize: '0.875rem',
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: themePalette.divider,
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: themePalette.text.secondary,
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: themePalette.primary.main,
          borderWidth: 1.5,
        },
      },
      sizeSmall: {
        '& .MuiOutlinedInput-input': {
          paddingTop: 8.5,
          paddingBottom: 8.5,
        },
      },
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: {
        fontSize: '0.875rem',
        color: themePalette.text.secondary,
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      root: {
        minHeight: 40,
      },
      indicator: {
        backgroundColor: themePalette.accent.main,
        height: 2.5,
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        minHeight: 40,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 14,
        paddingRight: 14,
        fontSize: '0.8125rem',
        fontWeight: 600,
        textTransform: 'none',
        color: themePalette.text.secondary,
        '&.Mui-selected': {
          color: themePalette.text.primary,
        },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      head: {
        fontWeight: 600,
        fontSize: '0.75rem',
        color: themePalette.text.secondary,
        backgroundColor: themePalette.background.subtle,
        borderBottom: `1px solid ${themePalette.divider}`,
        paddingTop: 10,
        paddingBottom: 10,
        whiteSpace: 'nowrap',
      },
      body: {
        fontSize: '0.875rem',
        borderBottom: `1px solid ${themePalette.divider}`,
        paddingTop: 11,
        paddingBottom: 11,
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'background-color 120ms ease',
        '&.MuiTableRow-hover:hover': {
          backgroundColor: themePalette.background.default,
        },
        '&:last-child td': {
          borderBottom: 0,
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: themeSpacing.radius.lg,
        border: `1px solid ${themePalette.divider}`,
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: {
        fontSize: '1.125rem',
        fontWeight: 700,
        padding: '18px 24px',
      },
    },
  },
  MuiDialogContent: {
    styleOverrides: {
      root: {
        padding: '20px 24px',
      },
    },
  },
  MuiDialogActions: {
    styleOverrides: {
      root: {
        padding: '14px 24px',
      },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: themeSpacing.radius.md,
        fontSize: '0.84375rem',
      },
    },
  },
  MuiMenu: {
    styleOverrides: {
      paper: {
        borderRadius: themeSpacing.radius.md,
        border: `1px solid ${themePalette.divider}`,
        marginTop: 6,
      },
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: '0.875rem',
        minHeight: 36,
      },
    },
  },
};
