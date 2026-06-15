import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Intercept base64 decoding to log error context
if (typeof Uint8Array.fromBase64 === 'function') {
  const originalFromBase64 = Uint8Array.fromBase64;
  Uint8Array.fromBase64 = function (str: string, options?: any) {
    try {
      return originalFromBase64.call(Uint8Array, str, options);
    } catch (err: any) {
      console.error("Uint8Array.fromBase64 failed decoding string:", {

        strLength: str?.length,
        strStart: str?.substring(0, 100),
        strEnd: str?.substring(str?.length - 100),
        options,
        error: err?.message,
        stack: err?.stack
      });
      throw err;
    }
  };
}

const originalAtob = window.atob;
window.atob = function (str: string) {
  try {
    return originalAtob(str);
  } catch (err: any) {
    console.error("atob failed decoding string:", {
      strLength: str?.length,
      strStart: str?.substring(0, 100),
      strEnd: str?.substring(str?.length - 100),
      error: err?.message,
      stack: err?.stack
    });
    throw err;
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
