import { defineConfig } from 'tsdown';

// Compile le domaine en bibliothèque ESM (un fichier JS + ses types) pour les
// programmes qui l'exécutent avec Node (apps/api). Le domaine ne dépend de rien :
// rien n'est externalisé, et il reste neutre vis-à-vis de la plateforme (Node ou mobile).
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  outDir: 'dist',
});
