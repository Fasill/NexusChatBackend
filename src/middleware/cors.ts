import { Request, Response, NextFunction } from 'express';

/**
 * CORS middleware to allow cross-origin requests from the frontend
 * Supports dynamic Vercel deployment URLs and custom domains
 */
export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Get the frontend origin from environment variables, or use defaults during development
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
    : [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5000",
      ];
  
  const origin = req.headers.origin;
  let allowedOrigin: string | undefined;
  
  // Check if the request origin is in our list of allowed origins
  if (origin && allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else {
    // Allow any localhost origin during development
    if (origin && origin.startsWith('http://localhost:')) {
      allowedOrigin = origin;
    }
    // Allow any Vercel deployment URL (*.vercel.app)
    else if (origin && origin.endsWith('.vercel.app')) {
      allowedOrigin = origin;
    }
    // Allow any custom domain if FRONTEND_URL is set and matches
    else if (origin && process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      allowedOrigin = origin;
    }
  }
  
  // Set CORS headers
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else if (origin) {
    // Log blocked origins for debugging (both dev and prod)
    console.log(`⚠️  CORS: Blocked origin: ${origin}`);
    console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
  }
  
  // Allow credentials (cookies, authorization headers, etc.)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Allow specific headers
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Allow specific HTTP methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

