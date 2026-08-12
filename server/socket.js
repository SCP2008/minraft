const { Server } = require('socket.io');

function attachSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin || '*' },
  });

  io.on('connection', (socket) => {
    socket.emit('connected');
  });

  return io;
}

module.exports = { attachSocket };
