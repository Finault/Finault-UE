// Proxy all requests to gateway.finault.ai (same-origin, avoids CORS)
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/gw/, '');
  const target = `https://gateway.finault.ai${path}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  const resp = await fetch(target, {
    method: context.request.method,
    headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body
      : undefined,
  });

  const responseHeaders = new Headers(resp.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(resp.body, {
    status: resp.status,
    headers: responseHeaders,
  });
}
