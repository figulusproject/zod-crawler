import { UNION_KEY, isUnionNode } from "./unionNode.js";
import { classifyRawString } from "./rawValueToSchemaJson.js";

// ============ Zod Generation (Combined) ============

// Tracks which shared helper schemas the current generateZodSchema pass used, so convertToZod only prepends the ones needed; reset each convertToZod call.
let usedHelpers = new Set<
  | "strOrUndefined"
  | "multiOrSingleCoerceDate"
  | "intOrUndefined"
  | "bigintOrUndefined"
>();

const STR_OR_UNDEFINED_DECL = `const strOrUndefined = z
  .union([z.string().min(1), z.string().length(0).transform(() => undefined)])
  .optional();
`;

const STR_OR_UNDEFINED_PACKAGE_DECL = `const strOrUndefined = emptyStringAsUndefined(
  z.string().min(1),
).optional();
`;

// Falls through to plain z.coerce.date() for ordinary values; parsed type is `Date | Date[] | undefined` since the underlying data can genuinely contain multiple years.
const MULTI_OR_SINGLE_COERCE_DATE_DECL = `const multiOrSingleCoerceDate = z.union([
  z
    .string()
    .regex(/^\\d{4}(?:(?:,\\s*|\\s+)\\d{4})+$/)
    .transform((value) =>
      value
        .replaceAll(/,\\s*|\\s+/g, ",")
        .split(",")
        .map((year) => new Date(year)),
    ),
  z.coerce.date(),
  z.string().length(0).transform(() => undefined),
]);
`;

const MULTI_OR_SINGLE_COERCE_DATE_PACKAGE_DECL = `const multiOrSingleCoerceDate = emptyStringAsUndefined(
  z.union([
    z
      .string()
      .regex(/^\\d{4}(?:(?:,\\s*|\\s+)\\d{4})+$/)
      .transform((value) =>
        value
          .replaceAll(/,\\s*|\\s+/g, ",")
          .split(",")
          .map((year) => new Date(year)),
      ),
    z.coerce.date(),
  ]),
);
`;

// The empty-string branch must come first: unlike z.coerce.date(), z.coerce.number() treats "" as 0 (Number("") === 0), so the number branch would swallow it otherwise.
const INT_OR_UNDEFINED_DECL = `const intOrUndefined = z.union([
  z.string().length(0).transform(() => undefined),
  z.coerce.number().int(),
]).optional();
`;

const INT_OR_UNDEFINED_PACKAGE_DECL = `const intOrUndefined = emptyStringAsUndefined(
  z.coerce.number().int(),
).optional();
`;

// Same shape as intOrUndefined, for integer-shaped strings that can exceed Number.MAX_SAFE_INTEGER; empty string goes first since BigInt("") is also silently 0n.
const BIGINT_OR_UNDEFINED_DECL = `const bigintOrUndefined = z.union([
  z.string().length(0).transform(() => undefined),
  z.coerce.bigint(),
]);
`;

const BIGINT_OR_UNDEFINED_PACKAGE_DECL = `const bigintOrUndefined = emptyStringAsUndefined(
  z.coerce.bigint(),
);
`;

function buildHelperPreamble(
  used: Set<
    | "strOrUndefined"
    | "multiOrSingleCoerceDate"
    | "intOrUndefined"
    | "bigintOrUndefined"
  >,
  useZodTransformers: boolean,
): string {
  if (used.size === 0) return "";
  const decls: string[] = [];
  if (used.has("strOrUndefined")) {
    decls.push(
      useZodTransformers
        ? STR_OR_UNDEFINED_PACKAGE_DECL
        : STR_OR_UNDEFINED_DECL,
    );
  }
  if (used.has("multiOrSingleCoerceDate")) {
    decls.push(
      useZodTransformers
        ? MULTI_OR_SINGLE_COERCE_DATE_PACKAGE_DECL
        : MULTI_OR_SINGLE_COERCE_DATE_DECL,
    );
  }
  if (used.has("intOrUndefined")) {
    decls.push(
      useZodTransformers
        ? INT_OR_UNDEFINED_PACKAGE_DECL
        : INT_OR_UNDEFINED_DECL,
    );
  }
  if (used.has("bigintOrUndefined")) {
    decls.push(
      useZodTransformers
        ? BIGINT_OR_UNDEFINED_PACKAGE_DECL
        : BIGINT_OR_UNDEFINED_DECL,
    );
  }
  return decls.join("\n") + "\n";
}

