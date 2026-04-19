const { buildElectronBuilderConfig } = require('./scripts/electronBuilderBaseConfig.cjs');

module.exports = buildElectronBuilderConfig({
  publish: [],
  artifactName: '${productName}-${os}-${arch}.${ext}',
  files: [
    'dist',
    'static',
    'symbols',
    'package.json',
    'node_modules',
    'data/generated/terrain_res1_metadata.json',
    'data/generated/terrain_res4_metadata.json',
    'data/generated/terrain_res1_naming.json',
    'data/generated/terrain_res4_naming.json',
    'data/generated/terrain_res4_road_rail_sides.json',
    'data/generated/terrain_res4_road_rail_vectors.json',
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
        'terrain_res4_road_rail_sides.json',
        'terrain_res4_road_rail_vectors.json',
      ],
    },
  ],
  winTarget: ['zip'],
  linuxTarget: ['dir'],
  macTarget: ['dir'],
});
