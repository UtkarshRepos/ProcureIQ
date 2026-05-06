// routes/webhook.js
// POST /api/webhook/email-document
// Called by n8n when an email with PDF attachment is received
// Returns AI analysis + suggested reply for n8n to send back

const express = require('express');
const gemini = require('../services/gemini');
const logger = require('../services/logger');

const router = express.Router();

// ── POST /api/webhook/email-document ─────────────────────────
// n8n sends: { senderEmail, subject, documentText, documentName }
// We return: { analysis, suggestedReply }
router.post('/webhook/email-document', express.json(), async (req, res, next) => {
  const requestId = req.requestId;
  try {
    const { senderEmail, subject, documentText, documentName } = req.body;

    logger.info('n8n webhook received', {
      requestId,
      sender: senderEmail,
      subject,
      docName: documentName,
      textLength: documentText?.length
    });

    if (!documentText || documentText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        error: 'documentText is empty or too short'
      });
    }

    // Run email-specific analysis (returns recommended reply too)
    const analysis = await gemini.analyzeEmailAttachment(
      documentText,
      senderEmail || 'unknown@sender.com',
      requestId
    );

    // Build the email reply body n8n will send
    const emailReplyBody = `
Dear ${senderEmail ? senderEmail.split('@')[0] : 'Sender'},

Thank you for sending the document "${documentName || subject || 'your document'}".

Our AI procurement system has automatically analyzed it. Here is a summary:

${analysis.summary}

Key Facts:
${(analysis.key_facts || []).map(f => `• ${f}`).join('\n')}

Action Required:
${analysis.action_required || 'Please review the document at your earliest convenience.'}

${(analysis.risks || []).filter(r => r.level === 'high').length > 0
  ? `⚠ Risk Alert: ${analysis.risks.filter(r => r.level === 'high').map(r => r.text).join('. ')}`
  : ''}

This is an automated analysis by ProcureAI.
For detailed review, please contact our procurement team.

Best regards,
ProcureAI System
${process.env.COMPANY_NAME || 'Delta Controls FZCO'}
    `.trim();

    logger.info('Webhook analysis complete', { requestId, docType: analysis.doc_type });

    res.json({
      success: true,
      requestId,
      analysis,
      emailReply: {
        to: senderEmail,
        subject: `Re: ${subject || documentName || 'Document Analysis'} — ProcureAI Summary`,
        body: emailReplyBody
      }
    });

  } catch (err) {
    next(err);
  }
});

// ── GET /api/webhook/health ───────────────────────────────────
// n8n pings this to verify the server is alive
router.get('/webhook/health', (req, res) => {
  res.json({
    success: true,
    status: 'ProcureAI webhook ready',
    timestamp: new Date().toISOString(),
    company: process.env.COMPANY_NAME
  });
});

module.exports = router;
