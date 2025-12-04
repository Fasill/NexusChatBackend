# NexusChatBackend

Backend server for NexusChat - A real-time chat application with AI assistant capabilities.

## Features

- 🔐 **Better Auth** - Secure authentication with session management
- 💬 **Real-time Messaging** - Socket.IO for instant message delivery
- 🤖 **AI Integration** - OpenAI GPT integration for AI assistant
- 👥 **User Management** - User profiles and chat sessions
- 🗄️ **Database** - PostgreSQL with Prisma ORM
- 🔒 **Secure APIs** - RESTful API with authentication middleware

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better Auth
- **Real-time**: Socket.IO
- **AI**: OpenAI API

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon, Supabase, etc.)
- OpenAI API key (for AI features)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Fasill/NexusChatBackend.git
cd NexusChatBackend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.template .env
```

Edit `.env` and configure:
```env
DATABASE_URL=your-postgresql-connection-string
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:5173
OPENAI_API_KEY=your-openai-api-key
```

4. Set up the database:
```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

## API Endpoints

### Authentication
- `POST /api/auth/sign-up/email` - User registration
- `POST /api/auth/sign-in/email` - User login
- `POST /api/auth/sign-out` - User logout
- `GET /api/auth/session` - Get current session

### Users
- `GET /api/users` - Get all users (authenticated)
- `GET /api/users/me` - Get current user profile

### Chat
- `POST /api/chat/session` - Create or get chat session
- `GET /api/chat/sessions` - Get user's chat sessions
- `GET /api/chat/session/:sessionId/messages` - Get messages for a session
- `POST /api/chat/session/:sessionId/read` - Mark messages as read

### AI
- `POST /api/ai/session` - Create or get AI chat session
- `POST /api/ai/message` - Send message to AI assistant

### Health
- `GET /api/health` - Health check endpoint

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Secret key for Better Auth

### Optional (with defaults)
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `BETTER_AUTH_URL` - Backend URL (default: http://localhost:3001)
- `FRONTEND_URL` - Frontend URL (default: http://localhost:3000)
- `TRUSTED_ORIGINS` - Comma-separated list of trusted origins
- `OPENAI_API_KEY` - OpenAI API key (required for AI features)

## Project Structure

```
backend/
├── src/
│   ├── auth.ts              # Better Auth configuration
│   ├── index.ts              # Express server setup
│   ├── socket.ts             # Socket.IO handlers
│   ├── middleware/
│   │   └── auth.ts          # Authentication middleware
│   └── routes/
│       ├── users.ts         # User routes
│       ├── chat.ts          # Chat routes
│       └── ai.ts            # AI routes
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Database migrations
└── package.json
```

## Database Schema

The application uses Prisma with PostgreSQL. Key models:
- `User` - User accounts
- `Session` - Better Auth sessions
- `Account` - Better Auth accounts
- `ChatSession` - Chat conversations
- `Message` - Chat messages

## Socket.IO Events

### Client → Server
- `join-chat` - Join a chat room
- `leave-chat` - Leave a chat room
- `send-message` - Send a message
- `typing` - Typing indicator
- `mark-read` - Mark messages as read

### Server → Client
- `new-message` - New message received
- `user-online` - User came online
- `user-offline` - User went offline
- `online-users` - List of online users
- `user-typing` - User is typing
- `messages-read` - Messages were read

## Security

- All API routes (except auth) require authentication
- CORS is configured for trusted origins only
- Better Auth handles secure session management
- Socket.IO connections require authentication

## License

MIT

## Author

Fasil

