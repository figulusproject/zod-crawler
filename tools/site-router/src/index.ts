const DOCS_PREFIX = "/docs";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const assetRequest = docsAssetRequest(request, url.pathname);

    if (assetRequest) {
      return env.ASSETS.fetch(assetRequest);
    }

    return Response.redirect(env.REPO_URL, 301);
  },
} satisfies ExportedHandler<Env>;
