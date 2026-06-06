require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Groq = require('groq-sdk');

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // Best practice: store API key in environment variable
});

const app = express();
app.use(express.json());
app.use(cors());

// In-memory session store (use Redis for production)
const sessions = new Map();

// Core function to get a reply from Groq
async function getBotReply(query, history) {
  try {
    // Prepend a system message (only once) to enforce concise replies
    const systemMessage = {
      role: "system",
      content: "You are a helpful assistant. Always give concise, direct answers. Use short sentences and bullet points only when necessary. Avoid long explanations or tables unless explicitly asked."
    };
    
    // Build messages array: system + conversation history
    const messages = [systemMessage, ...history.map(h => ({ role: h.role, content: h.content }))];
    
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: messages,
      temperature: 0.2,        // lower temp = more focused
      max_tokens: 50,         // limit length
    });
    
    return completion.choices[0]?.message?.content || "Sorry, I didn't understand.";
  } catch (error) {
    console.error('Groq API Error:', error);
    return "I'm having trouble right now. Please try again later.";
  }
}

app.post('/chat', async (req, res) => {
  const { query, sessionId } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Retrieve or create session history
  let session = sessions.get(sessionId);
  if (!session) {
    session = { history: [] };
    sessions.set(sessionId, session);
  }

  // Add user message to history
  session.history.push({ role: 'user', content: query });

  // Get bot reply
  const reply = await getBotReply(query, session.history);

  // Add bot reply to history
  session.history.push({ role: 'assistant', content: reply });

  // Limit history length to manage context window
  if (session.history.length > 20) session.history = session.history.slice(-20);

  res.json({ reply });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
module.exports = app;