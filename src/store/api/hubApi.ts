import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type {
  ActivityLogRecord,
  AgencySettings,
  AnySectionData,
  AssetRecord,
  ClientOnboardingStatus,
  ClientRecord,
  CreateClientInput,
  CredentialSummary,
  DashboardOverview,
  InvitationRecord,
  NotificationRecord,
  OnboardingSectionKey,
  OnboardingSectionState,
  ProgressSummary,
  RevealedCredential,
  SessionUser,
  TeamMember,
  UpdateClientPatch,
} from '../../types';
import { resetUiSession } from '../slices/uiSlice';

export interface OnboardingWorkspaceResponse {
  client: {
    id: string;
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    website: string;
    industry: string;
    description: string;
    internalNotes: string;
    status: ClientOnboardingStatus;
    dueDate: string | null;
  };
  sections: OnboardingSectionState[];
  credentials: CredentialSummary[];
  assets: AssetRecord[];
  progress: ProgressSummary;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
});

const AUTH_EXEMPT_401_PATHS = new Set([
  '/auth/me',
  '/auth/verify',
  '/auth/request-magic-link',
  '/auth/register-agency',
  '/invitations/accept',
]);

const baseQueryWithSessionGuard: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    const requestUrl = typeof args === 'string' ? args : args.url;
    if (!AUTH_EXEMPT_401_PATHS.has(requestUrl)) {
      api.dispatch(hubApi.util.resetApiState());
      api.dispatch(resetUiSession());
    }
  }
  return result;
};

