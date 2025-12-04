# Database Connection Fix

The error indicates the database server can't be reached. Here are solutions:

## Issue
`Can't reach database server at ep-soft-band-ah87y6e6-pooler.c-3.us-east-1.aws.neon.tech:5432`

## Solutions

### 1. Check your `.env` file in backend directory

Make sure your `.env` has the correct DATABASE_URL:

```env
DATABASE_URL="postgresql://neondb_owner:npg_EsioDMafc6V0@ep-soft-band-ah87y6e6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

**Note:** Removed `channel_binding=require` as it can cause connection issues.

### 2. Neon Database might be sleeping

Neon databases pause after inactivity. To wake it up:
- Visit your Neon dashboard
- The database should auto-wake on first connection
- Or manually resume it from the dashboard

### 3. Try the direct connection (non-pooler)

If pooler doesn't work, try the direct connection string from your Neon dashboard:
```env
DATABASE_URL="postgresql://neondb_owner:npg_EsioDMafc6V0@ep-soft-band-ah87y6e6.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

### 4. Add connection pool settings

Update your `.env`:
```env
DATABASE_URL="postgresql://neondb_owner:npg_EsioDMafc6V0@ep-soft-band-ah87y6e6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=10&pool_timeout=10"
```

### 5. Test the connection

Try connecting with psql:
```bash
psql "postgresql://neondb_owner:npg_EsioDMafc6V0@ep-soft-band-ah87y6e6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

### 6. Check Prisma connection

```bash
cd backend
npx prisma db pull
```

This will test the connection and show any errors.

## Most Common Fix

Usually it's the `channel_binding=require` parameter. Update your `.env`:

```env
DATABASE_URL="postgresql://neondb_owner:npg_EsioDMafc6V0@ep-soft-band-ah87y6e6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

Then restart your backend server.

