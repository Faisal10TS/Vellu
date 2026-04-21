import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor deps into long-lived cacheable chunks so the main
        // index bundle stays slim + browsers can cache each vendor separately
        // across deploys (updates to app code don't bust vendor caches).
        manualChunks: {
          // Supabase SDK — ~170KB / 45KB gz. Updates rarely.
          'supabase': ['@supabase/supabase-js'],
          // React Router — ~48KB / 17KB gz.
          'router': ['react-router-dom'],
          // Sentry + its DOMPurify/replay deps — ~150KB / 55KB gz combined.
          // Still initialised eagerly for early-crash capture, but pulling it
          // out of the index chunk shaves the critical path.
          'sentry': ['@sentry/react'],
          // dnd-kit — only used inside OwnerApp. Making it its own chunk
          // gives it a long-term cache entry and keeps OwnerApp leaner.
          'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        }
      }
    }
  }
})
