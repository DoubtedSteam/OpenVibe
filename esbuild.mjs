import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'ES2020',
  outfile: 'out/extension.js',
  external: ['vscode', 'playwright', 'playwright-core'],
  sourcemap: !production,
  minify: production,
  keepNames: true,
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'ES2020',
  outfile: 'media/webview.js',
  sourcemap: !production,
  minify: production,
};

async function main() {
  const configs = [extConfig, webviewConfig];
  if (watch) {
    const ctxs = await Promise.all(configs.map(c => esbuild.context(c)));
    await Promise.all(ctxs.map(ctx => ctx.watch()));
    console.log('[esbuild] Watching for changes (extension + webview)...');
  } else {
    const results = await Promise.all(configs.map(c => esbuild.build(c)));
    for (const result of results) {
      if (result.errors.length > 0) {
        console.error('[esbuild] Build failed:', result.errors);
        process.exit(1);
      }
    }
    console.log('[esbuild] Build complete (extension + webview)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
