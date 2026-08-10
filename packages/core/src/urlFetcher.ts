// Carries the HTTP status of a non-ok response, so a caller (e.g. the BullMQ queue) can tell a permanent failure (404, 403, ...) from a transient one (429, 5xx) without reparsing the message.
export class FetchHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FetchHttpError";
    this.status = status;
  }
}

// The default fetchOne: builds a URL from a template, or treats the id as an already-complete URL if no template was given.
export function createUrlFetcher(
  urlTemplate: string | undefined,
): (id: string) => Promise<unknown> {
  return async (id: string): Promise<unknown> => {
    const url = urlTemplate ? urlTemplate.replaceAll("{id}", id) : id;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(
        `Request to ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

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
  };
}
