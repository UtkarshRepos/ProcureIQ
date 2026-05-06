// services/gemini.js
// All Gemini API calls go through this service
// API key is NEVER exposed to frontend — only lives here

const axios = require('axios');
const logger = require('./logger');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const COMPANY = process.env.COMPANY_NAME || 'Industrial Company';
const INDUSTRY = process.env.COMPANY_INDUSTRY || 'Oil & Gas / Industrial Automation';

const SYSTEM_CONTEXT = `You are ProcureAI, an expert AI assistant for ${COMPANY}, 
a company in the ${INDUSTRY} sector based in UAE. 
You specialize in procurement, contract analysis, supplier evaluation, and HR screening 
for industrial automation and Oil & Gas environments.`;

// ── Core Gemini call ──────────────────────────────────────────
async function callGemini(prompt, options = {}) {
  const { maxTokens = 2000, temperature = 0.1, requestId = 'N/A', jsonMode = false } = options;

  const startTime = Date.now();
  logger.info('Gemini API call initiated', { requestId, promptLength: prompt.length });

  try {
    const response = await axios.post(
      `${GEMINI_BASE}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          ...(jsonMode ? { response_mime_type: 'application/json' } : {})
        }
      },
      { timeout: 30000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const duration = Date.now() - startTime;

    logger.info('Gemini API call succeeded', {
      requestId,
      duration: `${duration}ms`,
      outputLength: text.length
    });

    return text;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('Gemini API call failed', {
      requestId,
      duration: `${duration}ms`,
      error: err.response?.data?.error?.message || err.message
    });
    const message = err.response?.data?.error?.message || err.message || 'Gemini API request failed';
    const quotaMatch = message.match(/Please retry in\s+([\d.]+)s/i);
    const retryAfterSeconds = quotaMatch ? Number(quotaMatch[1]) : undefined;

    const e = new Error(message);
    if (/quota exceeded/i.test(message) || /rate limit/i.test(message)) {
      e.status = 429;
      if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)) {
        e.retryAfterMs = Math.round(retryAfterSeconds * 1000);
      }
    }
    throw e;
  }
}

// ── Call and parse JSON response ──────────────────────────────
async function callGeminiJSON(prompt, options = {}) {
  const baseInstruction =
    '\n\nCRITICAL INSTRUCTION: Respond with ONLY a valid JSON object. No extra text, no markdown fences.' +
    ' Do NOT include newline characters inside JSON string values. If you need a line break, use literal "\\n".' +
    ' The JSON must start with { and end with }.';

  // Parsing retry costs an additional Gemini request; default to 0 while debugging/quota-limited.
  const retries = Number.isFinite(options.retries) ? options.retries : 0;
  const initialMaxTokens = options.maxTokens ?? 2000;

  // Some models occasionally return malformed or truncated JSON.
  // We do one retry, feeding back the parse error so it can self-correct.
  let lastError;
  let lastRaw;

  const sanitizeJsonNewlinesInStrings = (s) => {
    let out = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
          out += ch;
          continue;
        }

        if (ch === '\\') {
          escapeNext = true;
          out += ch;
          continue;
        }

        if (ch === '"') {
          inString = false;
          out += ch;
          continue;
        }

        // Convert literal newlines inside strings to escaped newline tokens.
        if (ch === '\n' || ch === '\r') {
          out += '\\n';
          continue;
        }
      } else {
        // Enter string state when we see a quote (outside of other tokens).
        if (ch === '"') inString = true;
      }

      out += ch;
    }

    return out;
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nYour previous JSON was invalid. Fix it and output ONLY corrected JSON.\nPrevious parse error: ${lastError?.message ?? 'Unknown error'}`;

    const raw = await callGemini(
      prompt + baseInstruction + extra,
      {
        ...options,
        jsonMode: true,
        maxTokens: attempt === 0 ? initialMaxTokens : Math.min(6000, Math.round(initialMaxTokens * 1.5))
      }
    );

    lastRaw = raw;

    // Log raw response so we can debug
    logger.debug('Gemini raw response', { raw: raw.substring(0, 500) });
    console.log('\n===== GEMINI RAW RESPONSE =====\n', raw.substring(0, 800), '\n================================\n');

    let cleaned = raw.trim();

    // Step 1: Remove markdown fences
    cleaned = cleaned.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '').trim();

    // Step 2: Extract first JSON object found
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    // Step 2b: Repair illegal literal newlines inside JSON string values.
    cleaned = sanitizeJsonNewlinesInStrings(cleaned);

    // Step 3: Fix trailing commas
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    console.log('\n===== CLEANED JSON =====\n', cleaned.substring(0, 500), '\n========================\n');

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      lastError = e;
      logger.error('JSON parse failed', { error: e.message, raw: raw.substring(0, 500) });
      const truncationHint = cleaned.endsWith('}') ? '' : ' (it may be truncated)';
      if (attempt >= retries) {
        throw new Error(
          'AI returned invalid JSON: ' + e.message + truncationHint + ' | Raw: ' + raw.substring(0, 200)
        );
      }
    }
  }

  // Should never reach here.
  throw new Error('AI returned invalid JSON (unknown parse failure).');
}

