import { Alert, Box, Button, CircularProgress, Snackbar, Typography } from '@mui/material';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './components/common/BrandLogo';
import { AgencyShell } from './components/layout/AgencyShell';
import { ClientPortalShell } from './components/layout/ClientPortalShell';
import { QAVONFLOW_BRANDING } from './constants/branding';
import {
  useAcceptInvitationTokenMutation,
  useGetSessionQuery,
  useVerifyMagicTokenMutation,
} from './store/api/hubApi';
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
  clearToast,
  setActiveOnboardingSectionKey,
  setActivePage,
  setSelectedClientId,
} from './store/slices/uiSlice';
import { themePalette } from './theme';
import { getApiErrorMessage } from './utils/apiError';
import { buildAppPath, parseAppRoute } from './utils/appRoutes';

const AuthView = lazy(() => import('./features/auth/AuthView').then((m) => ({ default: m.AuthView })));
const OverviewPage = lazy(() =>
  import('./features/dashboard/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const ClientsPage = lazy(() =>
  import('./features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const OnboardingWorkspaceView = lazy(() =>
  import('./features/onboarding/OnboardingWorkspaceView').then((m) => ({
    default: m.OnboardingWorkspaceView,
  })),
);
const AssetsPage = lazy(() =>
  import('./features/assets/AssetsPage').then((m) => ({ default: m.AssetsPage })),
);
const TeamPage = lazy(() => import('./features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const ActivityPage = lazy(() =>
  import('./features/activity/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function RouteLoadingFallback() {
  return (
    <Box
      sx={{
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress size={28} sx={{ color: themePalette.accent.main }} />
    </Box>
  );
}

export default function App() {
  const dispatch = useAppDispatch();
  const activePage = useAppSelector((s) => s.ui.activePage);
  const selectedClientId = useAppSelector((s) => s.ui.selectedClientId);
  const activeOnboardingSectionKey = useAppSelector(
    (s) => s.ui.activeOnboardingSectionKey,
  );
  const toast = useAppSelector((s) => s.ui.toast);

  const { data: sessionData, isLoading: sessionLoading } = useGetSessionQuery();
  const [verifyMagicToken] = useVerifyMagicTokenMutation();
  const [acceptInvitationToken] = useAcceptInvitationTokenMutation();

  const [tokenProcessing, setTokenProcessing] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [routeInitialized, setRouteInitialized] = useState(false);
  const replacePathOnSyncRef = useRef(true);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      replacePathOnSyncRef.current = true;
      const route = parseAppRoute(window.location.pathname);
      dispatch(setActivePage(route.page));
      if (route.clientId) {
        dispatch(setSelectedClientId(route.clientId));
      }
      if (route.onboardingSectionKey) {
        dispatch(setActiveOnboardingSectionKey(route.onboardingSectionKey));
      }
    };

    syncRouteFromLocation();
    window.addEventListener('popstate', syncRouteFromLocation);
    setRouteInitialized(true);

    return () => window.removeEventListener('popstate', syncRouteFromLocation);
  }, [dispatch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('magicToken');
    const portalToken = params.get('portalToken');

    if (!magicToken && !portalToken) return;

    // Strip sensitive token from address bar immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    setTokenProcessing(true);
    setTokenError(null);

    const run = async () => {
      try {
        if (magicToken) {
          await verifyMagicToken({ token: magicToken }).unwrap();
        } else if (portalToken) {
          await acceptInvitationToken({ token: portalToken }).unwrap();
        }
      } catch (err: unknown) {
        setTokenError(getApiErrorMessage(err, 'Sign-in link is invalid or has expired.'));
      } finally {
        setTokenProcessing(false);
      }
    };

    void run();
  }, [verifyMagicToken, acceptInvitationToken]);

  const user = sessionData?.user || null;
  const userRole = user?.role;

  useEffect(() => {
    if (!routeInitialized || sessionLoading || !userRole) return;

    const nextPath = buildAppPath({
      page: activePage,
      clientId: selectedClientId,
      onboardingSectionKey: activeOnboardingSectionKey,
      isClientPortal: userRole === 'client',
    });
    if (window.location.pathname !== nextPath) {
      if (replacePathOnSyncRef.current) {
        window.history.replaceState({}, document.title, nextPath);
      } else {
        window.history.pushState({}, document.title, nextPath);
      }
    }
    replacePathOnSyncRef.current = false;
  }, [
    activeOnboardingSectionKey,
    activePage,
    routeInitialized,
    selectedClientId,
    sessionLoading,
    userRole,
  ]);

  if (sessionLoading || tokenProcessing) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: themePalette.background.default,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <BrandLogo size="md" />
        <CircularProgress size={26} sx={{ color: themePalette.accent.main }} />
        <Typography variant="body2">
          {tokenProcessing
            ? `Verifying your ${QAVONFLOW_BRANDING.name} sign-in link...`
            : `Loading ${QAVONFLOW_BRANDING.name} workspace...`}
        </Typography>
      </Box>
    );
  }

  if (tokenError && !user) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: themePalette.background.default,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Alert
          severity="error"
          sx={{ maxWidth: 480, mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setTokenError(null)}>
              Continue
            </Button>
          }
        >
          {tokenError}
        </Alert>
      </Box>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <AuthView />
      </Suspense>
    );
  }

  // Dedicated External Client Portal (zero agency navigation or cross-client visibility)
  if (user.role === 'client') {
    return (
      <>
        <ClientPortalShell user={user}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <OnboardingWorkspaceView fixedClientId={user.clientId} viewerRole="client" />
          </Suspense>
        </ClientPortalShell>
        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={4000}
          onClose={() => dispatch(clearToast())}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {toast ? (
            <Alert
              severity={toast.severity}
              variant="filled"
              onClose={() => dispatch(clearToast())}
            >
              {toast.text}
            </Alert>
          ) : undefined}
        </Snackbar>
      </>
    );
  }

  return (
    <>
      <AgencyShell user={user}>
        <Suspense fallback={<RouteLoadingFallback />}>
          {activePage === 'overview' && <OverviewPage />}
          {activePage === 'clients' && <ClientsPage />}
          {activePage === 'onboarding' && <OnboardingWorkspaceView viewerRole={user.role} />}
          {activePage === 'assets' && <AssetsPage />}
          {activePage === 'team' && <TeamPage />}
          {activePage === 'activity' && <ActivityPage />}
          {activePage === 'settings' && <SettingsPage />}
        </Suspense>
      </AgencyShell>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => dispatch(clearToast())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => dispatch(clearToast())}
          >
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
