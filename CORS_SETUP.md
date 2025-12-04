# CORS Configuration Guide

This guide explains how to configure CORS for production deployment.

## Environment Variables

### Required for Production

1. **`BETTER_AUTH_URL`** - Your backend URL (where Better Auth API is hosted)
   - Example: `https://your-backend.railway.app` or `https://api.yourdomain.com`
   - This must be the full URL where your backend is deployed

2. **`FRONTEND_URL`** - Your frontend URL
   - Example: `https://your-app.vercel.app` or `https://yourdomain.com`
   - This is used for CORS and redirects

3. **`ALLOWED_ORIGINS`** - Comma-separated list of allowed frontend origins
   - Example: `https://your-app.vercel.app,https://yourdomain.com`
   - **Note**: Any `*.vercel.app` URL is automatically allowed, so you don't need to list all preview deployments
   - Include your production domain and any custom domains

4. **`TRUSTED_ORIGINS`** - Comma-separated list for Better Auth trusted origins
   - Should match `ALLOWED_ORIGINS` or be a subset
   - Example: `https://your-app.vercel.app,https://yourdomain.com`

## Automatic CORS Support

The CORS middleware automatically allows:
- ✅ Any `http://localhost:*` origin (development)
- ✅ Any `*.vercel.app` origin (Vercel deployments)
- ✅ Origins listed in `ALLOWED_ORIGINS`
- ✅ Origin matching `FRONTEND_URL`

## Example Production .env

```env
# Backend URL (where your API is hosted)
BETTER_AUTH_URL=https://your-backend.railway.app

# Frontend URL
FRONTEND_URL=https://your-app.vercel.app

# Allowed Origins (comma-separated)
ALLOWED_ORIGINS=https://your-app.vercel.app,https://yourdomain.com

# Trusted Origins for Better Auth (should match or be subset of ALLOWED_ORIGINS)
TRUSTED_ORIGINS=https://your-app.vercel.app,https://yourdomain.com

# Other required variables
BETTER_AUTH_SECRET=your-secret-key-here
DATABASE_URL=your-database-url
NODE_ENV=production
```

## Troubleshooting CORS Issues

### If you see CORS errors:

1. **Check your environment variables** in your deployment platform (Vercel, Railway, etc.)
   - Make sure `BETTER_AUTH_URL` is set to your backend URL
   - Make sure `FRONTEND_URL` is set to your frontend URL
   - Make sure `ALLOWED_ORIGINS` includes your frontend URL

2. **Check the backend logs** - The CORS middleware logs blocked origins:
   ```
   ⚠️  CORS: Blocked origin: https://some-url.com
      Allowed origins: https://your-app.vercel.app
      FRONTEND_URL: https://your-app.vercel.app
   ```

3. **For Vercel deployments**:
   - Preview deployments (e.g., `your-app-git-branch.vercel.app`) are automatically allowed
   - Production deployments need to be in `ALLOWED_ORIGINS` or match `FRONTEND_URL`

4. **For custom domains**:
   - Add them to `ALLOWED_ORIGINS`
   - Add them to `TRUSTED_ORIGINS`
   - Make sure `FRONTEND_URL` matches your custom domain

## Socket.IO CORS

Socket.IO uses the same CORS logic as the HTTP middleware, so the same environment variables apply.

## Better Auth Cookie Settings

The cookie settings in `src/auth.ts` are automatically configured based on:
- `BETTER_AUTH_URL` - If it starts with `https://`, cookies will be secure
- `NODE_ENV` - If `production`, cookies will be secure
- `sameSite` - Set to `"lax"` for localhost, `"none"` for production (cross-domain)

Make sure `BETTER_AUTH_URL` is correctly set for production to ensure secure cookies work properly.

