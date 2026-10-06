# InformaSinn on Netlify

The Hugo build remains `hugo --gc --minify`, publishing `public`. Flutter remains
at `/informasinn/`. Netlify separately bundles `netlify/functions/hf_proxy.js`
from the `[functions] directory = "netlify/functions"` setting and serves it at
`/.netlify/functions/hf_proxy`. Uploading only `public` does not deploy this function.

## Configure the server secret and deploy

1. Open the **info-material** project in Netlify, then **Project configuration →
   Environment variables**. Add `HF_TOKEN` with your Hugging Face token authorized
   to use the selected inference provider. Enter the value directly in Netlify;
   do not put it in Git, `netlify.toml`, Flutter build defines, browser storage,
   or files under `static`/`public`.
2. Include **Functions** access in the variable's scope. Where scoped variables
   are available, use Functions only. Otherwise use the available all-scopes
   setting, which includes Functions. Set the value for **Production**; configure
   preview/branch contexts separately only if they need inference access.
3. Commit/push the repository changes to the production branch used by this site.
   Trigger a new production deploy after saving the variable (or let the push
   trigger it after configuration). Environment changes require a new deploy.
4. Check the deploy log for function bundling and confirm `hf_proxy` appears in
   the deployed Functions list. Check function logs if requests fail; never log
   the token or authorization header.

Netlify documents [Functions environment variables, scopes, and redeployment](https://docs.netlify.com/build/functions/environment-variables/).
Variables in `netlify.toml` are not available to Functions at runtime.
Local `.env` files and Netlify CLI state are ignored by Git; never copy them into
browser assets. No token is needed to run the mocked tests.

## Request and response contract

Send POST with `Content-Type: application/json` and a JSON object containing a
nonblank string `prompt`. An optional nonblank string `model` selects a model at
the fixed Hugging Face router. The default is
`mistralai/Mistral-7B-Instruct-v0.2:featherless-ai`.
Query-string prompts/models are not used. Body or query `url` overrides are
rejected. Authorization comes exclusively from the server's `HF_TOKEN`.
Redirects are refused and upstream requests time out after 25 seconds.

Successful chat-completions JSON passes through unchanged, including
`choices[0].message.content`, which the existing Flutter app reads.
Errors are JSON: 405 for unsupported methods, 415 for unsupported content type,
400 for invalid input, 503 for missing server configuration, 502 for invalid
upstream responses/network failures, and 504 for timeouts. Upstream HTTP errors
retain their status with a sanitized error and `upstreamStatus` field.

## Verify

Run locally with Node.js 20 or newer:

```sh
node --test tests/hf_proxy.test.cjs
hugo --gc --minify
```

After deployment, these commands require no secret in the browser or terminal:

```sh
curl -i https://info-material.netlify.app/.netlify/functions/hf_proxy
curl -i https://info-material.netlify.app/.netlify/functions/hf_proxy \
  -H 'Content-Type: application/json' --data '{}'
curl -i https://info-material.netlify.app/.netlify/functions/hf_proxy \
  -H 'Content-Type: application/json' --data '{"prompt":"Reply with OK."}'
```

Expect respectively **405** with `Allow: POST`, **400** for a missing prompt,
and **200** with `choices[0].message.content` when token/provider/model access is
working. A 503 naming `HF_TOKEN` proves the function is deployed but lacks runtime
configuration. An upstream error has a JSON `upstreamStatus`; a Netlify page-not-found
404 means the deployment still needs investigation. Also open `/informasinn/`
and submit a prompt to verify the actual Flutter flow.

The initial live GET check during this fix returned **404**. Local tests cannot
prove production deployment: configuring the secret, deploying these changes,
inspecting deployed functions/logs, and confirming an authenticated inference
response require access to the Netlify project (and a valid Hugging Face token).
The source fix alone does not change the live deployment.

Copies of the proxy were removed from `static/informasinn/functions` and
`public/informasinn/functions`, along with their Flutter service-worker resource
entries. Keep backend source outside Flutter web output on future exports.
