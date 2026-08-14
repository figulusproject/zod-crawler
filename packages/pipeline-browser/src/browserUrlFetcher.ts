import { FetchHttpError } from "@zod-crawler/core";

export interface BrowserUrlFetcherOptions {
  urlTemplate: string | undefined;
  corsProxyUrl: string;
}

async function parseResponse(
  response: Response,
  url: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new FetchHttpError(
      `${url}: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      `${url}: response body wasn't valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

// A throw is the only proxy-retry trigger - browsers give no way to
// tell a CORS block from a plain network failure.
export function createBrowserUrlFetcher({
  urlTemplate,
  corsProxyUrl,
}: BrowserUrlFetcherOptions): (id: string) => Promise<unknown> {
  const proxiedOrigins = new Set<string>();

  function fetchViaProxy(url: string): Promise<Response> {
    return fetch(`${corsProxyUrl}?url=${encodeURIComponent(url)}`);
  }

  return async (id: string): Promise<unknown> => {
    const url = urlTemplate ? urlTemplate.replaceAll("{id}", id) : id;
    const origin = new URL(url).origin;

    if (proxiedOrigins.has(origin)) {
      return parseResponse(await fetchViaProxy(url), url);
    }

    let response: Response;
    try {
      response = await fetch(url);
    } catch (directError) {
      let proxyResponse: Response;
      try {
        proxyResponse = await fetchViaProxy(url);
      } catch (proxyError) {
        throw new Error(
          `Request to ${url} failed directly (${
            directError instanceof Error
              ? directError.message
              : String(directError)
          }) and via the CORS proxy (${
            proxyError instanceof Error
              ? proxyError.message
              : String(proxyError)
          })`,
          { cause: proxyError },
        );
      }
      proxiedOrigins.add(origin);
      return parseResponse(proxyResponse, url);
    }

    return parseResponse(response, url);
  };
}