// ── Multi-turn chat ───────────────────────────────────────────
async function callGeminiChat(history, contextDocs = '', options = {}) {
  const { requestId = 'N/A' } = options;

  // Build contents array for Gemini (alternating user/model)
  const contents = history.map((m, i) => {
    let text = m.content;
    // Inject system context + docs into first message
    if (i === 0) {
      text = `${SYSTEM_CONTEXT}\n\n${contextDocs ? `DOCUMENT CONTEXT:\n${contextDocs}\n\n` : ''}USER QUESTION: ${text}`;
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    };
  });

  const startTime = Date.now();
  logger.info('Gemini chat call', { requestId, turns: history.length });

  try {
    const response = await axios.post(
      `${GEMINI_BASE}?key=${process.env.GEMINI_API_KEY}`,
      { contents, generationConfig: { maxOutputTokens: 1000, temperature: 0.5 } },
      { timeout: 30000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logger.info('Gemini chat succeeded', { requestId, duration: `${Date.now() - startTime}ms` });
    return text;
  } catch (err) {
    logger.error('Gemini chat failed', { requestId, error: err.message });
    throw new Error(err.response?.data?.error?.message || 'Chat API failed');
  }
}

// ── Exported AI functions ─────────────────────────────────────

async function analyzeDocument(docText, docName, requestId) {
  const prompt = `${SYSTEM_CONTEXT}

Analyze this procurement document and return a JSON object:
{
  "doc_type": "RFQ | Contract | Purchase Order | Supplier Quote | General",
  "vendor": "vendor name or Unknown",
  "buyer": "buyer company or Unknown",
  "total_value": "monetary value with currency or Not Specified",
  "delivery_timeline": "delivery period or Not Specified",
  "payment_terms": "payment terms or Not Specified",
  "warranty": "warranty info or Not Specified",
  "scope": "2-3 sentence summary of document scope",
  "key_items": ["item1", "item2"],
  "risks": [{"level":"high|medium|low","text":"risk description"}],
  "recommendation": "1-2 sentence actionable recommendation for procurement team",
  "oil_gas_relevance": "how this document relates to Oil & Gas or industrial automation context"
}

Document Name: ${docName}
Document Content:
${docText.substring(0, 5000)}`;

  return callGeminiJSON(prompt, { requestId, maxTokens: 2000, temperature: 0.1 });
}

async function compareQuotes(quotes, requestId) {
  const quoteText = quotes.map((q, i) =>
    `Supplier ${i + 1}: ${q.vendor} | Price: $${q.price} | Delivery: ${q.delivery} days | Warranty: ${q.warranty} | Notes: ${q.notes || 'N/A'}`
  ).join('\n');

  const prompt = `${SYSTEM_CONTEXT}

You are evaluating supplier quotes for an Oil & Gas / industrial automation company.
Analyze these quotes and return JSON:
{
  "winner_index": 0,
  "scores": [
    {
      "vendor": "name",
      "overall_score": 85,
      "price_score": 90,
      "delivery_score": 80,
      "warranty_score": 85,
      "value_score": 88,
      "pros": ["pro1","pro2"],
      "cons": ["con1"]
    }
  ],
  "recommendation": "Detailed 2-3 sentence recommendation",
  "key_insight": "One critical insight about this comparison",
  "risk_assessment": "Brief risk note about the recommended supplier"
}

Supplier Quotes:
${quoteText}`;

  return callGeminiJSON(prompt, { requestId, maxTokens: 2000, temperature: 0.1 });
}

async function screenCV(jobDescription, cvText, requestId) {
  // Keep prompts bounded to reduce input-token usage and improve stability.
  // (Quota errors often include both request-count and input-token limits.)
  const boundedJobDescription = (jobDescription || '').substring(0, 4000);
  const boundedCvText = (cvText || '').substring(0, 6000);

  const prompt = `${SYSTEM_CONTEXT}

Evaluate this candidate for the job and return JSON:
{
  "candidate_name": "name or Candidate",
  "overall_score": 85,
  "recommendation": "Shortlist | Consider | Reject",
  "summary": "2 short sentences max; single-line text only; no newline characters; <= 250 characters",
  "skills_match": [{"skill":"Python","score":90,"found":true,"evidence":"brief evidence; single-line only; <= 200 characters"}],
  "strengths": ["strength1","strength2","strength3"],
  "gaps": ["gap1","gap2"],
  "culture_fit": "single-line assessment of fit for Oil & Gas / industrial environment; <= 160 characters",
  "interview_questions": ["short question 1?","short question 2?","short question 3?"],
  "suggested_role_level": "Junior | Mid | Senior"
}

Job Description:
${boundedJobDescription}

Candidate CV:
${boundedCvText}`;

  return callGeminiJSON(prompt, { requestId, maxTokens: 3000, temperature: 0.1 });
}

async function chat(history, contextDocs, requestId) {
  return callGeminiChat(history, contextDocs, { requestId });
}

async function analyzeEmailAttachment(docText, senderEmail, requestId) {
  const prompt = `${SYSTEM_CONTEXT}

A procurement document was received via email from ${senderEmail}.
Analyze it and provide a clear, professional email reply summary.
Return JSON:
{
  "doc_type": "document type",
  "summary": "3-4 sentence plain English summary suitable for email reply",
  "key_facts": ["fact1","fact2","fact3"],
  "action_required": "what the recipient needs to do next",
  "risks": [{"level":"high|medium|low","text":"risk"}],
  "recommended_reply": "professional 3-4 sentence email reply text to send back to the sender"
}

Document Content:
${docText.substring(0, 4000)}`;

  return callGeminiJSON(prompt, { requestId, maxTokens: 2000, temperature: 0.1 });
}

module.exports = {
  analyzeDocument,
  compareQuotes,
  screenCV,
  chat,
  analyzeEmailAttachment,
  callGemini
};