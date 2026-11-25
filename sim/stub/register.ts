// Puts the stub behind the driver: `tehas` resolves to stub/tehas.ts. Loaded
// with node --import by bin/test and bin/sim. TODO(#3297): goes with the stub.
import { register } from "node:module";

register(new URL("./resolve.js", import.meta.url));
