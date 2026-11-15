import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AgencyNavPage =
  | 'overview'
  | 'clients'
  | 'onboarding'
  | 'assets'
  | 'team'
  | 'activity'
  | 'settings';

export type ClientStatusFilter =
  | 'all'
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'overdue'
  | 'archived';

export interface ToastMessage {
  id: string;
  severity: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface UiState {
  activePage: AgencyNavPage;
  selectedClientId: string | null;
  clientStatusFilter: ClientStatusFilter;
  globalSearch: string;
  mobileNavOpen: boolean;
  toast: ToastMessage | null;
}

const initialState: UiState = {
  activePage: 'overview',
  selectedClientId: null,
  clientStatusFilter: 'all',
  globalSearch: '',
  mobileNavOpen: false,
  toast: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActivePage(state, action: PayloadAction<AgencyNavPage>) {
      state.activePage = action.payload;
      state.mobileNavOpen = false;
    },
    navigateClientsWithFilter(state, action: PayloadAction<ClientStatusFilter>) {
      state.clientStatusFilter = action.payload;
      state.activePage = 'clients';
      state.mobileNavOpen = false;
    },
    setClientStatusFilter(state, action: PayloadAction<ClientStatusFilter>) {
      state.clientStatusFilter = action.payload;
    },
    openClientWorkspace(state, action: PayloadAction<string>) {
      state.selectedClientId = action.payload;
      state.activePage = 'onboarding';
      state.mobileNavOpen = false;
    },
    setSelectedClientId(state, action: PayloadAction<string | null>) {
      state.selectedClientId = action.payload;
    },
    setGlobalSearch(state, action: PayloadAction<string>) {
      state.globalSearch = action.payload;
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    showToast(
      state,
      action: PayloadAction<{ severity: ToastMessage['severity']; text: string }>,
    ) {
      state.toast = {
        id: String(Date.now()),
        severity: action.payload.severity,
        text: action.payload.text,
      };
    },
    clearToast(state) {
      state.toast = null;
    },
    resetUiSession(state) {
      state.activePage = 'overview';
      state.selectedClientId = null;
      state.clientStatusFilter = 'all';
      state.globalSearch = '';
      state.mobileNavOpen = false;
    },
  },
});

export const {
  setActivePage,
  navigateClientsWithFilter,
  setClientStatusFilter,
  openClientWorkspace,
  setSelectedClientId,
  setGlobalSearch,
  setMobileNavOpen,
  showToast,
  clearToast,
  resetUiSession,
} = uiSlice.actions;

export default uiSlice.reducer;
