// routes/chat.js
// POST /api/chat
// Multi-turn conversational AI with document context

const express = require('express');
const gemini = require('../services/gemini');
const logger = require('../services/logger');

const router = express.Router();

// ── POST /api/chat ────────────────────────────────────────────
router.post('/chat', express.json(), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    const { history, contextDocs } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ success: false, error: 'history array is required' });
    }

    // Validate history format
    for (const [i, msg] of history.entries()) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({
          success: false,
          error: `Message ${i + 1} missing role or content`
        });
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ success: false, error: `Invalid role: ${msg.role}` });
      }
    }

    // Keep last 10 turns to avoid token limits
    const trimmedHistory = history.slice(-10);

    logger.info('Chat request', {
      requestId,
      turns: trimmedHistory.length,
      hasContext: !!contextDocs
    });

    const reply = await gemini.chat(trimmedHistory, contextDocs || '', requestId);

    res.json({
      success: true,
      requestId,
      reply
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
