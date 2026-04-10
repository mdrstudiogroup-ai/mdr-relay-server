const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Map();
const dashboards = new Set();
const licenses = new Map(); // hwid → { expiry: Date, active: boolean }

function broadcast() {
  const list = Array.from(clients.entries()).map(([id, data]) => ({
    clientId: id,
    ip: data.ip,
    computerName: data.computerName,
    launchTime: data.launchTime,
    hwid: data.hwid,
    expiry: licenses.get(data.hwid)?.expiry || null,
    licensed: isLicensed(data.hwid)
  }));
  const msg = JSON.stringify({ type: 'list', clients: list });
  dashboards.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function isLicensed(hwid) {
  const lic = licenses.get(hwid);
  if (!lic || !lic.active) return false;
  return new Date() < new Date(lic.expiry);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.type === 'check') {
        const allowed = isLicensed(data.hwid);
        ws.send(JSON.stringify({ type: 'check_result', allowed }));
        return;
      }

      if (data.type === 'register') {
        const allowed = isLicensed(data.hwid);
        if (!allowed) {
          ws.send(JSON.stringify({ type: 'kill' }));
          ws.close();
          return;
        }
        clients.set(data.clientId, {
          ws, ip: data.ip,
          computerName: data.computerName,
          launchTime: new Date().toISOString(),
          hwid: data.hwid
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

      if (data.type === 'activate') {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + (data.days || 31));
        licenses.set(data.hwid, { active: true, expiry: expiry.toISOString() });
        broadcast();
      }

      if (data.type === 'deactivate') {
        licenses.set(data.hwid, { active: false, expiry: null });
        broadcast();
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
