// Wrapper to handle ESM imports in CommonJS context (for Vercel)
// This allows better-auth to be imported dynamically

let authInstance: any = null;

export async function getAuth() {
  if (!authInstance) {
    // Dynamic import for ESM module
    const { auth } = await import('./auth.js');
    authInstance = auth;
  }
  return authInstance;
}

// Also export a synchronous getter that returns a promise
export const auth = new Proxy({} as any, {
  get(_target, prop) {
    return async (...args: any[]) => {
      const auth = await getAuth();
      const value = (auth as any)[prop];
      if (typeof value === 'function') {
        return value.apply(auth, args);
      }
      return value;
    };
  }
});