export const hubApi = createApi({
  reducerPath: 'hubApi',
  baseQuery: baseQueryWithSessionGuard,
  tagTypes: [
    'Session',
    'Dashboard',
    'Clients',
    'ClientDetail',
    'Onboarding',
    'Invitations',
    'Assets',
    'Notifications',
    'Activity',
    'Settings',
  ],
  endpoints: (builder) => ({
    getSession: builder.query<{ user: SessionUser }, void>({
      query: () => '/auth/me',
      providesTags: ['Session'],
    }),
    requestMagicLink: builder.mutation<
      {
        ok: boolean;
        message: string;
        previewMagicUrl?: string;
        emailDelivery: { configured: boolean; delivered: boolean; reason?: string };
      },
      { email: string }
    >({
      query: (body) => ({
        url: '/auth/request-magic-link',
        method: 'POST',
        body,
      }),
    }),
    registerAgency: builder.mutation<
      { user: SessionUser },
      { agencyName: string; ownerName: string; email: string }
    >({
      query: (body) => ({
        url: '/auth/register-agency',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(hubApi.util.resetApiState());
          dispatch(resetUiSession());
          dispatch(hubApi.util.upsertQueryData('getSession', undefined, data));
        } catch {
          // Handled by caller
        }
      },
    }),
    verifyMagicToken: builder.mutation<{ user: SessionUser }, { token: string }>({
      query: (body) => ({
        url: '/auth/verify',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(hubApi.util.resetApiState());
          dispatch(resetUiSession());
          dispatch(hubApi.util.upsertQueryData('getSession', undefined, data));
        } catch {
          // Handled by caller
        }
      },
    }),
    logout: builder.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(hubApi.util.resetApiState());
          dispatch(resetUiSession());
        }
      },
    }),

    getDashboardOverview: builder.query<DashboardOverview, void>({
      query: () => '/dashboard/overview',
      providesTags: ['Dashboard'],
    }),

    getClients: builder.query<{ clients: ClientRecord[] }, { search?: string; status?: string }>({
      query: ({ search = '', status = 'all' }) => ({
        url: '/clients',
        params: { search, status },
      }),
      providesTags: ['Clients'],
    }),
    getClientDetail: builder.query<
      { client: ClientRecord; activity: ActivityLogRecord[] },
      string
    >({
      query: (id) => `/clients/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'ClientDetail', id }],
    }),
    createClient: builder.mutation<{ client: ClientRecord }, CreateClientInput>({
      query: (body) => ({
        url: '/clients',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Clients', 'Dashboard', 'Activity', 'Notifications'],
    }),
    updateClient: builder.mutation<
      { client: ClientRecord },
      { id: string; patch: UpdateClientPatch }
    >({
      query: ({ id, patch }) => ({
        url: `/clients/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ['Clients', 'ClientDetail', 'Dashboard', 'Onboarding', 'Activity'],
    }),
    deleteClient: builder.mutation<{ ok: boolean }, { id: string; permanent?: boolean }>({
      query: ({ id, permanent }) => ({
        url: `/clients/${id}${permanent ? '?permanent=true' : ''}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Clients', 'Dashboard', 'Assets', 'Invitations', 'Activity'],
    }),

    getInvitations: builder.query<{ invitations: InvitationRecord[] }, { clientId?: string }>({
      query: ({ clientId } = {}) => ({
        url: '/invitations',
        params: clientId ? { clientId } : undefined,
      }),
      providesTags: ['Invitations'],
    }),
    createInvitation: builder.mutation<
      { invitation: InvitationRecord },
      { clientId: string; expiresInDays?: number; sendEmail?: boolean }
    >({
      query: (body) => ({
        url: '/invitations',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Invitations', 'Clients', 'Activity'],
    }),
    resendInvitation: builder.mutation<
      { portalPreviewUrl?: string; emailDelivery: { configured: boolean; delivered: boolean; reason?: string } },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/invitations/${id}/resend`,
        method: 'POST',
      }),
      invalidatesTags: ['Invitations', 'Activity'],
    }),
    revokeInvitation: builder.mutation<{ ok: boolean }, { id: string }>({
      query: ({ id }) => ({
        url: `/invitations/${id}/revoke`,
        method: 'POST',
      }),
      invalidatesTags: ['Invitations', 'Clients', 'Activity'],
    }),
    acceptInvitationToken: builder.mutation<{ user: SessionUser }, { token: string }>({
      query: (body) => ({
        url: '/invitations/accept',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(hubApi.util.resetApiState());
          dispatch(resetUiSession());
          dispatch(hubApi.util.upsertQueryData('getSession', undefined, data));
        } catch {
          // Handled by caller
        }
      },
    }),

    getOnboardingWorkspace: builder.query<OnboardingWorkspaceResponse, string>({
      query: (clientId) => `/onboarding/${clientId}`,
      providesTags: (_result, _err, clientId) => [{ type: 'Onboarding', id: clientId }],
    }),
    saveOnboardingSection: builder.mutation<
      { ok: boolean; status: string; progress: ProgressSummary },
      {
        clientId: string;
        sectionKey: OnboardingSectionKey;
        data: AnySectionData;
        markComplete: boolean;
      }
    >({
      query: ({ clientId, sectionKey, data, markComplete }) => ({
        url: `/onboarding/${clientId}/sections/${sectionKey}`,
        method: 'PUT',
        body: { data, markComplete },
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        { type: 'Onboarding', id: clientId },
        { type: 'ClientDetail', id: clientId },
        'Clients',
        'Dashboard',
        'Activity',
        'Notifications',
      ],
    }),
    reviewOnboardingSection: builder.mutation<
      { ok: boolean },
      {
        clientId: string;
        sectionKey: OnboardingSectionKey;
        decision: 'completed' | 'needs_revision';
        note?: string;
      }
    >({
      query: ({ clientId, sectionKey, decision, note }) => ({
        url: `/onboarding/${clientId}/sections/${sectionKey}/review`,
        method: 'POST',
        body: { decision, note },
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        { type: 'Onboarding', id: clientId },
        { type: 'ClientDetail', id: clientId },
        'Clients',
        'Dashboard',
        'Activity',
      ],
    }),
    addCredential: builder.mutation<
      { credential: CredentialSummary },
      {
        clientId: string;
        serviceName: string;
        category: 'hosting' | 'domain' | 'cms' | 'analytics' | 'other';
        accessType: 'delegated_invite' | 'temporary_token' | 'username_password';
        loginUrl?: string;
        username: string;
        secretValue: string;
        notes?: string;
      }
    >({
      query: ({ clientId, ...body }) => ({
        url: `/onboarding/${clientId}/credentials`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        { type: 'Onboarding', id: clientId },
        'Clients',
        'Dashboard',
        'Activity',
        'Notifications',
      ],
    }),
    revealCredential: builder.mutation<
      RevealedCredential,
      { clientId: string; credId: string }
    >({
      query: ({ clientId, credId }) => ({
        url: `/onboarding/${clientId}/credentials/${credId}/reveal`,
        method: 'POST',
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        { type: 'Onboarding', id: clientId },
        'Activity',
      ],
    }),
    deleteCredential: builder.mutation<{ ok: boolean }, { clientId: string; credId: string }>({
      query: ({ clientId, credId }) => ({
        url: `/onboarding/${clientId}/credentials/${credId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        { type: 'Onboarding', id: clientId },
        'Clients',
        'Dashboard',
        'Activity',
      ],
    }),

    getAssets: builder.query<
      { assets: AssetRecord[] },
      { clientId?: string; category?: string; search?: string }
    >({
      query: (params = {}) => ({
        url: '/assets',
        params,
      }),
      providesTags: ['Assets'],
    }),
    getAssetDownloadUrl: builder.mutation<{ url: string }, { id: string }>({
      query: ({ id }) => ({
        url: `/assets/${id}/download-token`,
        method: 'POST',
      }),
    }),
    updateAssetMetadata: builder.mutation<
      { asset: AssetRecord },
      {
        id: string;
        clientId?: string;
        originalName?: string;
        category?: AssetRecord['category'];
        description?: string;
        sectionKey?: OnboardingSectionKey | null;
      }
    >({
      query: ({ id, clientId: _clientId, ...body }) => ({
        url: `/assets/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        'Assets',
        'Clients',
        'Dashboard',
        'Activity',
        ...(clientId
          ? [
              { type: 'Onboarding' as const, id: clientId },
              { type: 'ClientDetail' as const, id: clientId },
            ]
          : []),
      ],
    }),
    deleteAsset: builder.mutation<{ ok: boolean }, { id: string; clientId?: string }>({
      query: ({ id }) => ({
        url: `/assets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { clientId }) => [
        'Assets',
        'Clients',
        'Dashboard',
        'Activity',
        ...(clientId ? [{ type: 'Onboarding' as const, id: clientId }] : []),
      ],
    }),

    getNotifications: builder.query<
      { notifications: NotificationRecord[]; unreadCount: number },
      void
    >({
      query: () => '/notifications',
      providesTags: ['Notifications'],
    }),
    markNotificationRead: builder.mutation<{ ok: boolean }, { id: string }>({
      query: ({ id }) => ({
        url: `/notifications/${id}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: builder.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: '/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: ['Notifications'],
    }),
    getActivityLogs: builder.query<{ activity: ActivityLogRecord[] }, void>({
      query: () => '/notifications/activity',
      providesTags: ['Activity'],
    }),

    getSettings: builder.query<
      {
        agency: AgencySettings;
        team: TeamMember[];
        securityStatus: {
          encryptionAlgorithm: string;
          encryptionKeyConfigured: boolean;
          authSecretConfigured?: boolean;
          smtpConfigured: boolean;
          cloudinaryConfigured?: boolean;
          storageDriver: string;
          databaseDriver?: 'postgresql' | 'sqlite';
        };
      },
      void
    >({
      query: () => '/settings',
      providesTags: ['Settings'],
    }),
    updateSettings: builder.mutation<{ ok: boolean }, Omit<AgencySettings, 'id'>>({
      query: (body) => ({
        url: '/settings',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings', 'Session', 'Clients', 'Dashboard', 'Onboarding'],
    }),
    addTeamMember: builder.mutation<
      { member: TeamMember },
      { name: string; email: string; role: 'admin' | 'member'; title: string }
    >({
      query: (body) => ({
        url: '/settings/team',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Settings', 'Activity'],
    }),
    updateTeamRole: builder.mutation<
      { ok: boolean },
      { userId: string; role: 'admin' | 'member' }
    >({
      query: ({ userId, role }) => ({
        url: `/settings/team/${userId}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Settings', 'Activity'],
    }),
    removeTeamMember: builder.mutation<{ ok: boolean }, { userId: string }>({
      query: ({ userId }) => ({
        url: `/settings/team/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Settings', 'Clients', 'Activity'],
    }),
  }),
});

export const {
  useGetSessionQuery,
  useRequestMagicLinkMutation,
  useRegisterAgencyMutation,
  useVerifyMagicTokenMutation,
  useLogoutMutation,
  useGetDashboardOverviewQuery,
  useGetClientsQuery,
  useGetClientDetailQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useGetInvitationsQuery,
  useCreateInvitationMutation,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useAcceptInvitationTokenMutation,
  useGetOnboardingWorkspaceQuery,
  useSaveOnboardingSectionMutation,
  useReviewOnboardingSectionMutation,
  useAddCredentialMutation,
  useRevealCredentialMutation,
  useDeleteCredentialMutation,
  useGetAssetsQuery,
  useGetAssetDownloadUrlMutation,
  useUpdateAssetMetadataMutation,
  useDeleteAssetMutation,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetActivityLogsQuery,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useAddTeamMemberMutation,
  useUpdateTeamRoleMutation,
  useRemoveTeamMemberMutation,
} = hubApi;
