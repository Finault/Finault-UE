import { executeClose } from "../core/closeExecutor";

const CLOSE_PATH = "/closepack";
const ALLOWED_ORIGIN = "https://closepack.finault.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request: Request): Promise<Response> {
    // Wrap everything in try/catch to GUARANTEE Response return
    try {
      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        });
      }

      const url = new URL(request.url);

      // POST only: execute close and stream ZIP
      if (request.method !== "POST" || url.pathname !== CLOSE_PATH) {
        return new Response("Not Found", { status: 404 });
      }

      const ct = request.headers.get("content-type") || "";
      if (!ct.includes("multipart/form-data")) {
        return new Response("No invoices", { status: 400 });
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch (formError) {
        console.error("Form parsing error:", formError);
        return new Response("Failed to parse form data", { status: 400 });
      }

      const files = [...form.values()].filter(v => v instanceof File) as File[];
      if (!files.length) {
        return new Response("No invoices", { status: 400 });
      }

      // Execute close - main work happens here
      let zip: Uint8Array;
      try {
        zip = await executeClose(files);
      } catch (execError) {
        console.error("Closepack execution error:", execError);
        const message = execError instanceof Error ? execError.message : "Unknown error";
        return new Response(`Closepack execution failed: ${message}`, { status: 500 });
      }

      // Validate result
      if (!zip || zip.length === 0) {
        console.error("executeClose returned empty result");
        return new Response("Closepack execution returned empty result", { status: 500 });
      }

      // SUCCESS: Return the ZIP
      return new Response(zip, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": "attachment; filename=finault-close-pack.zip",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN
        }
      });

    } catch (unexpectedError) {
      // CRITICAL: This catch block ensures we NEVER fail to return a Response
      console.error("UNEXPECTED ERROR in fetch():", unexpectedError);
      return new Response("Internal server error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN
        }
      });
    }
  }
};
