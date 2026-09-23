import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { ErrorState } from './components/ui/States';
import { errors } from './i18n/he';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSupabaseConfigured ? <App /> : <ErrorState fullPage message={errors.missingEnv} />}
  </StrictMode>,
);
