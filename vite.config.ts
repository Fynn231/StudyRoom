import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'exact-public-worker-assets',
    generateBundle(_options, bundle) {
      const assets = Object.fromEntries(Object.values(bundle)
        .filter(output => output.type === 'chunk' || output.fileName.endsWith('.css'))
        .map(output => [`/${output.fileName}`, output.fileName.endsWith('.css') ? 'text/css' : 'text/javascript']));
      const source = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8')
        .replace('const BUILD_ASSETS = {};', `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  }],
});
