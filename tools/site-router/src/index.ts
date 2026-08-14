const DOCS_PREFIX = "/docs";
const DEMO_PREFIX = "/demo";

// /docs served from ASSETS - Workers can't spoof Host to proxy GitHub Pages.
function docsAssetRequest(request: Request, path: string): Request | undefined {
  if (path !== DOCS_PREFIX && !path.startsWith(`${DOCS_PREFIX}/`)) {
    return undefined;
  }

  const assetPath = path.slice(DOCS_PREFIX.length) || "/";
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  return new Request(assetUrl, request);
}

// /demo proxies to Vercel's own domain - no Host-spoofing needed here,
// unlike /docs.
function demoRequest(
  request: Request,
  path: string,
  demoOrigin: string,
): Request | undefined {
  if (path !== DEMO_PREFIX && !path.startsWith(`${DEMO_PREFIX}/`)) {
    return undefined;
  }

  const upstreamPath = path.slice(DEMO_PREFIX.length) || "/";
  const target = new URL(upstreamPath, demoOrigin);
  target.search = new URL(request.url).search;
  return new Request(target, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const assetRequest = docsAssetRequest(request, url.pathname);
    if (assetRequest) {
      return env.ASSETS.fetch(assetRequest);
    }

    const demoReq = demoRequest(request, url.pathname, env.DEMO_ORIGIN);
    if (demoReq) {
      return fetch(demoReq);
    }

    return Response.redirect(env.REPO_URL, 301);
  },
} satisfies ExportedHandler<Env>;
