import { Server, Socket } from 'socket.io';
import { getAuth } from './auth-wrapper.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SocketUser {
  userId: string;
  socketId: string;
}

const onlineUsers = new Map<string, string>(); // userId -> socketId

export const initializeSocket = (io: Server) => {
  console.log("🔌 Initializing Socket.IO handlers...");
  
  // Log all connection attempts
  io.engine.on("connection", (socket) => {
    console.log("🔌 Socket.IO engine connection attempt");
  });
  
  io.use(async (socket, next) => {
    console.log("🔐 Socket middleware triggered - handshake received");
    console.log("🔐 Handshake details:", {
      url: socket.handshake.url,
      query: socket.handshake.query,
      headers: {
        cookie: socket.handshake.headers.cookie ? 'PRESENT' : 'MISSING',
        origin: socket.handshake.headers.origin,
      },
    });
    try {
      // Better Auth uses cookies, but we can also accept token in handshake for Socket.IO
      const token = socket.handshake.auth.token;
      const cookies = socket.handshake.headers.cookie;

      console.log('🔐 Socket auth attempt:', {
        hasCookies: !!cookies,
        hasToken: !!token,
        origin: socket.handshake.headers.origin,
        cookieHeader: cookies ? cookies.substring(0, 100) + '...' : 'none',
      });

      // If no cookies and no token, reject immediately
      if (!cookies && !token) {
        console.error('❌ Socket auth failed: No cookies or token');
        return next(new Error('Authentication required'));
      }

      // Try to get session from Better Auth
      const auth = await getAuth();
      
      // Build headers for session check
      const headers: any = {
        origin: socket.handshake.headers.origin || '',
        referer: socket.handshake.headers.referer || '',
      };
      
      if (cookies) {
        headers.cookie = cookies;
      }
      
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }

      const session = await auth.api.getSession({
        headers,
      });

      if (!session || !session.user) {
        console.error('❌ Socket auth failed: No session or user');
        console.error('Session check result:', session);
        return next(new Error('Authentication error'));
      }

      console.log('✅ Socket authenticated for user:', session.user.id);
      (socket as any).userId = session.user.id;
      next();
    } catch (error: any) {
      console.error('❌ Socket authentication error:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      return next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket: Socket & { userId?: string }) => {
    const userId = socket.userId!;
    onlineUsers.set(userId, socket.id);

    console.log(`User ${userId} connected`);

    // Notify others that this user is online
    socket.broadcast.emit('user-online', { userId });

    // Send current online users to the newly connected user
    socket.emit('online-users', Array.from(onlineUsers.keys()));

    // Handle joining a chat room
    socket.on('join-chat', async (sessionId: string) => {
      socket.join(`chat:${sessionId}`);
      console.log(`User ${userId} joined chat ${sessionId}`);
    });

    // Handle leaving a chat room
    socket.on('leave-chat', (sessionId: string) => {
      socket.leave(`chat:${sessionId}`);
      console.log(`User ${userId} left chat ${sessionId}`);
    });

    // Handle sending a message
    socket.on('send-message', async (data: {
      content: string;
      receiverId: string;
      chatSessionId: string;
    }) => {
      try {
        const { content, receiverId, chatSessionId } = data;

        // Save message to database
        const message = await prisma.message.create({
          data: {
            content,
            senderId: userId,
            receiverId,
            chatSessionId,
          },
          include: {
            sender: {
              select: { id: true, name: true, picture: true },
            },
            receiver: {
              select: { id: true, name: true, picture: true },
            },
          },
        });

        // Update session updatedAt
        await prisma.chatSession.update({
          where: { id: chatSessionId },
          data: { updatedAt: new Date() },
        });

        // Add readAt field (null for new messages)
        const messageWithRead = { ...message, readAt: null };

        // Emit to all users in the chat room
        io.to(`chat:${chatSessionId}`).emit('new-message', messageWithRead);

        // Also emit directly to receiver to ensure they get it (frontend handles deduplication)
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('new-message', messageWithRead);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data: { sessionId: string; isTyping: boolean }) => {
      socket.to(`chat:${data.sessionId}`).emit('user-typing', {
        userId,
        isTyping: data.isTyping,
      });
    });

    // Handle read receipts
    socket.on('mark-read', async (data: { sessionId: string; messageIds: string[] }) => {
      try {
        const { sessionId, messageIds } = data;
        
        // Verify user is part of this session
        const session = await prisma.chatSession.findFirst({
          where: {
            id: sessionId,
            OR: [
              { participant1Id: userId },
              { participant2Id: userId },
            ],
          },
        });

        if (!session) {
          return;
        }

        // Mark messages as read
        await prisma.message.updateMany({
          where: {
            id: { in: messageIds },
            receiverId: userId,
            readAt: null,
          },
          data: {
            readAt: new Date(),
          },
        });

        // Notify sender that messages were read
        const senderId = session.participant1Id === userId 
          ? session.participant2Id 
          : session.participant1Id;
        
        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messages-read', {
            sessionId,
            messageIds,
          });
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit('user-offline', { userId });
      console.log(`User ${userId} disconnected`);
    });
  });
};

