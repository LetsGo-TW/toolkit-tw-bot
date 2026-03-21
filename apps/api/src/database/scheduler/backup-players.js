const backupPlayers = require("../../../../ops/src/backup-players");

if (require.main === module) {
  backupPlayers.main();
}

module.exports = backupPlayers;
