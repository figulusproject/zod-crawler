export const SCHEMA_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const DEFAULT_DELAY_MS = 7500;
export const DEFAULT_SCHEMA_NAME = "InferredSchema";
// Only meaningful alongside a Redis URL (BullMQ-backed queuing); the default sequential queue ignores it.
export const DEFAULT_CONCURRENCY = 1;
