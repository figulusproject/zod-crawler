import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseIds } from "@/lib/parseIds";
import { MIN_DELAY_MS, type FormState } from "@/lib/formState";

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

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ids">Ids</Label>
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
