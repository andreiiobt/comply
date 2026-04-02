import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "images/iobt-icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Comply by IOBT",
        short_name: "Comply",
        description: "Workplace compliance platform",
        theme_color: "#0A2B02",
        background_color: "#F6F7F5",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Cache the app shell and static assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Don't cache Supabase API calls — always fetch live
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/rest/, /^\/auth/],
        runtimeCaching: [
          {
            // Google Fonts — cache for a year
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase storage (logos, attachments) — network first, fallback to cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-storage",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Show offline fallback for navigation requests when offline
        offlineGoogleAnalytics: false,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
