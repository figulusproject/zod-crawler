import { z } from "zod";
import { emptyStringAsUndefined } from "zod-transformers";

// Evals inferSchema's generated source text in-process via new Function; tightly coupled to convertToZod's exact output shape, so pass the raw string, not a reformatted copy.
export function evalGeneratedSchema(
  source: string,
  schemaName: string,
): z.ZodTypeAny {
  const body = source
    .replace(/^import \{ z \} from 'zod';\n/, "")
    .replace(
      /^import \{ emptyStringAsUndefined \} from 'zod-transformers';\n/,
      "",
    )
    .replace(`export const ${schemaName} = `, `const ${schemaName} = `)
    .concat(`\nreturn ${schemaName};`);
  return new Function("z", "emptyStringAsUndefined", body)(
    z,
    emptyStringAsUndefined,
  );
}
