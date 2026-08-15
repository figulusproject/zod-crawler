# Demo

A browser-only version of [`zod-crawler`](cli.md)'s crawl pipeline - same form and the same generated schema/validation output as [Web](web.md), but the fetch/infer/validate run happens in a Web Worker in your browser instead of on a server. Nothing is uploaded, and a crawl doesn't survive a page refresh (no job registry to reconnect to, unlike [Web](web.md)).

## Usage

Open [zodcrawler.figulus.dev/demo](https://zodcrawler.figulus.dev/demo), fill in ids, a URL template, and a few flags, and submit - same flow as [Web](web.md#usage), minus the terminal or Docker container.

## Direct fetches and CORS

Fetches run straight from your browser to whatever API you point at. If that API doesn't send CORS headers allowing your origin, the demo automatically retries the failed request through a rate-limited proxy instead of failing the crawl.

For a crawl that needs to keep running across a page refresh, or that hits an API you'd rather not route through a third-party proxy at all, use the self-hosted [Web](web.md) app instead.
