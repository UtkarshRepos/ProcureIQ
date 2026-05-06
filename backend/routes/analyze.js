// routes/analyze.js
// POST /api/analyze-document
// Accepts PDF upload or raw text, returns AI analysis

const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const gemini = require('../services/gemini');
const logger = require('../services/logger');

const router = express.Router();

// Multer: memory storage, 10MB limit, PDF + txt only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and TXT files are allowed'));
  }
});

// ── POST /api/analyze-document ────────────────────────────────
router.post('/analyze-document', upload.single('file'), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    let text = '';
    let docName = 'Unknown Document';

    if (req.file) {
      // PDF or TXT uploaded
      docName = req.file.originalname;
      logger.info('File received', { requestId, filename: docName, size: req.file.size });

      if (req.file.mimetype === 'application/pdf') {
        const parsed = await pdfParse(req.file.buffer);
        text = parsed.text;
        logger.debug('PDF parsed', { requestId, pages: parsed.numpages, chars: text.length });
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      // Raw text submitted
      text = req.body.text;
      docName = req.body.docName || 'Pasted Document';
      logger.info('Text received', { requestId, chars: text.length });
    } else {
      return res.status(400).json({ success: false, error: 'No file or text provided.' });
    }

    if (!text || text.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Document appears to be empty or unreadable.' });
    }

    // Run AI analysis
    const analysis = await gemini.analyzeDocument(text, docName, requestId);

    res.json({
      success: true,
      requestId,
      docName,
      charCount: text.length,
      analysis
    });

  } catch (err) {
    next(err);
  }
});

// ── POST /api/analyze-text ────────────────────────────────────
// Convenience endpoint for plain text (used by n8n webhook)
router.post('/analyze-text', express.json(), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    const { text, docName, senderEmail } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'text field required' });

    let analysis;
    if (senderEmail) {
      // Called from n8n email workflow
      analysis = await gemini.analyzeEmailAttachment(text, senderEmail, requestId);
    } else {
      analysis = await gemini.analyzeDocument(text, docName || 'Document', requestId);
    }

    res.json({ success: true, requestId, analysis });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
