
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const originalError = console.error;
console.error = (...args) => {
  if (args.some(arg => typeof arg === 'string' && arg.includes('Refresh Token Not Found'))) {
    return;
  }
  if (args[0] && args[0].message && args[0].message.includes('Refresh Token Not Found')) {
    return;
  }
  originalError.apply(console, args);
};

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes('Refresh Token')) {
    event.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
