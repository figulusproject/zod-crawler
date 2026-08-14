import { useState } from "react";
import { Info, X } from "lucide-react";

import { Button } from "#components/ui/button";

const WEB_DOCS_URL = "https://zodcrawler.figulus.dev/#/web";

export function BrowserOnlyBanner() {
  const [isHidden, setIsHidden] = useState(false);

  if (isHidden) return null;

  return (
    <div className="flex shrink-0 items-start gap-2 border-b bg-yellow-400 px-5 py-2 text-[13px] text-yellow-950 dark:bg-yellow-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-3" />
      <span>
        This demo runs entirely in your browser - nothing is uploaded, and a
        crawl does not survive a page refresh. Use the{" "}
        <a
          href={WEB_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-yellow-800"
        >
          self-hosted Web app
        </a>{" "}
        for crawls that need to keep running across a refresh.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        onClick={() => setIsHidden(true)}
        className="ml-auto shrink-0 hover:bg-yellow-500/70 hover:text-yellow-950 dark:hover:bg-yellow-700/60 dark:hover:text-yellow-950"
      >
        <X className="stroke-3" />
      </Button>
    </div>
  );
}
