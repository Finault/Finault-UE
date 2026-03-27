// Cloudflare Pages Function — general-purpose proxy for ALL gateway API calls
// Catches /api/gw/* and forwards to api.finault.ai/*
// Avoids CORS issues by calling the gateway from the server side

const GATEWAY_ORIGIN = "https://api.finault.ai";

async function handleRequest(context) {
  try {
    // context.params.path is an array of path segments after /api/gw/
    const gwPath = "/" + (context.params.path || []).join("/");
    const url = new URL(context.request.url);
    const gwUrl = `${GATEWAY_ORIGIN}${gwPath}${url.search}`;

    const headers = new Headers();
    headers.set("Content-Type", context.request.headers.get("Content-Type") || "application/json");
    const auth = context.request.headers.get("Authorization");
    if (auth) headers.set("Authorization", auth);

    const fetchOpts = {
      method: context.request.method,
      headers,
    };

    // Forward body for methods that support it
    if (["POST", "PUT", "PATCH"].includes(context.request.method)) {
      try {
        fetchOpts.body = await context.request.text();
      } catch (e) {
        // No body — that's fine
      }
    }

    const res = await fetch(gwUrl, fetchOpts);
    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Gateway proxy failed" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export async function onRequestGet(context) { return handleRequest(context); }
export async function onRequestPost(context) { return handleRequest(context); }
export async function onRequestPut(context) { return handleRequest(context); }
export async function onRequestDelete(context) { return handleRequest(context); }
export async function onRequestPatch(context) { return handleRequest(context); }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
