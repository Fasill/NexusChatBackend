import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

const createMessageSchema = z.object({
  content: z.string().min(1),
  receiverId: z.string(),
  chatSessionId: z.string().optional(),
});

// Get or create chat session
router.post('/session', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { participant2Id } = req.body;

    if (!participant2Id || participant2Id === currentUserId) {
      return res.status(400).json({ error: 'Invalid participant' });
    }

    // Check if session exists
    let session = await prisma.chatSession.findFirst({
      where: {
        OR: [
          { participant1Id: currentUserId, participant2Id },
          { participant1Id: participant2Id, participant2Id: currentUserId },
        ],
      },
      include: {
        participant1: {
          select: { id: true, name: true, picture: true, email: true },
        },
        participant2: {
          select: { id: true, name: true, picture: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, name: true, picture: true },
            },
            receiver: {
              select: { id: true, name: true, picture: true },
            },
          },
        },
      },
    });

    // Create session if it doesn't exist
    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          participant1Id: currentUserId,
          participant2Id,
        },
        include: {
          participant1: {
            select: { id: true, name: true, picture: true, email: true },
          },
          participant2: {
            select: { id: true, name: true, picture: true, email: true },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              sender: {
                select: { id: true, name: true, picture: true },
              },
              receiver: {
                select: { id: true, name: true, picture: true },
              },
            },
          },
        },
      });
    }

    res.json(session);
  } catch (error) {
    console.error('Get/create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat sessions for current user
router.get('/sessions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;

    const sessions = await prisma.chatSession.findMany({
      where: {
        OR: [
          { participant1Id: currentUserId },
          { participant2Id: currentUserId },
        ],
      },
      include: {
        participant1: {
          select: { id: true, name: true, picture: true, email: true },
        },
        participant2: {
          select: { id: true, name: true, picture: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a session
router.get('/session/:sessionId/messages', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { sessionId } = req.params;

    // Verify user is part of this session
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { participant1Id: currentUserId },
          { participant2Id: currentUserId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await prisma.message.findMany({
      where: { chatSessionId: sessionId },
      include: {
        sender: {
          select: { id: true, name: true, picture: true },
        },
        receiver: {
          select: { id: true, name: true, picture: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark messages as read
router.post('/session/:sessionId/read', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { sessionId } = req.params;

    // Verify user is part of this session
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { participant1Id: currentUserId },
          { participant2Id: currentUserId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Mark all unread messages as read
    const result = await prisma.message.updateMany({
      where: {
        chatSessionId: sessionId,
        receiverId: currentUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    // Get updated messages to emit via socket
    const updatedMessages = await prisma.message.findMany({
      where: {
        chatSessionId: sessionId,
        receiverId: currentUserId,
        readAt: { not: null },
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

    // Emit read receipts via socket
    const { getSocketInstance } = require('../socketInstance');
    const io = getSocketInstance();
    if (io && io.sockets) {
      // Notify sender that messages were read
      const senderId = session.participant1Id === currentUserId 
        ? session.participant2Id 
        : session.participant1Id;
      
      const senderSocket = Array.from(io.sockets.sockets.values())
        .find((socket: any) => socket.userId === senderId) as any;
      
      if (senderSocket && senderSocket.emit) {
        senderSocket.emit('messages-read', {
          sessionId,
          messageIds: updatedMessages.map(m => m.id),
        });
      }
    }

    res.json({ count: result.count, messages: updatedMessages });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

