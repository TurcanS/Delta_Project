import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { AuthProvider } from './auth';
import { ToastProvider } from './Toast';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><ErrorBoundary><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></ErrorBoundary></StrictMode>,
);
