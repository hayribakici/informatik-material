const UPSTREAM_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2:featherless-ai';

function json(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(payload),
  };
}

// CommonJS keeps this .js entry point unambiguous without a root package.json.
exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST with a JSON body.' }, { Allow: 'POST' });
  }
  const contentType = Object.entries(event.headers || {})
    .find(([name]) => name.toLowerCase() === 'content-type')?.[1];
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType || '')) {
    return json(415, { error: 'Content-Type must be application/json.' });
  }
  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body;
    body = JSON.parse(raw || '');
  } catch {
    return json(400, { error: 'Request body must be valid JSON.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'Request body must be a JSON object.' });
  }
  if (Object.hasOwn(body, 'url') || Object.hasOwn(event.queryStringParameters || {}, 'url')) {
    return json(400, { error: 'Upstream URL overrides are not allowed.' });
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return json(400, { error: 'prompt must be a non-empty string.' });
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model.trim())) {
    return json(400, { error: 'model must be a non-empty string when provided.' });
  }
  const token = process.env.HF_TOKEN?.trim();
  if (!token) {
    return json(503, { error: 'HF_TOKEN is not configured for this Netlify Function.' });
  }
  try {
    const response = await fetch(UPSTREAM_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        stream: false,
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });
    if (!response.ok) {
      // Never expose upstream diagnostics, credentials, or HTML to the browser.
      const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
      return json(status, { error: 'Hugging Face request failed.', upstreamStatus: response.status });
    }
    const text = await response.text();
    const payload = JSON.parse(text);
    if (typeof payload?.choices?.[0]?.message?.content !== 'string') {
      return json(502, { error: 'Invalid response from Hugging Face.' });
    }
    // Preserve the complete chat-completions JSON expected by Flutter.
    return { ...json(response.status, null), body: text };
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return json(504, { error: 'Hugging Face request timed out.' });
    }
    return json(502, { error: 'Unable to obtain a valid response from Hugging Face.' });
  }
};
