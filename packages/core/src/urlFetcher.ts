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
      throw new Error(`${url}: ${response.status} ${response.statusText}`);
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
