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
  
  // Allow handshake to complete, authenticate after connection
  io.use(async (socket, next) => {
    // Skip auth for Socket.IO handshake path - allow connection first
    if (socket.handshake.url === "/socket.io/" || socket.handshake.url?.includes("/socket.io/")) {
      console.log("🔌 Allowing Socket.IO handshake");
      return next();
    }
    next();
  });

  io.on('connection', async (socket: Socket & { userId?: string }) => {
    console.log(`🔌 Socket connection attempt: ${socket.id}`);
    
    // Authenticate after connection
    try {
      const cookies = socket.handshake.headers.cookie;
      const token = socket.handshake.auth.token;

      if (!cookies && !token) {
        console.error('❌ Socket auth failed: No cookies or token');
        socket.emit('auth_error', { message: 'Authentication required' });
        socket.disconnect();
        return;
      }

      // Try to get session from Better Auth
      const auth = await getAuth();
      
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
        socket.emit('auth_error', { message: 'Invalid session' });
        socket.disconnect();
        return;
      }

      console.log('✅ Socket authenticated for user:', session.user.id);
      socket.userId = session.user.id;
    } catch (error: any) {
      console.error('❌ Socket authentication error:', error);
      socket.emit('auth_error', { message: 'Authentication failed' });
      socket.disconnect();
      return;
    }

    const userId = socket.userId!;
    onlineUsers.set(userId, socket.id);

    console.log(`✅ User ${userId} connected`);

    // Notify others that this user is online
    socket.broadcast.emit('user-online', { userId });

    // Send current online users to the newly connected user
    socket.emit('online-users', Array.from(onlineUsers.keys()));

    // Handle joining a chat room
    socket.on('join-chat', async (sessionId: string) => {
      try {
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
          socket.emit('error', { message: 'Chat session not found' });
          return;
        }

        socket.join(`chat:${sessionId}`);
        console.log(`User ${userId} joined chat ${sessionId}`);
      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
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
      chatSessionId?: string;
    }) => {
      try {
        const { content, receiverId, chatSessionId } = data;

        if (!content || !content.trim()) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        // Get or create chat session
        let session = await prisma.chatSession.findFirst({
          where: chatSessionId
            ? { id: chatSessionId }
            : {
                OR: [
                  { participant1Id: userId, participant2Id: receiverId },
                  { participant1Id: receiverId, participant2Id: userId },
                ],
              },
        });

        if (!session) {
          // Create new session
          session = await prisma.chatSession.create({
            data: {
              participant1Id: userId,
              participant2Id: receiverId,
            },
          });
        } else {
          // Verify user is part of this session
          if (session.participant1Id !== userId && session.participant2Id !== userId) {
            socket.emit('error', { message: 'You are not part of this chat session' });
            return;
          }
        }

        // Save message to database
        const message = await prisma.message.create({
          data: {
            content: content.trim(),
            senderId: userId,
            receiverId,
            chatSessionId: session.id,
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
          where: { id: session.id },
          data: { updatedAt: new Date() },
        });

        // Add readAt field (null for new messages)
        const messageWithRead = { ...message, readAt: null };

        // Emit to all users in the chat room
        io.to(`chat:${session.id}`).emit('new-message', messageWithRead);

        // Also emit notification to receiver if not in the chat room
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          const receiverSocket = io.sockets.sockets.get(receiverSocketId);
          if (receiverSocket && !receiverSocket.rooms.has(`chat:${session.id}`)) {
            receiverSocket.emit('message-notification', {
              sessionId: session.id,
              message: messageWithRead,
            });
          }
        }

        // Confirm to sender
        socket.emit('message-sent', { messageId: message.id });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
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

