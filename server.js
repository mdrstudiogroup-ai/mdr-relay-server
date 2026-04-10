const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Map(); // clientId → { ws, ip, computerName, launchTime }
const dashboards = new Set(); // dashboard connections

function broadcast() {
  const list = Array.from(clients.entries()).map(([id, data]) => ({
    clientId: id,
    ip: data.ip,
    computerName: data.computerName,
    launchTime: data.launchTime
  }));
  const msg = JSON.stringify({ type: 'list', clients: list });
  dashboards.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.type === 'register') {
        clients.set(data.clientId, {
          ws,
          ip: data.ip,
          computerName: data.computerName,
          launchTime: new Date().toISOString()
        });
        ws._clientId = data.clientId;
        broadcast();
      }

      if (data.type === 'dashboard') {
        dashboards.add(ws);
        ws._isDashboard = true;
        broadcast();
      }

      if (data.type === 'kill') {
        const target = clients.get(data.clientId);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({ type: 'kill' }));
        }
      }

    } catch (e) {}
  });

  ws.on('close', () => {
    if (ws._isDashboard) {
      dashboards.delete(ws);
    } else if (ws._clientId) {
      clients.delete(ws._clientId);
      broadcast();
    }
  });
});

console.log(`Relay server running on port ${PORT}`);
