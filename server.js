// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configure multer to save uploaded files to /uploads folder
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max file size
});

const { startCleanupJob } = require('./cleanup');

startCleanupJob();

// Serve static files from public and uploads directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory rooms storage: room code -> list of WebSocket clients
const rooms = {};

// Generate a random 5-letter uppercase room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// API endpoint to create a new room code
app.get('/api/create-room', (req, res) => {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms[code]); // Ensure unique code

  rooms[code] = [];
  res.json({ roomCode: code });
});

// API endpoint to handle file uploads
app.post('/api/upload', upload.single('file'), (req, res) => {
  const room = req.body.room;
  if (!room || !rooms[room]) {
    return res.status(400).json({ success: false, error: 'Invalid or missing room code' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  // Build public URL for the uploaded file
  const fileUrl = `/uploads/${req.file.filename}`;

  // Broadcast file info to all clients in the room
  rooms[room].forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'file',
        fileName: req.file.originalname,
        fileUrl
      }));
    }
  });

  res.json({ success: true });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join' && data.room) {
        currentRoom = data.room;

        if (!rooms[currentRoom]) {
          rooms[currentRoom] = [];
        }

        rooms[currentRoom].push(ws);
      }
      else if (data.type === 'text' && currentRoom && rooms[currentRoom]) {
        // Broadcast text message to all other clients in the same room
        rooms[currentRoom].forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'text', text: data.text }));
          }
        });
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(client => client !== ws);

      // Remove room if empty
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

// Ensure the uploads directory exists before starting the server
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
