import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import OpenAI from 'openai';
import bcrypt from 'bcryptjs';
import { getSocketInstance } from '../socketInstance';

const router = express.Router();
const prisma = new PrismaClient();

// Trim whitespace and remove quotes from API key
const apiKey = process.env.OPENAI_API_KEY?.trim().replace(/^["']|["']$/g, '');
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY is not set in environment variables');
}

const openai = new OpenAI({
  apiKey: apiKey,
});

const aiMessageSchema = z.object({
  content: z.string().min(1),
  chatSessionId: z.string().optional(),
});

// Special AI user ID constant
const AI_USER_ID = 'ai-assistant';

// Get or create AI chat session
router.post('/session', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;

    // Check if AI user exists, if not create it
    let aiUser = await prisma.user.findUnique({
      where: { id: AI_USER_ID },
    });

    if (!aiUser) {
      // Create AI user with a dummy password (never used for login)
      const hashedPassword = await bcrypt.hash('ai-user-no-login', 10);
      
      await prisma.user.create({
        data: {
          id: AI_USER_ID,
          email: 'ai@assistant.com',
          name: 'AI Assistant',
          password: hashedPassword,
          emailVerified: false,
          picture: 'https://ui-avatars.com/api/?name=AI&background=6366f1&color=fff',
        },
      });
      
      // Fetch the created user
      aiUser = await prisma.user.findUnique({
        where: { id: AI_USER_ID },
      });
    }

    // Check if session exists
    let session = await prisma.chatSession.findFirst({
      where: {
        OR: [
          { participant1Id: currentUserId, participant2Id: AI_USER_ID },
          { participant1Id: AI_USER_ID, participant2Id: currentUserId },
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
          participant2Id: AI_USER_ID,
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
    console.error('Get/create AI session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message to AI
router.post('/message', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { content, chatSessionId } = aiMessageSchema.parse(req.body);

    if (!chatSessionId) {
      return res.status(400).json({ error: 'Chat session ID required' });
    }

    // Verify session belongs to user and is with AI
    const session = await prisma.chatSession.findFirst({
      where: {
        id: chatSessionId,
        OR: [
          { participant1Id: currentUserId, participant2Id: AI_USER_ID },
          { participant1Id: AI_USER_ID, participant2Id: currentUserId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'AI chat session not found' });
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        content,
        senderId: currentUserId,
        receiverId: AI_USER_ID,
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

    // Get conversation history for context
    const conversationHistory = await prisma.message.findMany({
      where: { chatSessionId },
      orderBy: { createdAt: 'asc' },
      take: 10, // Last 10 messages for context
    });

    // Build messages array for OpenAI
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = conversationHistory.map((msg) => ({
      role: (msg.senderId === AI_USER_ID ? 'assistant' : 'user') as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add current message
    messages.push({
      role: 'user' as const,
      content,
    });

    // Call OpenAI API
    if (!openai.apiKey) {
      console.error('❌ OpenAI API key is not configured');
      return res.status(500).json({ 
        error: 'AI service is not configured. Please check your OpenAI API key.' 
      });
    }

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Be concise and friendly in your responses.',
          },
          ...messages,
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      return res.status(500).json({ 
        error: error.message || 'Failed to generate AI response. Please check your OpenAI API key.' 
      });
    }

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Save AI response
    const aiMessage = await prisma.message.create({
      data: {
        content: aiResponse,
        senderId: AI_USER_ID,
        receiverId: currentUserId,
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

    // Update session
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { updatedAt: new Date() },
    });

    // Emit messages via socket
    const io = getSocketInstance();
    if (io && io.sockets) {
      // Find user's socket
      const userSocket = Array.from(io.sockets.sockets.values())
        .find((socket: any) => socket.userId === currentUserId) as any;
      
      if (userSocket && userSocket.emit) {
        userSocket.emit('new-message', userMessage);
        userSocket.emit('new-message', aiMessage);
      }
    }

    res.json({
      userMessage,
      aiMessage,
    });
  } catch (error) {
    console.error('AI message error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

export default router;

