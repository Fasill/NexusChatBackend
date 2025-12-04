import { Server, Socket } from 'socket.io';
import { auth } from './auth.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SocketUser {
  userId: string;
  socketId: string;
}

const onlineUsers = new Map<string, string>(); // userId -> socketId

export const initializeSocket = (io: Server) => {
  io.use(async (socket, next) => {
    try {
      // Better Auth uses cookies, but we can also accept token in handshake for Socket.IO
      const token = socket.handshake.auth.token;
      const cookies = socket.handshake.headers.cookie;

      // Try to get session from Better Auth
      const session = await auth.api.getSession({
        headers: {
          cookie: cookies || '',
          authorization: token ? `Bearer ${token}` : '',
        } as any,
      });

      if (!session || !session.user) {
        return next(new Error('Authentication error'));
      }

      (socket as any).userId = session.user.id;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
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

