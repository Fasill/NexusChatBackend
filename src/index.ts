import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { auth } from './auth.js';
import { toNodeHandler } from "better-auth/node";
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import aiRoutes from './routes/ai.js';
import { initializeSocket } from './socket.js';
import { setSocketInstance } from './socketInstance.js';
import cors from 'cors';

// Load .env file from backend directory (relative to compiled output)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Debug: Log if OpenAI key is loaded (without showing the actual key)
const apiKey = process.env.OPENAI_API_KEY;
console.log('🔑 OpenAI API Key loaded:', apiKey ? `Yes (${apiKey.substring(0, 10)}...)` : 'NO ❌');
console.log('🔑 OpenAI API Key length:', apiKey?.length || 0);
if (apiKey) {
  // Check for common issues
  if (apiKey.startsWith('"') || apiKey.endsWith('"')) {
    console.warn('⚠️  WARNING: API key appears to have quotes around it!');
  }
  if (apiKey.includes(' ')) {
    console.warn('⚠️  WARNING: API key contains spaces!');
  }
}

const app = express();
const httpServer = createServer(app);
// Socket.IO CORS configuration - simple and permissive like working version
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3001;

// Set socket instance for use in routes
setSocketInstance(io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add logging middleware for Better Auth requests
app.use("/api/auth/*", (req, res, next) => {
  console.log('\n========================================');
  console.log('=== BETTER AUTH REQUEST DEBUG ===');
  console.log('========================================');
  console.log('🌍 Origin:', req.headers.origin);
  console.log('🛣️  Path:', req.path);
  console.log('📝 Method:', req.method);
  console.log('📦 Request Body:', req.body ? JSON.stringify(req.body, null, 2) : 'EMPTY');
  console.log('📋 Content-Type:', req.headers['content-type'] || 'N/A');
  console.log('🍪 Cookie Header:', req.headers.cookie ? 'PRESENT ✅' : 'MISSING ❌');
  if (req.headers.cookie) {
    console.log('🍪 Cookie Content:', req.headers.cookie);
  }
  console.log('🔐 Authorization:', req.headers.authorization ? 'PRESENT ✅' : 'MISSING ❌');
  console.log('🌐 Referer:', req.headers.referer || 'N/A');
  console.log('📋 ENVIRONMENT:');
  console.log('   NODE_ENV:', process.env.NODE_ENV);
  console.log('   BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL);
  console.log('   FRONTEND_URL:', process.env.FRONTEND_URL);
  console.log('========================================\n');
  
  // Intercept response to log what's being sent back
  const originalSend = res.send;
  res.send = function(data) {
    console.log('\n========================================');
    console.log('=== BETTER AUTH RESPONSE DEBUG ===');
    console.log('========================================');
    console.log('📤 Status:', res.statusCode);
    console.log('📤 Headers being sent:');
    console.log('   Set-Cookie:', res.getHeader('set-cookie') || 'NONE ❌');
    console.log('   Access-Control-Allow-Origin:', res.getHeader('access-control-allow-origin') || 'NONE');
    console.log('   Access-Control-Allow-Credentials:', res.getHeader('access-control-allow-credentials') || 'NONE');
    if (res.statusCode >= 400) {
      console.log('📤 Error Response Body:', typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200));
    }
    console.log('========================================\n');
    return originalSend.call(this, data);
  };
  
  next();
});

// Setup Better Auth handler
app.all("/api/auth/*", toNodeHandler(auth));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    res.json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      hint: 'Check your DATABASE_URL in .env file and ensure Neon database is active'
    });
  }
});

// Initialize Socket.IO
initializeSocket(io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

