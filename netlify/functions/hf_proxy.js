// netlify/functions/hf_proxy.js
export async function handler(event) {
  const defaultModel = 'mistralai/Mistral-7B-Instruct-v0.2:featherless-ai';
  const defaultUrl = 'https://router.huggingface.co/v1/chat/completions';

  try {
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    const model = body.model || params.model || defaultModel;
    const apiUrl = body.url || params.url || defaultUrl;
    const prompt = body.prompt || params.prompt;

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt' }),
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const text = await response.text();

    return {
      statusCode: response.status,
      body: text,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
