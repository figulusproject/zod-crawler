import { useRef, useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "#components/ui/button";
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import { Switch } from "#components/ui/switch";
import { Textarea } from "#components/ui/textarea";
import { parseIds } from "./parse-ids.js";
import { MIN_DELAY_MS, type FormState } from "./crawl-types.js";
import {
  crawlCandidatesFormatFromExtension,
  idsParsers,
} from "@zod-crawler/core/crawlCandidateFormats";

interface CrawlFormProps {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  disabled: boolean;
}

export function CrawlForm({
  form,
  onChange,
  onSubmit,
  disabled,
}: CrawlFormProps) {
  const idCount = parseIds(form.idsText).length;
  const urlTemplateInvalid =
    form.urlTemplate.trim().length > 0 && !form.urlTemplate.includes("{id}");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const format = crawlCandidatesFormatFromExtension(file.name);
    if (format === undefined) {
      setUploadError(
        `Unsupported file type "${file.name}" - expected .txt, .json, .yaml/.yml, or .csv.`,
      );
      return;
    }

    try {
      const text = await file.text();
      const uploadedIds = idsParsers[format](text);
      onChange({
        idsText: parseIds([form.idsText, ...uploadedIds].join("\n")).join("\n"),
      });
      setUploadError(null);
    } catch (error) {
      setUploadError(
        `Could not parse "${file.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ids">Ids</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="size-4" />
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.json,.yaml,.yml,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        <Textarea
          id="ids"
          rows={6}
          placeholder={"one-id-per-line\nor-comma,separated,ids"}
          value={form.idsText}
          onChange={(event) => onChange({ idsText: event.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {idCount} unique id{idCount === 1 ? "" : "s"}
        </p>
        {uploadError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {uploadError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="urlTemplate">URL template (optional)</Label>
        <Input
          id="urlTemplate"
          placeholder="https://example.com/items/{id}"
          value={form.urlTemplate}
          onChange={(event) => onChange({ urlTemplate: event.target.value })}
          disabled={disabled}
          aria-invalid={urlTemplateInvalid}
        />
        <p className="text-xs text-muted-foreground">
          Must contain the literal <code>{"{id}"}</code> placeholder. Leave
          blank to treat each id as a complete URL.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delayMs">Delay between fetches (ms)</Label>
          <Input
            id="delayMs"
            type="number"
            min={MIN_DELAY_MS}
            step={1}
            value={form.delayMs}
            onChange={(event) => onChange({ delayMs: event.target.value })}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schemaName">Schema name</Label>
          <Input
            id="schemaName"
            value={form.schemaName}
            onChange={(event) => onChange({ schemaName: event.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="emitCrawlCandidates"
          checked={form.emitCrawlCandidates}
          onCheckedChange={(checked) =>
            onChange({ emitCrawlCandidates: checked })
          }
          disabled={disabled}
        />
        <Label htmlFor="emitCrawlCandidates">Find crawl candidates</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="useZodTransformers"
          checked={form.useZodTransformers}
          onCheckedChange={(checked) =>
            onChange({ useZodTransformers: checked })
          }
          disabled={disabled}
        />
        <Label htmlFor="useZodTransformers">Use zod-transformers imports</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="stopOnError"
          checked={form.stopOnError}
          onCheckedChange={(checked) => onChange({ stopOnError: checked })}
          disabled={disabled}
        />
        <Label htmlFor="stopOnError">Stop crawl on first failed fetch</Label>
      </div>

      <Button
        type="submit"
        disabled={disabled || idCount === 0 || urlTemplateInvalid}
      >
        Start crawl
      </Button>
    </form>
  );
}
