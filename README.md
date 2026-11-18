# BAWRA — private AI companion for Amu

BAWRA is a React + Express application with MongoDB persistence and OpenAI-powered replies.

## What's included
- Time-aware greetings and the existing romantic burgundy/rose interface.
- Voice input with one-shot final transcript handling to avoid duplicate speech results.
- A send lock and request IDs to prevent duplicate submissions.
- OpenAI chat responses with recent conversation context, stored in MongoDB.
- A corrected private starter profile stored server-side in MongoDB. The profile is not sent to the browser or displayed in the UI.
- API keys and database credentials stay in `server/.env`.

## Requirements
- Node.js 18+
- npm
- MongoDB Atlas database (or a local MongoDB server)
- OpenAI API key and API billing/credits

## Setup

### 1. Configure the backend
Open `server/.env.example`, copy it to a new file named `server/.env`, and fill in:

```env
PORT=4000
OPENAI_API_KEY=your_real_openai_api_key
OPENAI_MODEL=gpt-4o-mini
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER/bawra?retryWrites=true&w=majority
MONGODB_DB=bawra
CLIENT_ORIGIN=http://localhost:5173
```

Create a free MongoDB Atlas cluster if needed, create a database user, allow your development IP in Network Access, and copy the Node.js connection string. Replace the username, password, and cluster host. Do not share `.env` or commit it to Git.

Create an OpenAI API key in the OpenAI Platform. ChatGPT subscriptions and API billing are separate. Keep the key only in `server/.env`.

### 2. Install and run backend
```powershell
cd server
npm install
npm run dev
```

The server starts only after it connects to MongoDB. Check `http://localhost:4000/api/health`; expected response has `ok`, `databaseConnected: true`, and `aiEnabled: true`.

### 3. Install and run frontend (new terminal)
```powershell
cd client
npm install
npm run dev
```

Open `http://localhost:5173`.

## Database structure
- `profiles`: one private `amu-primary` profile document with corrected spelling and phrasing.
- `conversations`: chat documents keyed by a browser-generated session ID. The server stores user and assistant messages and uses recent messages as context.

The profile is seeded only when the database document does not already exist. If you change the starter profile in `server/index.js` after first launch, update the existing MongoDB document manually or use a migration; `$setOnInsert` intentionally preserves saved data.

## Voice duplicate fix
Speech recognition is configured for a single, non-continuous utterance. Only the first final transcript is accepted and it replaces the input text rather than appending repeated recognition events. Sending is guarded against concurrent submissions and each request has a unique ID.

## Privacy and deployment
This is a local development project, not a secure multi-user production service. Anyone who can access the running local app can potentially use its chat endpoint. Before exposing it to the internet, add authentication, per-user authorization, rate limiting, HTTPS, secure session handling, and explicit consent/data deletion controls. Do not store sensitive personal information without the person's informed consent. The app is an AI companion, not a therapist or emergency service.
