export const themePalette = {
  // Brand & Primary Accent (from reference palette: Charcoal + Amber Gold on Warm Ivory)
  primary: {
    main: '#191A1D',
    light: '#2D3036',
    dark: '#0E0F11',
    contrastText: '#FFFFFF',
  },
  accent: {
    main: '#EDA320',
    hover: '#D48E12',
    soft: '#FEF6E6',
    border: '#F5D89B',
    contrastText: '#191A1D',
  },
  // Neutral Canvas & Structural Surfaces (60-30-10 discipline)
  background: {
    default: '#F8F5EE', // 60% Warm Ivory Canvas
    paper: '#FFFFFF', // 30% Crisp White Surface
    subtle: '#F2EDE3',
    darkSurface: '#191A1D',
  },
  text: {
    primary: '#191A1D',
    secondary: '#5C5F66',
    muted: '#82858E',
    onDark: '#FAF7F0',
    onDarkMuted: '#B0B3BC',
  },
  divider: '#E5E0D5',
  // Semantic Status Tokens (strictly data state)
  status: {
    success: '#16A34A',
    successSoft: '#F0FDF4',
    warning: '#D97706',
    warningSoft: '#FFFBEB',
    error: '#DC2626',
    errorSoft: '#FEF2F2',
    info: '#2563EB',
    infoSoft: '#EFF6FF',
    neutral: '#5C5F66',
    neutralSoft: '#F2EDE3',
  },
} as const;
