const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const ROOT   = __dirname;
const SRC    = path.resolve(ROOT, 'src');
const DIST   = path.resolve(ROOT, 'dist');
const PUBLIC = path.resolve(ROOT, 'public');

/** @type {import('webpack').Configuration} */
module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    // ── Entries ──────────────────────────────────────────────────────────────
    entry: {
      background: path.resolve(SRC, 'background/index.ts'),
      content:    path.resolve(SRC, 'content/index.ts'),
      popup:      path.resolve(SRC, 'popup/index.ts'),
      sidepanel:  path.resolve(SRC, 'sidepanel/index.ts'),
      settings:   path.resolve(SRC, 'settings/settings.ts'),
    },

    // ── Output ───────────────────────────────────────────────────────────────
    output: {
      path:     DIST,
      filename: '[name].js',
      clean:    false,
    },

    // ── Resolve ──────────────────────────────────────────────────────────────
    resolve: {
      extensions: ['.ts', '.js'],
      // ESM TypeScript convention: source files write `import './foo.js'` but
      // the actual file on disk is `foo.ts`. extensionAlias makes webpack try
      // the .ts variant first whenever a .js import cannot be found.
      extensionAlias: {
        '.js': ['.ts', '.js'],
      },
      alias: {
        '@content':    path.resolve(SRC, 'content'),
        '@background': path.resolve(SRC, 'background'),
        '@engines':    path.resolve(SRC, 'engines'),
        '@adapters':   path.resolve(SRC, 'adapters'),
        '@ui':         path.resolve(SRC, 'ui'),
        '@utils':      path.resolve(SRC, 'utils'),
        '@types':      path.resolve(SRC, 'types'),
        '@services':   path.resolve(SRC, 'services'),
      },
    },

    // ── Module Rules ─────────────────────────────────────────────────────────
    module: {
      rules: [
        {
          test:    /\.ts$/,
          use: {
            loader:  'ts-loader',
            options: { transpileOnly: isDev },
          },
          exclude: /node_modules/,
        },
        // HTML templates → raw string (for Shadow DOM innerHTML)
        {
          test: /\.html$/,
          type: 'asset/source',
        },
        // content.css → extracted to dist/content.css (referenced by manifest)
        {
          test:    /content\.css$/,
          use:     [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        // panel.css and any other CSS → raw string for Shadow DOM injection
        {
          test:    /\.css$/,
          exclude: /content\.css$/,
          type:    'asset/source',
        },
      ],
    },

    // ── Plugins ──────────────────────────────────────────────────────────────
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name].css' }),

      new CopyWebpackPlugin({
        patterns: [
          { from: path.resolve(ROOT, 'manifest.json'),        to: DIST },
          { from: path.resolve(PUBLIC, 'icons'),              to: path.resolve(DIST, 'public/icons'),     noErrorOnMissing: true },
          { from: path.resolve(PUBLIC, 'popup'),              to: path.resolve(DIST, 'public/popup'),     noErrorOnMissing: true },
          { from: path.resolve(PUBLIC, 'sidepanel'),          to: path.resolve(DIST, 'public/sidepanel'), noErrorOnMissing: true },
          // Settings page: copy HTML + CSS from src/settings to dist/settings
          { from: path.resolve(SRC, 'settings/settings.html'), to: path.resolve(DIST, 'settings/settings.html'), noErrorOnMissing: true },
          { from: path.resolve(SRC, 'settings/settings.css'),  to: path.resolve(DIST, 'settings/settings.css'),  noErrorOnMissing: true },
        ],
      }),
    ],

    // ── Optimization ─────────────────────────────────────────────────────────
    optimization: {
      splitChunks: false,       // MV3 content scripts must be single files
      moduleIds:   'deterministic',
    },

    devtool: isDev ? 'cheap-module-source-map' : false,

    stats: {
      preset:  'minimal',
      assets:  true,
      timings: true,
    },

    performance: {
      hints:             isDev ? false : 'warning',
      maxAssetSize:      1_000_000,
      maxEntrypointSize: 1_000_000,
    },
  };
};
