const packageJson = require('../package.json');

function getBuildIdentity() {
  const versionText = String(packageJson.version || '0.0.0');
  const versionTag = `v${versionText}`;
  const versionForId = versionText.replace(/[^0-9A-Za-z.-]/g, '-');
  return {
    versionText,
    versionTag,
    versionForId,
    appId: `com.agent-wars.app.${versionForId}`,
    productName: `Agent Wars ${versionTag}`,
  };
}

module.exports = {
  getBuildIdentity,
};