export function convertToZod({
  input,
  schemaName = "schema",
  useZodTransformers = false,
}: {
  input: string;
  schemaName?: string;
  useZodTransformers?: boolean;
}): string | undefined {
  try {
    const data = JSON.parse(input);
    usedHelpers = new Set();
    const schema = generateZodSchema(data, 0);
    let result = "import { z } from 'zod';\n";
    if (useZodTransformers && usedHelpers.size > 0) {
      result += "import { emptyStringAsUndefined } from 'zod-transformers';\n";
    }
    result += "\n";
    result += buildHelperPreamble(usedHelpers, useZodTransformers);
    result += `export const ${schemaName} = ${schema};`;
    return result;
  } catch (error) {
    console.error(
      "Error: " + (error instanceof Error ? error.message : "Unknown error"),
    );
    return undefined;
  }
}

export function generateZodSchema(value: unknown, indent: number): string {
  const spaces = "  ".repeat(indent);
  const nextSpaces = "  ".repeat(indent + 1);

  if (value === null) {
    return "z.null()";
  }

  if (isUnionNode(value)) {
    const schemas = [
      ...new Set(value[UNION_KEY].map((alt) => generateZodSchema(alt, indent))),
    ];
    if (schemas.length === 1) return schemas[0];
    return `z.union([${schemas.join(", ")}])`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "z.array(z.unknown())";
    }
    const itemTypes = value.map((v) => typeof v);
    const uniqueTypes = [...new Set(itemTypes)];

    if (uniqueTypes.length === 1) {
      const itemSchema = generateZodSchema(value[0], indent);
      return `z.array(${itemSchema})`;
    } else {
      const schemas = [
        ...new Set(value.map((v) => generateZodSchema(v, indent))),
      ];
      return `z.array(z.union([${schemas.join(", ")}]))`;
    }
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "z.object({})";
    }

    let objectSchema = "z.object({\n";
    entries.forEach(([key, val], idx) => {
      const propSchema = generateZodSchema(val, indent + 1);

      const formatKey = () => {
        const cleanKey = key.endsWith("?") ? key.slice(0, -1) : key;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanKey)) return cleanKey;
        return `"${cleanKey}"`;
      };

      const isOptional = key.endsWith("?");

      let fieldDef: string;
      if (isOptional && propSchema === "z.string()") {
        // A plain optional string field treats "" the same as absent; enums, literals, urls, uuids etc. keep their own validation and a normal .optional().
        usedHelpers.add("strOrUndefined");
        fieldDef = "strOrUndefined";
      } else if (isOptional) {
        fieldDef = `${propSchema}.optional()`;
      } else {
        fieldDef = propSchema;
      }

      objectSchema += `${nextSpaces}${formatKey()}: ${fieldDef}`;
      objectSchema += idx < entries.length - 1 ? ",\n" : "\n";
    });
    objectSchema += `${spaces}})`;

    return objectSchema;
  }

  // Primitive type handling
  if (typeof value === "number") {
    return Number.isInteger(value) ? "z.int()" : "z.number()";
  }

  if (typeof value === "boolean") {
    return "z.boolean()";
  }

  if (typeof value === "string") {
    // The payload after the prefix is exactly what JSON.stringify produced when the tag was built, so it's valid JS syntax already and can be spliced in with no re-quoting.
    if (value.startsWith('literal-"') && value.endsWith('"')) {
      const literalCode = value.slice("literal-".length);
      return `z.literal(${literalCode})`;
    }

    if (value === "multi.coerce.date") {
      usedHelpers.add("multiOrSingleCoerceDate");
      return "multiOrSingleCoerceDate";
    }

    if (value === "coerce.int.or.empty") {
      usedHelpers.add("intOrUndefined");
      return "intOrUndefined";
    }

    if (value === "coerce.bigint.or.empty") {
      usedHelpers.add("bigintOrUndefined");
      return "bigintOrUndefined";
    }

    if (value.startsWith('startsWith-"') && value.endsWith('"')) {
      const prefixCode = value.slice("startsWith-".length);
      return `z.string().startsWith(${prefixCode})`;
    }

    if (value.startsWith("enum-[") && value.endsWith("]")) {
      const enumArrayCode = value.slice("enum-".length);
      // Values were already lowercased by resolveStringFieldSchema; normalize the input the same way so case variants not seen in this sample still validate.
      return `z.string().toLowerCase().pipe(z.enum(${enumArrayCode}))`;
    }

    // Map standard types (Zod v4)
    const typeMap: Record<string, string> = {
      string: "z.string()",
      int: "z.int()",
      number: "z.number()",
      boolean: "z.boolean()",
      url: "z.url()",
      uuid: "z.uuid()",
      email: "z.email()",
      unknown: "z.unknown()",
      null: "z.null()",
      "coerce.date": "z.coerce.date()",
      "coerce.int": "z.coerce.number().int()",
      "coerce.bigint": "z.coerce.bigint()",
    };

    if (typeMap[value]) {
      return typeMap[value];
    }

    // Shared with rawValueToSchemaJson so both directions of the pipeline classify raw string values identically.
    return typeMap[classifyRawString(value)] ?? "z.string()";
  }

  return "z.unknown()";
}
