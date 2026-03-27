// Pages Function: /r/:id → /receipt#:id
// CF Pages _redirects can't pass dynamic params to query strings or hash fragments,
// so this edge function handles the /r/seal_xxx → /receipt#seal_xxx redirect.
// Hash fragments are never sent to the server, so CF Pages can't strip them.
export function onRequest(context) {
  const sealId = context.params.id;
  const url = new URL(context.request.url);
  url.pathname = '/receipt';
  url.hash = sealId;
  return Response.redirect(url.toString(), 302);
}
