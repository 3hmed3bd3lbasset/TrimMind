import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer, clientUrl: string) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [clientUrl, 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  io.on('connection', (socket: Socket) => {
    // Join branch room for branch-specific live updates
    socket.on('join_branch', (branchId: string) => {
      if (branchId) {
        socket.join(`branch_${branchId}`);
      }
    });

    socket.on('leave_branch', (branchId: string) => {
      if (branchId) {
        socket.leave(`branch_${branchId}`);
      }
    });

    // Join TV display board
    socket.on('join_display', (branchId: string) => {
      socket.join(`display_${branchId}`);
    });
  });

  console.log('⚡ Socket.io Realtime WebSockets Server initialized.');
  return io;
}

export function broadcastToBranch(branchId: string, event: string, data?: any) {
  if (io) {
    io.to(`branch_${branchId}`).emit(event, data);
    io.to(`display_${branchId}`).emit(event, data);
  }
}

export function broadcastGlobal(event: string, data?: any) {
  if (io) {
    io.emit(event, data);
  }
}
