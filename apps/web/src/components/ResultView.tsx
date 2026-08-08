import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CrawlCompleteEvent } from "../../shared/events";

interface ResultViewProps {
  result: CrawlCompleteEvent;
}

export function ResultView({ result }: ResultViewProps) {
  const [copied, setCopied] = useState(false);
  const { failures, total } = result.validation;

  const handleCopy = () => {
    void navigator.clipboard.writeText(result.schema).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([result.schema], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.schemaName}.ts`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          {failures.length === 0
            ? `All ${total} sample(s) validated successfully.`
            : `${failures.length}/${total} sample(s) failed validation.`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </div>

      <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-4 font-mono text-xs">
        {result.schema}
      </pre>

      {failures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-destructive">
            Validation failures
          </h3>
          <ul className="flex flex-col gap-2 text-xs">
            {failures.map((failure) => (
              <li
                key={failure.id}
                className="rounded-md border border-destructive/30 p-2"
              >
                <div className="font-mono font-medium">{failure.id}</div>
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  {failure.error}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
