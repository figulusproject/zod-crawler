export interface FetchProgressEvent {
  id: string;
  index: number;
  total: number;
  status: "cached" | "fetching" | "done" | "error";
  error?: string;
}
