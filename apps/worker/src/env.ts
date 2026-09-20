// Side-effect module: import it FIRST in the entry point so process.env is populated
// before any other module reads it. Loads the shared .env from the repo root; silent no-op
// when the file is absent (production sets real environment variables instead).
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
