export { DailyRequestCounter } from "./dailyRequestCounter.js";

function corsHeaders(env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders(env),
      });
    }

    const targetUrl = new URL(request.url).searchParams.get("url");
    if (!targetUrl) {
      return new Response('Missing "url" query parameter', {
        status: 400,
        headers: corsHeaders(env),
      });
    }

    let target: URL;
    try {
      target = new URL(targetUrl);
    } catch {
      return new Response('"url" is not a valid URL', {
        status: 400,
        headers: corsHeaders(env),
      });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return new Response('"url" must be http or https', {
        status: 400,
        headers: corsHeaders(env),
      });
    }

    const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success: withinPerIpLimit } = await env.PER_IP_RATE_LIMITER.limit({
      key: clientIp,
    });
    if (!withinPerIpLimit) {
      return new Response("Too many requests", {
        status: 429,
        headers: corsHeaders(env),
      });
    }

    const counterId = env.DAILY_REQUEST_COUNTER.idFromName("global");
    const counter = env.DAILY_REQUEST_COUNTER.get(counterId);
    const { allowed } = await counter.incrementAndCheck(
      Number(env.DAILY_REQUEST_CAP),
    );
    if (!allowed) {
      return new Response("Daily request budget exhausted", {
        status: 429,
        headers: corsHeaders(env),
      });
    }

    let upstream: Response;
    try {
      upstream = await fetch(target.href, {
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(`Upstream fetch failed: ${message}`, {
        status: 502,
        headers: corsHeaders(env),
      });
    }

    const headers = new Headers(corsHeaders(env));
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
