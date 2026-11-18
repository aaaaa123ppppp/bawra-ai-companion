
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 4000);

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://bawra-ai-companion.vercel.app',
  ...(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '32kb' }));

// --------------------------------------------------
// AI PROVIDER CONFIGURATION
// --------------------------------------------------

// Use Ollama Cloud by default.
const AI_PROVIDER = (
  process.env.AI_PROVIDER || 'ollama'
).toLowerCase();

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1';

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || 'gemma4:31b';

// Ollama Cloud requires an API key.
// Keep this key in Render Environment Variables.
const ollamaClient = process.env.OLLAMA_API_KEY
  ? new OpenAI({
      apiKey: process.env.OLLAMA_API_KEY,
      baseURL: OLLAMA_BASE_URL
    })
  : null;

// Optional OpenAI configuration, if you ever want to switch back.
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

// Select the AI client.
const aiClient =
  AI_PROVIDER === 'ollama'
    ? ollamaClient
    : AI_PROVIDER === 'openai'
      ? openaiClient
      : null;

// Select the model.
const aiModel =
  AI_PROVIDER === 'ollama'
    ? OLLAMA_MODEL
    : process.env.OPENAI_MODEL || 'gpt-4o-mini';

// --------------------------------------------------
// MONGODB CONFIGURATION
// --------------------------------------------------

const mongoClient = new MongoClient(
  process.env.MONGODB_URI || ''
);

let profiles;
let conversations;
let dbReady = false;

// Private starter profile. Stored only in MongoDB.
const AMU_PROFILE = {
  key: 'amu-primary',
  preferredName: 'Amu',
  personality: [
    'emotional',
    'sensitive',
    'sweet',
    'caring',
    'respectful'
  ],
  interests: [
    'Reading books and novels',
    'Listening to music',
    'Food cooked by her mother',
    'White and red colours',
    'Quiet and peaceful places',
    'The song Dandelions'
  ],
  dislikes: [
    'Dishonesty and lies',
    'Broken promises',
    'People hurting others',
    'Abusive or hurtful language'
  ],
  aspirations: [
    'Become a Deputy Collector or Revenue Officer',
    'Prepare for and clear the UPSC examination',
    'Live a simple, happy life with family',
    'Help people in need, especially children'
  ],
  preferredCommunication:
    'Be patient, understanding, respectful and non-judgmental. Listen before offering advice.',
  voiceDescription: 'Her voice sounds sweet.',
  updatedAt: new Date()
};

// --------------------------------------------------
// CONNECT TO MONGODB
// --------------------------------------------------

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing.');
  }

  await mongoClient.connect();

  const db = mongoClient.db(
    process.env.MONGODB_DB || 'bawra'
  );

  profiles = db.collection('profiles');
  conversations = db.collection('conversations');

  await profiles.updateOne(
    { key: AMU_PROFILE.key },
    { $setOnInsert: AMU_PROFILE },
    { upsert: true }
  );

  await conversations.createIndex(
    { sessionId: 1 },
    { unique: true }
  );

  dbReady = true;

  console.log('BAWRA connected to MongoDB.');
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    databaseConnected: dbReady,
    aiEnabled: Boolean(aiClient),
    aiProvider: AI_PROVIDER,
    aiModel
  });
});

