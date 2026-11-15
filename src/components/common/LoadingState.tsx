import { Box, Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';

interface LoadingStateProps {
  rows?: number;
  variant?: 'table' | 'dashboard' | 'workspace';
}

export function LoadingState({ rows = 4, variant = 'table' }: LoadingStateProps) {
  if (variant === 'dashboard') {
    return (
      <Stack spacing={3}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Skeleton variant="text" width="28%" height={20} />
            <Skeleton variant="text" width="42%" height={36} sx={{ my: 0.5 }} />
            <Skeleton variant="text" width="58%" height={18} />
          </CardContent>
        </Card>
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid key={i} size={{ xs: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ p: 2.25 }}>
                  <Skeleton variant="text" width="60%" height={18} />
                  <Skeleton variant="text" width="40%" height={36} sx={{ my: 0.5 }} />
                  <Skeleton variant="text" width="75%" height={14} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Skeleton variant="text" width="40%" height={26} sx={{ mb: 2 }} />
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={24} sx={{ mb: 1.5 }} />
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Skeleton variant="text" width="45%" height={26} sx={{ mb: 2 }} />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} variant="text" height={34} sx={{ mb: 0.5 }} />
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    );
  }

  if (variant === 'workspace') {
    return (
      <Stack spacing={3}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Skeleton variant="text" width="40%" height={28} />
            <Skeleton variant="rounded" height={10} sx={{ my: 2 }} />
            <Skeleton variant="text" width="60%" height={18} />
          </CardContent>
        </Card>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent sx={{ p: 2 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={42} sx={{ mb: 1 }} />
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Skeleton variant="text" width="35%" height={30} sx={{ mb: 2 }} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={44} sx={{ mb: 2 }} />
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width="32%" height={28} />
          {Array.from({ length: rows }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Skeleton variant="rounded" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={20} />
                <Skeleton variant="text" width="40%" height={16} />
              </Box>
              <Skeleton variant="rounded" width={80} height={24} />
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
