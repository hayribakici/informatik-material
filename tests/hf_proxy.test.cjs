const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/hf_proxy.js');
const originalFetch = global.fetch;
const originalToken = process.env.HF_TOKEN;
let calls;
const request = (body = { prompt: 'Hello' }, overrides = {}) => ({
  httpMethod: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body), ...overrides,
});
beforeEach(() => {
  calls = [];
  process.env.HF_TOKEN = 'test-server-secret';
  global.fetch = async (...args) => { calls.push(args); throw new Error('Unexpected fetch'); };
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.HF_TOKEN;
  else process.env.HF_TOKEN = originalToken;
});

test('only POST is accepted', async () => {
  for (const httpMethod of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
    const result = await handler(request({}, { httpMethod }));
    assert.equal(result.statusCode, 405);
    assert.equal(result.headers.Allow, 'POST');
  }
  assert.equal(calls.length, 0);
});
test('requires JSON content type and handles malformed JSON', async () => {
  for (const headers of [{}, { 'content-type': 'text/plain' }]) {
    assert.equal((await handler(request({}, { headers }))).statusCode, 415);
  }
  for (const body of ['', '{bad']) {
    assert.equal((await handler(request({}, { body }))).statusCode, 400);
  }
  assert.equal(calls.length, 0);
});
test('validates body, prompt and optional model without querying upstream', async () => {
  for (const body of [null, [], 'hello', {}, { prompt: '' }, { prompt: '  ' },
    { prompt: 42 }, { prompt: {} }, { prompt: ['hello'] },
    { prompt: 'ok', model: null }, { prompt: 'ok', model: '' }]) {
    assert.equal((await handler(request(body))).statusCode, 400);
  }
  assert.equal((await handler(request({}, { queryStringParameters: { prompt: 'query only' } }))).statusCode, 400);
  assert.equal(calls.length, 0);
});
test('rejects body and query upstream URL overrides', async () => {
  assert.equal((await handler(request({ prompt: 'ok', url: 'https://attacker.invalid' }))).statusCode, 400);
  assert.equal((await handler(request(undefined, { queryStringParameters: { url: 'https://attacker.invalid' } }))).statusCode, 400);
  assert.equal(calls.length, 0);
});
test('missing server configuration cannot be supplied by client', async () => {
  for (const token of [undefined, '', '   ']) {
    if (token === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = token;
    const result = await handler(request({ prompt: 'ok', HF_TOKEN: 'client-token' }));
    assert.equal(result.statusCode, 503);
    assert.match(JSON.parse(result.body).error, /HF_TOKEN/);
  }
  assert.equal(calls.length, 0);
});
test('fixed destination, server token, no redirects and unchanged Flutter response', async () => {
  const responseBody = '{ "choices": [{"message":{"content":"Hello!"}}], "usage":{"total_tokens":5}}';
  global.fetch = async (...args) => { calls.push(args); return new Response(responseBody); };
  const result = await handler(request({ prompt: 'Hello', HF_TOKEN: 'client-token' }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, responseBody);
  assert.equal(result.headers['Content-Type'], 'application/json');
  const [url, options] = calls[0];
  assert.equal(url, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-server-secret');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body), {
    model: 'Qwen/Qwen3-32B', stream: false,
    messages: [{ role: 'user', content: 'Hello' }],
  });
});
test('supports base64 JSON and optional body model', async () => {
  global.fetch = async (...args) => { calls.push(args); return Response.json({ choices: [{ message: { content: 'ok' } }] }); };
  const body = Buffer.from(JSON.stringify({ prompt: 'Hi', model: 'custom/model' })).toString('base64');
  assert.equal((await handler(request({}, { body, isBase64Encoded: true }))).statusCode, 200);
  assert.equal(JSON.parse(calls[0][1].body).model, 'custom/model');
});
test('upstream errors retain status without exposing raw diagnostics', async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    global.fetch = async () => new Response('private upstream diagnostics', { status });
    const result = await handler(request());
    assert.equal(result.statusCode, status);
    assert.equal(JSON.parse(result.body).upstreamStatus, status);
    assert.doesNotMatch(result.body, /private/);
  }
});
test('invalid upstream success bodies and redirects become gateway errors', async () => {
  for (const body of ['<html>bad gateway</html>', '{}', 'null', '{"choices":[]}']) {
    global.fetch = async () => new Response(body);
    assert.equal((await handler(request())).statusCode, 502);
  }
  global.fetch = async () => new Response('', { status: 302 });
  assert.equal((await handler(request())).statusCode, 502);
});
test('network failures and timeouts are sanitized', async () => {
  for (const [name, status] of [['TypeError', 502], ['TimeoutError', 504], ['AbortError', 504]]) {
    global.fetch = async () => { throw Object.assign(new Error('test-server-secret'), { name }); };
    const result = await handler(request());
    assert.equal(result.statusCode, status);
    assert.doesNotMatch(result.body, /test-server-secret/);
  }
});
