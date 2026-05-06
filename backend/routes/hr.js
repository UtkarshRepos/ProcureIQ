// routes/hr.js
// POST /api/screen-cv
// Evaluates candidate CV against job description

const express = require('express');
const gemini = require('../services/gemini');
const logger = require('../services/logger');

const router = express.Router();

// ── POST /api/screen-cv ───────────────────────────────────────
router.post('/screen-cv', express.json(), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    const { jobDescription, cvText, candidateName } = req.body;

    if (!jobDescription || !cvText) {
      return res.status(400).json({
        success: false,
        error: 'jobDescription and cvText are required'
      });
    }
    if (jobDescription.trim().length < 50) {
      return res.status(400).json({ success: false, error: 'Job description too short' });
    }
    if (cvText.trim().length < 50) {
      return res.status(400).json({ success: false, error: 'CV text too short' });
    }

    logger.info('CV screening requested', {
      requestId,
      candidateName: candidateName || 'Unknown',
      jdLength: jobDescription.length,
      cvLength: cvText.length
    });

    const result = await gemini.screenCV(jobDescription, cvText, requestId);

    res.json({
      success: true,
      requestId,
      result
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
