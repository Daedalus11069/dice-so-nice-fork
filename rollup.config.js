// Import necessary plugins
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import del from 'rollup-plugin-delete';
import copy from 'rollup-plugin-copy';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// Define static files for the copy plugin
const staticFiles = [
  { name: "css" },
  { name: "fonts" },
  { name: "images" },
  { name: "lang" },
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
    !isWatch && {
      name: 'convert-atlas-png-to-webp',
      buildStart() {
        const texturesDir = './module/textures';
        for (const file of readdirSync(texturesDir)) {
          if (!file.endsWith('.json')) continue;
          const jsonPath = `${texturesDir}/${file}`;
          const manifest = JSON.parse(readFileSync(jsonPath, 'utf8'));
          if (!manifest.meta?.image?.endsWith('.png')) continue;

          const pngPath = `${texturesDir}/${manifest.meta.image}`;
          const webpName = manifest.meta.image.replace(/\.png$/, '.webp');
          const webpPath = `${texturesDir}/${webpName}`;

          if (!existsSync(pngPath)) continue;

          console.log(`[Dice So Nice] Converting ${manifest.meta.image} -> ${webpName}`);
          try {
            execSync(`cwebp -near_lossless 30 -noalpha "${pngPath}" -o "${webpPath}"`);
          } catch (e) {
            throw new Error(`[Dice So Nice] cwebp failed. Install libwebp (apt install webp / brew install webp).\n${e.message}`);
          }

          const pngName = manifest.meta.image;
          manifest.meta.image = webpName;
          writeFileSync(jsonPath, JSON.stringify(manifest, null, '\t'));

          unlinkSync(pngPath);
          console.log(`[Dice So Nice] Deleted ${pngName}`);
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
    !isWatch && copy({
      targets: [{
        src: `node_modules/slim-select/dist/slimselect.css`,
        dest: `dist/css`
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