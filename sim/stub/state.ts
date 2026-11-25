// What the stub saw, for the simulator and the tests to read.
// TODO(#3297): goes with the stub.
export const stand = {
  files: new Map<string, Uint8Array>(),
  logs: [] as string[],
  /** A reason to refuse every write with, or null. */
  refuseWrites: null as string | null,
  /** The run's grants in place of the manifest's, or null. */
  asks: null as string[] | null,
  reset() {
    this.files.clear();
    this.logs.length = 0;
    this.refuseWrites = null;
    this.asks = null;
  },
};
