import { defineConfig, type Plugin } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";

/** Dev only: POST /__snap?name=x with a PNG data URL saves it to .snaps/ for automated playtest review. */
const snaps = (): Plugin => ({
  name: "snaps",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__snap", (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "snap";
        mkdirSync(".snaps", { recursive: true });
        writeFileSync(`.snaps/${name.replace(/[^\w-]/g, "")}.png`, Buffer.from(body.split(",")[1], "base64"));
        res.end("ok");
      });
    });
  },
});

// Relative base so the build runs from any GitHub Pages subpath.
export default defineConfig({
  base: "./",
  server: { port: 5173 },
  plugins: [snaps()],
});
