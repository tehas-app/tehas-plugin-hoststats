// The host functions this driver calls, typed as spec v2 rev 8 part 5 gives
// them. TODO(#3297): delete this file and use the tehas.d.ts generated from
// the tehas:plugin WIT world (`jco guest-types`). It is a stand-in: it
// declares nothing the driver does not call.
declare module "tehas" {
  export const fs: {
    /** Reads a whole file under a granted root. Throws when refused or missing. */
    read(path: string): Uint8Array;
    /** Writes a whole file: `/out` always, `/state` with `keep`. Throws when refused. */
    write(path: string, data: Uint8Array): void;
  };
  /** One line to the run's log. */
  export function log(line: string): void;
}
