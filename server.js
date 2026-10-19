// Classroom Seat Booking Server
// Native Node.js HTTP Server with Real-time Multi-Device Sync (SSE & REST)
// Supports Mobile Phones & Computers on the same Wi-Fi network

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_FILE = path.join(__dirname, 'data.json');

// Find Local IPv4 Address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Find IPv4 non-internal address
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIp();

// Initialize default data if not exists
function getInitialState() {
  const seats = {};
  // Left Wing: L01 - L15
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 3; c++) {
      const num = (r - 1) * 3 + c;
      const code = `L${num < 10 ? '0' + num : num}`;
      seats[code] = {
        id: code,
        wing: 'left',
        wingName: 'ฝั่งซ้าย (ริมหน้าต่าง)',
        row: r,
        col: c,
        status: 'available',
        bookedBy: null,
      };
    }
  }
  // Right Wing: R01 - R15
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 3; c++) {
      const num = (r - 1) * 3 + c;
      const code = `R${num < 10 ? '0' + num : num}`;
      seats[code] = {
        id: code,
        wing: 'right',
        wingName: 'ฝั่งขวา (ริมทางเดิน)',
        row: r,
        col: c,
        status: 'available',
        bookedBy: null,
      };
    }
  }

  return {
    seats,
    users: [
      {
        id: 'admin_usr',
        username: 'admin',
        password: 'admin123',
        name: 'อาจารย์ผู้ดูแลระบบ (Admin)',
        nickname: 'อาจารย์',
        studentId: 'ADMIN-01',
        role: 'admin',
        badge: 'อ.',
        color: 'bg-amber-600'
      }
    ],
    boardTitle: 'ยินดีต้อนรับสู่ห้อง ม.3/6',
    boardSubtitle: 'ขอให้นักเรียนเลือกเก้าอี้ตามประสงค์',
    isSmartboard: false,
    showNamesOnDesks: true
  };
}

// In-memory state cached from file
let appState = null;

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      appState = JSON.parse(content);
      // Ensure admin exists
      if (!appState.users || !appState.users.some(u => u.username === 'admin')) {
        appState.users = appState.users || [];
        appState.users.unshift({
          id: 'admin_usr',
          username: 'admin',
          password: 'admin123',
          name: 'อาจารย์ผู้ดูแลระบบ (Admin)',
          nickname: 'อาจารย์',
          studentId: 'ADMIN-01',
          role: 'admin',
          badge: 'อ.',
          color: 'bg-amber-600'
        });
      }
      return;
    }
  } catch (err) {
    console.error('Error loading data.json:', err);
  }
  appState = getInitialState();
  saveState();
}

function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data.json:', err);
  }
}

loadState();

// Connected Server-Sent Events (SSE) clients for real-time live sync
const sseClients = [];

function broadcastUpdate() {
  const data = `data: ${JSON.stringify(appState)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(data);
    } catch (e) {
      sseClients.splice(i, 1);
    }
  }
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Server-Sent Events (SSE) for Real-time push to all devices
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify(appState)}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // 2. Network Info (For Mobile QR Code)
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      localIp: LOCAL_IP,
      port: PORT,
      mobileUrl: `http://${LOCAL_IP}:${PORT}`,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(`http://${LOCAL_IP}:${PORT}`)}`
    }));
    return;
  }

  // 3. Get Current Shared State
  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(appState));
    return;
  }

  // 4. Update / Sync Shared State
  if (pathname === '/api/sync' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (body) {
      if (body.seats) appState.seats = body.seats;
      if (body.users) appState.users = body.users;
      if (body.boardTitle !== undefined) appState.boardTitle = body.boardTitle;
      if (body.boardSubtitle !== undefined) appState.boardSubtitle = body.boardSubtitle;
      if (body.isSmartboard !== undefined) appState.isSmartboard = body.isSmartboard;
      if (body.showNamesOnDesks !== undefined) appState.showNamesOnDesks = body.showNamesOnDesks;
      saveState();
      broadcastUpdate();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', state: appState }));
    return;
  }

  // 5. Serve Static Frontend Files
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================================`);
  console.log(`🏫 ระบบเลือกที่นั่งในห้องเรียน ม.3/6 กำลังทำงาน!`);
  console.log(`💻 เข้าใช้งานบนคอมพิวเตอร์:   http://localhost:${PORT}`);
  console.log(`📱 เข้าใช้งานบนมือถือ (Wi-Fi): http://${LOCAL_IP}:${PORT}`);
  console.log(`🔐 บัญชีแอดมิน: admin / admin123`);
  console.log(`=============================================================\n`);
});
