import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const baseConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'ES2020',
  outfile: 'out/extension.js',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  keepNames: true,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(baseConfig);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    const result = await esbuild.build(baseConfig);
    if (result.errors.length > 0) {
      console.error('[esbuild] Build failed:', result.errors);
      process.exit(1);
    }
    console.log('[esbuild] Build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
