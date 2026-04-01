const packageJson = require('./package.json');

const versionText = String(packageJson.version || '0.0.0');
const versionTag = `v${versionText}`;
const versionForId = versionText.replace(/[^0-9A-Za-z.-]/g, '-');

module.exports = {
  appId: `com.agent-wars.app.${versionForId}`,
  productName: `Agent Wars ${versionTag}`,
  artifactName: '${productName}-${os}-${arch}.${ext}',
  publish: [],
  directories: {
    output: 'release',
  },
  files: [
    'dist',
    'static',
    'package.json',
    'node_modules',
    'data/generated/terrain_res1_metadata.json',
    'data/generated/terrain_res4_metadata.json',
    'data/generated/terrain_res1_naming.json',
    'data/generated/terrain_res4_naming.json',
  ],
  extraResources: [
    {
      from: 'data/generated',
      to: 'data/generated',
      filter: [
        'terrain_res1_metadata.json',
        'terrain_res4_metadata.json',
        'terrain_res1_naming.json',
        'terrain_res4_naming.json',
      ],
    },
  ],
  win: {
    target: ['zip'],
  },
  linux: {
    target: ['dir'],
  },
  mac: {
    target: ['dir'],
    category: 'public.app-category.games',
  },
};