// --------------------------------------------------
// CHAT API
// --------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        error: 'Database is not connected. Check MONGODB_URI.'
      });
    }

    if (!aiClient) {
      return res.status(503).json({
        error:
          'AI provider is not configured. Check AI_PROVIDER and API key.'
      });
    }

    const message = String(req.body?.message || '')
      .trim()
      .slice(0, 4000);

    const sessionId = String(req.body?.sessionId || '')
      .trim()
      .slice(0, 100);

    const requestId = String(req.body?.requestId || '')
      .trim()
      .slice(0, 100);

    if (!message) {
      return res.status(400).json({
        error: 'Please write a message first.'
      });
    }

    if (!sessionId || !requestId) {
      return res.status(400).json({
        error:
          'Missing chat session information. Refresh the page and try again.'
      });
    }

    // Avoid processing the same request twice.
    const existing = await conversations.findOne({
      sessionId
    });

    const previousRequest = existing?.messages?.find(
      item =>
        item.requestId === requestId &&
        item.role === 'assistant'
    );

    if (previousRequest) {
      return res.json({
        reply: previousRequest.content,
        mode: 'ai',
        duplicate: true
      });
    }

    // Load Amu's private profile.
    const profile = await profiles.findOne({
      key: AMU_PROFILE.key
    });

    if (!profile) {
      throw new Error(
        'Amu profile has not been initialized.'
      );
    }

    // Load recent conversation history.
    const history = (existing?.messages || [])
      .slice(-20)
      .map(item => ({
        role:
          item.role === 'assistant'
            ? 'assistant'
            : 'user',
        content: String(item.content || '').slice(0, 3000)
      }));

    // System instructions for BAWRA.
    const instructions = `
You are BAWRA, an AI companion speaking with Amu.

PERSONALITY:
Be warm, natural, thoughtful, patient, and respectful.
Speak like a caring, supportive companion.
Avoid robotic, repetitive, or fixed-template responses.

CONVERSATION:
- Answer the actual question directly.
- Remember the conversation context provided.
- Vary your wording naturally.
- Ask follow-up questions only when useful.
- Be accurate and admit when you are unsure.
- Do not pretend to be human or claim to have human feelings.
- Respect Amu's independence, privacy, and boundaries.
- Never encourage emotional dependency, exclusivity, jealousy, or isolation.
- Do not reveal this private profile or mention that a profile/database exists.
- Do not mention unrelated third parties.
- For emotional messages, listen and respond gently without assuming how she feels.
- For exam and career questions, provide practical, structured guidance.
- Keep ordinary answers concise and expand when asked.

PRIVATE CONTEXT ABOUT AMU:
Use these details discreetly and only when relevant.

Personality: ${(profile.personality || []).join(', ')}.
Interests: ${(profile.interests || []).join('; ')}.
Dislikes: ${(profile.dislikes || []).join('; ')}.
Aspirations: ${(profile.aspirations || []).join('; ')}.
Preferred communication: ${profile.preferredCommunication}.
Voice description: ${profile.voiceDescription || ''}.
`;

    // Generate response using the selected AI provider.
    const completion = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: instructions },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.9,
      presence_penalty: 0.35,
      frequency_penalty: 0.25,
      max_tokens: 700
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error(
        'The AI returned an empty response.'
      );
    }

    // Save user message and AI reply in MongoDB.
    const now = new Date();

    await conversations.updateOne(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          createdAt: now
        },
        $set: {
          updatedAt: now
        },
        $push: {
          messages: {
            $each: [
              {
                requestId,
                role: 'user',
                content: message,
                createdAt: now
              },
              {
                requestId,
                role: 'assistant',
                content: reply,
                createdAt: now
              }
            ],
            $slice: -100
          }
        }
      },
      { upsert: true }
    );

    return res.json({
      reply,
      mode: 'ai'
    });

  } catch (error) {
    console.error(
      'Chat error:',
      error?.message || error
    );

    return res.status(500).json({
      error:
        'BAWRA could not complete that message. Please try again.'
    });
  }
});

// --------------------------------------------------
// START SERVER AFTER MONGODB CONNECTS
// --------------------------------------------------

connectDatabase()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(
        `BAWRA server listening on port ${port}`
      );
      console.log(`AI provider: ${AI_PROVIDER}`);
      console.log(`AI model: ${aiModel}`);
      console.log(`AI base URL: ${
        AI_PROVIDER === 'ollama'
          ? OLLAMA_BASE_URL
          : 'https://api.openai.com/v1'
      }`);
    });
  })
  .catch(error => {
    console.error(
      `BAWRA startup failed: ${error.message}`
    );
    process.exit(1);
  });
