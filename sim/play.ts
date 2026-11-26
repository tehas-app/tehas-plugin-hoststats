// Plays one scenario in a fresh process and prints the stub host's plan, as
// JSON. bin/sim runs it after each build, so the driver is always the latest.
import { load, play } from "./scenario.ts";

const name = process.argv[2] ?? "";
process.stdout.write(JSON.stringify(await play(load(name))));
