// Пинг серверов (статус, онлайн, MOTD, иконка)
const util = require('minecraft-server-util');

async function ping(address) {
  const [host, portStr] = String(address).split(':');
  const port = Number(portStr) || 25565;
  try {
    const r = await util.status(host, port, { timeout: 4000, enableSRV: true });
    return {
      online: true,
      players: r.players.online, max: r.players.max,
      version: r.version.name, motd: r.motd.clean, favicon: r.favicon, ping: r.roundTripLatency,
    };
  } catch (e) {
    return { online: false, error: e.message };
  }
}

module.exports = { ping };
