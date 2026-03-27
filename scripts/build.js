#!/usr/bin/env node
/**
 * FINAULT BUILD PIPELINE
 * Bundles the 9,476-line gateway + 20 modules into a single Cloudflare Worker
 */
import { build } from 'esbuild';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const isProd = process.argv.includes('--production');

/**
 * buildGateway - Builds the Finault Gateway using esbuild
 * MEDIUM: Includes source map validation and error reporting
 * LOW: Enhanced logging with build details
 */
async function buildGateway() {
  const start = Date.now();
  console.log(`\n⚡ Building Finault Gateway v4.0 [${isProd ? 'PRODUCTION' : 'development'}]\n`);

  try {
    const result = await build({
      entryPoints: [path.join(ROOT, 'apps/gateway/gateway.ts')],
      bundle: true,
      outfile: path.join(ROOT, 'dist/gateway.js'),
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: isProd,
      sourcemap: true,
      metafile: true,
      treeShaking: true,

      // Cloudflare Workers externals — both bare and node: prefixed
      external: [
        'node:crypto',
        'node:events',
        'node:util',
        'node:stream',
        'node:buffer',
        'node-fetch',
        'cloudflare:*'
      ],

      // Rewrite bare Node built-in imports to node: prefix (Workers require it)
      alias: {
        'crypto': 'node:crypto',
        'events': 'node:events',
        'util': 'node:util',
        'stream': 'node:stream',
        'buffer': 'node:buffer'
      },

      // Define environment
      define: {
        'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
        'FINAULT_BUILD_TIME': `"${new Date().toISOString()}"`,
        'FINAULT_VERSION': '"4.0.0"'
      },

      // Handle mixed ESM/CJS
      mainFields: ['module', 'main'],
      conditions: ['worker', 'browser', 'import', 'default'],

      // Banner — shim require() for Node builtins in Workers ESM
      // esbuild's generated __require checks typeof require !== "undefined"
      // so this shim takes over and resolves node: builtins via static ESM imports
      banner: {
        js: [
          '/* Finault Gateway v4.0 — Production Build */',
          'import __node_crypto from "node:crypto";',
          'import __node_events from "node:events";',
          'import __node_util from "node:util";',
          'import __node_stream from "node:stream";',
          'import __node_buffer from "node:buffer";',
          'const __node_builtin_map = {',
          '  "crypto": __node_crypto, "node:crypto": __node_crypto,',
          '  "events": __node_events, "node:events": __node_events,',
          '  "util": __node_util, "node:util": __node_util,',
          '  "stream": __node_stream, "node:stream": __node_stream,',
          '  "buffer": __node_buffer, "node:buffer": __node_buffer,',
          '};',
          'function require(mod) {',
          '  if (__node_builtin_map[mod]) return __node_builtin_map[mod];',
          '  throw new Error("Cannot require module: " + mod);',
          '}',
        ].join('\n')
      },

      logLevel: 'info'
    });

    // Report bundle size
    const outputs = Object.entries(result.metafile.outputs);
    for (const [file, meta] of outputs) {
      if (file.endsWith('.js')) {
        const sizeKB = (meta.bytes / 1024).toFixed(1);
        const sizeMB = (meta.bytes / (1024 * 1024)).toFixed(2);
        console.log(`\n📦 Bundle: ${file}`);
        console.log(`   Size: ${sizeKB} KB (${sizeMB} MB)`);
        console.log(`   Inputs: ${Object.keys(meta.inputs).length} modules`);
      }
    }

    // MEDIUM: Validate source maps exist
    const jsFiles = Object.keys(result.metafile.outputs).filter(f => f.endsWith('.js'));
    if (isProd && jsFiles.length > 0) {
      const mapFiles = Object.keys(result.metafile.outputs).filter(f => f.endsWith('.js.map'));
      if (mapFiles.length === 0) {
        console.warn('⚠️  No source maps generated for production build');
      } else {
        console.log(`✓ Source maps validated: ${mapFiles.length} map file(s)`);
      }
    }

    const elapsed = Date.now() - start;
    console.log(`\n✅ Build complete in ${elapsed}ms\n`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Build failed:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

buildGateway();
