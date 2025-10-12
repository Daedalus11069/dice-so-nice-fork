// Import necessary plugins
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import del from 'rollup-plugin-delete';
import copy from 'rollup-plugin-copy';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';
import { readFileSync, writeFileSync } from 'fs';

// Define static files for the copy plugin
const staticFiles = [
  { name: "css" },
  { name: "fonts" },
  { name: "images" },
  { name: "lang" },
  { name: "select2.min.js", folder: "libs" },
  { name: "models", folder: "sfx" },
  { name: "sounds", folder: "sfx" },
  { name: "textures", folder: "sfx" },
  { name: "sounds" },
  { name: "templates" },
  { name: "textures" },
  { name: "module.json" },
];

// Environment flag to detect watch mode
const isProduction = process.env.NODE_ENV === "production";
const isWatch = process.env.ROLLUP_WATCH;

// Rollup configuration
const config = {
  input: {
    main: 'module/main.js',
    api: 'module/api.js'
  },
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: '[name]-[hash].js',
    sourcemap: true,
    manualChunks(id) {
      if (id.includes('api.js')) {
        return 'api';
      }
    }
  },
  plugins: [
    !isProduction &&{
      name: 'set-module-version',
      buildStart() {
        const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
        const moduleJson = JSON.parse(readFileSync('./module/module.json', 'utf8'));
        const compatibilityVerified = moduleJson.compatibility.verified;
        if(moduleJson.version !== packageJson.version) {
          moduleJson.version = packageJson.version;
          moduleJson.download = `https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/jobs/artifacts/${packageJson.version}/raw/dist/dice-so-nice.zip?job=build`;

          writeFileSync('./module/module.json', JSON.stringify(moduleJson, null, 4));
          console.log(`[Dice So Nice] Module version set to ${packageJson.version}`);
          console.log(`[Dice So Nice] Compatibility verified: ${compatibilityVerified}`);
        }
      }
    },
    !isWatch && del({
      targets: 'dist/*',
      runOnce: true
    }),
    !isWatch && copy({
      targets: staticFiles.map((file) => ({
        src: `module/${file.folder ? `${file.folder}/` : ""}${file.name}`,
        dest: `dist${file.folder ? `/${file.folder}` : ""}`,
      })),
    }),
    // Add a copy of three.js to the libs folder for external usage
    !isWatch && copy({
      targets: [{
        src: `node_modules/three/build/three.module.min.js`,
        dest: `dist/libs`
      },
      {
        src: `node_modules/three/build/three.core.min.js`,
        dest: `dist/libs`
      }]
    }),
    //add a copy of Draco decoder to the draco folder for three.js
    !isWatch && copy({
      targets: [{
        src: `node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm`,
        dest: `dist/libs/`
      },
      {
        src: `node_modules/three/examples/jsm/libs/draco/draco_wasm_wrapper.js`,
        dest: `dist/libs/`
      }]
    }),
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs({
      include: /node_modules/
    }),
    isProduction && terser({
      ecma: 2020,
      keep_fnames: true,
      compress: {
        drop_console: true
      }
    }),
    webWorkerLoader({
      targetPlatform: 'browser',
      preserveSource: !isWatch,
      sourcemap: !isProduction
    })
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code !== 'CIRCULAR_DEPENDENCY') {
      warn(warning);
    }
  }
};

export default config;