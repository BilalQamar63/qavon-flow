import { CssBaseline, ThemeProvider } from '@mui/material';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { store } from './store';
import { appTheme } from './theme';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </Provider>,
);
