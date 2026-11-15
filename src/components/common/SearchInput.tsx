import { IconButton, InputAdornment, TextField } from '@mui/material';
import { Search, X } from 'lucide-react';
import { themePalette } from '../../theme';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  fullWidth = false,
}: SearchInputProps) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      fullWidth={fullWidth}
      size="small"
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} color={themePalette.text.muted} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                aria-label="Clear search"
                size="small"
                edge="end"
                onClick={() => onChange('')}
                sx={{ color: themePalette.text.muted }}
              >
                <X size={14} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
      sx={{ minWidth: fullWidth ? undefined : { xs: '100%', sm: 260 } }}
    />
  );
}
