import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initSentry, ErrorBoundary } from './sentry.js'

// Initialise error reporting as early as possible so errors during the first
// render of App are captured. No-op unless VITE_SENTRY_DSN is set.
initSentry()

// Fallback UI when a crash bubbles all the way up. Keep it minimal + branded
// so the user understands something went wrong but isn't left on a blank
// white screen. Sentry has already been notified by the time this renders.
function CrashScreen({ error, resetError }) {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0d0b0a",
      color: "#ede8e0",
      fontFamily: "'Jost',system-ui,sans-serif",
      padding: 32,
      textAlign: "center",
      gap: 16,
    }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, letterSpacing: "0.1em" }}>vellu</div>
      <div style={{ fontSize: 16, maxWidth: 420 }}>
        Er is iets misgegaan. We zijn op de hoogte gebracht en kijken er naar.
      </div>
      <div style={{ fontSize: 12, color: "rgba(237,232,224,0.55)", maxWidth: 420, fontFamily: "monospace" }}>
        {String(error?.message || error || "").slice(0, 200)}
      </div>
      <button
        onClick={() => { resetError(); window.location.reload(); }}
        style={{
          background: "#c9a96e",
          color: "#0d0b0a",
          border: "none",
          borderRadius: 100,
          padding: "12px 28px",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        Opnieuw proberen
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={CrashScreen}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
