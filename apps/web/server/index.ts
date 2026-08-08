import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`zod-crawler web listening on port ${port}`);
});
