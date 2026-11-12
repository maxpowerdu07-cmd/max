// Single-file build for the claude.ai artifact (iOS test version): `npm run build:artifact`
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ plugins: [react(), viteSingleFile()], build: { outDir: 'dist-artifact' } });
