import express from 'express';
import { auth } from '../auth';

export interface BetterAuthRequest extends express.Request {
  user?: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Middleware to check if user is authenticated via Better Auth session
 */
export async function requireBetterAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: req.headers as any
    });

    if (!session || !session.user || !session.session) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Attach user and session to request
    (req as BetterAuthRequest).user = session.user as any;
    (req as BetterAuthRequest).session = session.session as any;

    next();
  } catch (error) {
    console.error('Better Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid session' 
    });
  }
}

/**
 * Optional middleware - attaches user if authenticated, but doesn't require it
 */
export async function optionalBetterAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any
    });

    if (session && session.user && session.session) {
      (req as BetterAuthRequest).user = session.user as any;
      (req as BetterAuthRequest).session = session.session as any;
    }
  } catch (error) {
    // Silently fail for optional auth
    console.log('Optional auth failed:', error);
  }

  next();
}

// Keep backward compatibility
export interface AuthRequest extends BetterAuthRequest {
  userId?: string;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });
    
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    req.userId = session.user.id;
    req.user = session.user as any;
    req.session = session.session as any;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json({ error: 'Invalid or expired session' });
  }
};

