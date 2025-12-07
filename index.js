const { WebSocketServer } = require('ws');
const express = require('express');
const http = require('http');
const url = require('url');

// The PORT environment variable provided by the hosting service
// The default port 8080 was added for local testing
const port = process.env.PORT || 8080;

// --- Room and Client Management (Simplified) ---
const rooms = {};

function generateClientId() {
    return Math.random().toString(36).substring(2, 10);
}

// --- HTTP Server Setup (using Express) ---
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// Handle the initial join request from the ESP32
app.post('/join/:roomId', (req, res) => {
    const { roomId } = req.params;
    console.log(`Client joining room: ${roomId}`);

    const clientId = generateClientId();
    let isInitiator = false;

    if (!rooms[roomId]) {
        // First client in the room
        rooms[roomId] = { clients: new Set() };
        isInitiator = false; // The ESP32 is the first, so it waits for the web client
        console.log(`Room ${roomId} created. Client ${clientId} is not initiator.`);
    } else {
        // Second client joins
        isInitiator = true;
        console.log(`Room ${roomId} exists. Client ${clientId} is initiator.`);
    }
    
    // The ESP32 client expects a specific JSON response
    const response = {
        result: 'SUCCESS',
        params: {
            client_id: clientId,
            is_initiator: String(isInitiator),
            room_id: roomId,
            // These URLs should point to your server
            wss_url: `wss://${req.get('host')}`, // WebSocket URL
            wss_post_url: `https://${req.get('host')}`,
            ice_server_url: `https://${req.get('host')}/ice` // Dummy ICE server URL
        }
    };

    // Store client info temporarily to associate with WebSocket connection later
    if (!rooms[roomId].pendingClients) {
        rooms[roomId].pendingClients = {};
    }
    rooms[roomId].pendingClients[clientId] = { id: clientId };

    res.json(response);
});

// endpoint for ICE server requests
app.post('/ice', (_req, res) => {
    console.log('ICE server request received');
    res.json({
        iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302',
            },
            // You can add more STUN/TURN servers here if needed
        ],
    });
});

// --- WebSocket Server Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('Client connected via WebSocket');
    
    ws.on('message', message => {
        const msgStr = message.toString();
        console.log('Received: %s', msgStr);
        let data;
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            console.error("Failed to parse message as JSON:", msgStr);
            return;
        }

        // Handle the 'register' command
        if (data.cmd === 'register') {
            const { roomid, clientid } = data;
            if (rooms[roomid] && rooms[roomid].pendingClients[clientid]) {
                console.log(`Registering client ${clientid} to room ${roomid}`);
                ws.roomId = roomid;
                ws.clientId = clientid;
                rooms[roomid].clients.add(ws);
                delete rooms[roomid].pendingClients[clientid];
                return; // Don't broadcast the register message
            } else {
                console.error(`Registration failed for client ${clientid} in room ${roomid}`);
                ws.close();
                return;
            }
        }

        // Broadcast other messages to the other client in the same room
        if (ws.roomId && rooms[ws.roomId]) {
            rooms[ws.roomId].clients.forEach(client => {
                if (client !== ws && client.readyState === ws.OPEN) {
                    client.send(message);
                }
            });
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.clientId} disconnected`);
        if (ws.roomId && rooms[ws.roomId]) {
            rooms[ws.roomId].clients.delete(ws);
            if (rooms[ws.roomId].clients.size === 0) {
                console.log(`Room ${ws.roomId} is now empty. Deleting.`);
                delete rooms[ws.roomId];
            }
        }
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

server.listen(port, () => {
    console.log(`WebRTC Handshake server (HTTP + WebSocket) started on port ${port}`);
});