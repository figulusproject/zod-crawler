import { afterEach, describe, expect, it, vi } from "vitest";
import { createUrlFetcher } from "./urlFetcher.js";

function jsonResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; statusText?: string },
) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    json: async () => body,
  } as Response;
}

describe("createUrlFetcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("substitutes {id} into the URL template", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const fetchOne = createUrlFetcher("https://example.com/books/{id}.json");
    await fetchOne("abc123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/books/abc123.json",
    );
  });

  it("uses the id verbatim as the URL when no template is given", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const fetchOne = createUrlFetcher(undefined);
    await fetchOne("https://example.com/direct.json");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/direct.json");
  });

  it("returns the parsed JSON body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ title: "Dune" })),
    );

    const fetchOne = createUrlFetcher(undefined);
    const result = await fetchOne("https://example.com/direct.json");

    expect(result).toEqual({ title: "Dune" });
  });

  it("throws with status info on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(null, { ok: false, status: 404, statusText: "Not Found" }),
      ),
    );

    const fetchOne = createUrlFetcher(undefined);
    await expect(fetchOne("https://example.com/missing.json")).rejects.toThrow(
      /404 Not Found/,
    );
  });

  it("wraps a rejected fetch() call with the URL for context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const fetchOne = createUrlFetcher(undefined);
    await expect(fetchOne("https://example.com/direct.json")).rejects.toThrow(
      /https:\/\/example\.com\/direct\.json.*network down/,
    );
  });
});
