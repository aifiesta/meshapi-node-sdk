import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  target: "node18",
  treeshake: true,
  // `ws` is an optionalDependency, and tsup only externalises `dependencies`
  // and `peerDependencies` by default — so it was being inlined into the bundle.
  // In the ESM build that turned `await import("ws")` into esbuild's `__require`
  // shim, which throws `Dynamic require of "events" is not supported`, breaking
  // realtime on Node 18–21 even when `ws` is installed. Keep it a real runtime
  // import so Node resolves the installed package.
  external: ["ws"],
});
