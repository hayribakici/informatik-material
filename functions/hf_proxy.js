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
    const stream = body.stream === true || params.stream === 'true';

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt' }),
      };
    }

    const req = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // --- Streaming-Antwort (SSE) ---
    if (stream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const reader = req.body.getReader();
      const streamResponse = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(decoder.decode(value)));
          }
          controller.close();
        },
      });

      return new Response(streamResponse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // --- Normale Antwort ---
    const text = await req.text();
    return {
      statusCode: req.status,
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
