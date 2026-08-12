import { createApp } from "./app.js";
import { resumeActiveCrawls } from "./crawlJobs.js";

const port = Number(process.env.PORT) || 3000;

async function main(): Promise<void> {
  await resumeActiveCrawls();
  createApp().listen(port, () => {
    console.log(`zod-crawler web listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
