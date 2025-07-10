const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(cors());
app.use(helmet());

// Map: deviceId -> WebSocket
const clients = new Map();

// --- WebSocket Connection: Electron App Registers ---
wss.on('connection', (ws, req) => {
  let deviceId = null;
  const ip = req.socket.remoteAddress;
  console.log(`[WS] New connection from IP: ${ip}`);

  ws.on('message', (msg) => {
    console.log(`[WS] Message received from ${deviceId || ip}: ${msg}`);
    try {
      const data = JSON.parse(msg);
      if (data.type === 'register' && data.deviceId) {
        deviceId = data.deviceId;
        clients.set(deviceId, ws);
        console.log(`[WS] Registered device: ${deviceId} from IP: ${ip}`);
        ws.send(JSON.stringify({ type: 'registered', deviceId }));
      } else if (data.type === 'status' && deviceId) {
        console.log(`[WS] Status from ${deviceId}:`, data.status);
      } else {
        console.log(`[WS] Unknown message type from ${deviceId || ip}`);
      }
    } catch (e) {
      console.error('[WS] Invalid message:', msg);
    }
  });

  ws.on('close', () => {
    if (deviceId) {
      clients.delete(deviceId);
      console.log(`[WS] Device disconnected: ${deviceId} from IP: ${ip}`);
    } else {
      console.log(`[WS] Connection closed from IP: ${ip} (unregistered)`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on connection from ${deviceId || ip}:`, err.message);
  });
});

// --- REST API: Web App Sends Command (e.g., Print Job) ---
app.post('/api/command', (req, res) => {
  const { deviceId, command, payload } = req.body;
  console.log(`[API] Command received for deviceId: ${deviceId}, command: ${command}`);
  const ws = clients.get(deviceId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn(`[API] Device ${deviceId} not connected or WebSocket not open.`);
    return res.status(404).json({ error: 'Device not connected' });
  }
  ws.send(JSON.stringify({ type: 'command', command, payload }));
  res.json({ success: true });
});

// --- REST API: List Connected Devices ---
app.get('/api/devices', (req, res) => {
  const deviceList = Array.from(clients.keys());
  console.log(`[API] Listing connected devices: ${deviceList.length}`);
  res.json({ devices: deviceList });
});

// --- REST API: Health Check ---
app.get('/', (req, res) => {
  res.send('Middleware Relay Server is running.');
});

// --- REST API: Server Status (NEW) ---
app.get('/api/status', (req, res) => {
  const deviceList = Array.from(clients.keys());
  const status = {
    serverTime: new Date().toISOString(),
    connectedDevicesCount: deviceList.length,
    connectedDevices: deviceList
  };
  console.log('[API] Status requested:', status);
  res.json(status);
});

// --- Start Server ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Middleware server listening on port ${PORT}`);
});
