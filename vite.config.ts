import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const FIREBASE_MODULES = ["app", "auth", "firestore", "functions"];

// `vite build --mode demo` swaps the Firebase SDK for the in-browser shims in src/demo so the
// UI runs with seeded data and no Firebase project (used for the GitHub Pages preview).
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: demo
        ? FIREBASE_MODULES.map((name) => ({ find: new RegExp(`^firebase/${name}$`), replacement: fileURLToPath(new URL(`./src/demo/${name}.ts`, import.meta.url)) }))
        : []
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            ...(demo ? {} : { firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/functions"] }),
            charts: ["recharts"]
          }
        }
      }
    }
  };
});
