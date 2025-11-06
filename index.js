const { WebSocketServer } = require('ws');

// The PORT environment variable provided by the hosting service
// The default port 8080 was added for local testing
const port = process.env.PORT || 8080;

// The WebSocket server listens for connections.
// After it connected to a client, it maintains a persistent, bidirectional communication channel over a single TCP connection.
// Unlike the traditional request-response model of HTTP, WebSockets allow the server to send data to the client at any time.
// That means, the client does not have to request the data first, making them ideal for real-time applications.
const wss = new WebSocketServer({ port: port });

console.log(`WebRTC Handshake server started on port ${port}`);

wss.on('connection', ws => {
  console.log('Client connected');

  ws.on('message', message => {
    // Each message is received as raw binary data.
    // It has to be converted to string for proper logging.
    // Note, the WebRTC signaling messages (SDP offers/answers, ICE candidates) are defined as JSON
    console.log('Received: %s', message);

    // Each received message is broadcasted directly to all other clients.
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', error => {
    console.error('WebSocket error:', error);
  });
});