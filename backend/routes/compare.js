// routes/compare.js
// POST /api/compare-quotes
// Accepts array of supplier quotes, returns AI comparison

const express = require('express');
const gemini = require('../services/gemini');
const logger = require('../services/logger');

const router = express.Router();

// ── POST /api/compare-quotes ──────────────────────────────────
router.post('/compare-quotes', express.json(), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    const { quotes } = req.body;

    if (!quotes || !Array.isArray(quotes)) {
      return res.status(400).json({ success: false, error: 'quotes array is required' });
    }
    if (quotes.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 quotes needed for comparison' });
    }
    if (quotes.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 quotes per comparison' });
    }

    // Validate each quote
    for (const [i, q] of quotes.entries()) {
      if (!q.vendor || !q.price) {
        return res.status(400).json({
          success: false,
          error: `Quote ${i + 1} is missing vendor or price`
        });
      }
    }

    logger.info('Quote comparison requested', { requestId, count: quotes.length });

    const result = await gemini.compareQuotes(quotes, requestId);

    res.json({
      success: true,
      requestId,
      quoteCount: quotes.length,
      result
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
