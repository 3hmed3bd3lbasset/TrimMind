import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt.js';

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

  // Socket Authentication & Identity Handshake Middleware
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1] ||
        (socket.handshake.headers?.cookie &&
          socket.handshake.headers.cookie
            .split(';')
            .find((c) => c.trim().startsWith('access_token=') || c.trim().startsWith('auth_token='))
            ?.split('=')[1]);

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
          socket.data.user = decoded;
        } catch {
          // Non-blocking: Unauthenticated client connects as guest (for public display screen)
          socket.data.user = null;
        }
      }
    } catch {}
    next();
  });

  io.on('connection', (socket: Socket) => {
    // Join branch room (Authenticated staff or display screens)
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

    // Public TV display queue board room
    socket.on('join_display', (branchId: string) => {
      if (branchId) {
        socket.join(`display_${branchId}`);
      }
    });
  });

  console.log('⚡ Socket.io Realtime WebSockets Server initialized with Handshake Guard.');
  return io;
}

export function broadcastToBranch(branchId: string, event: string, data?: any) {
  if (io) {
    // Full event to staff branch room
    io.to(`branch_${branchId}`).emit(event, data);

    // Sanitized PII event to public TV display
    const sanitizedData = data
      ? {
          ...data,
          customerPhone: undefined,
          phone: undefined,
          totalPrice: undefined,
          price: undefined,
        }
      : data;
    io.to(`display_${branchId}`).emit(event, sanitizedData);
  }
}

export function broadcastGlobal(event: string, data?: any) {
  if (io) {
    io.emit(event, data);
  }
}
