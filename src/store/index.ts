import { configureStore } from '@reduxjs/toolkit';
import { hubApi } from './api/hubApi';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    [hubApi.reducerPath]: hubApi.reducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(hubApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
