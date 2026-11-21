/**
 * Сервер «Агентури» — інтерактивної лабораторії агентів. Запуск: npm run lab → http://localhost:4321
 *
 * Він робить лише дві речі:
 *   1. роздає сторінку уроку (папка lab/public);
 *   2. пересилає запити до справжньої моделі, якщо ти її підключив (див. providers.ts).
 *      Ключі з .env живуть тільки тут, у браузер вони не потрапляють.
 */
import { createServer, type IncomingMessage } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect, callModel } from "./providers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(here, "public");

if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
const PORT = Number(process.env.PORT ?? 4321);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// Запити до моделі приймаємо тільки від самої лабораторії.
// Інакше будь-який сайт, відкритий у браузері, міг би непомітно
// слати запити на localhost:4321 і витрачати твій платний ключ.
const OWN_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
function isFromLab(req: IncomingMessage): boolean {
  if (!OWN_HOSTS.has(req.headers.host ?? "")) return false;
  const origin = req.headers.origin;
  if (origin && !OWN_HOSTS.has(origin.replace(/^https?:\/\//, ""))) return false;
  // Простий cross-site POST не може поставити такий content-type без дозволу браузера
  return (req.headers["content-type"] ?? "").startsWith("application/json");
}

async function readBody(req: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

function sendJson(res: any, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost").pathname; // без ?query

    // Яка модель підключена (сторінка показує це під кодом)
    if (req.method === "GET" && url === "/api/status") {
      return sendJson(res, 200, await detect(true));
    }

    // Код уроку викликає model(...) → браузер шле переписку сюди → ми пересилаємо моделі
    if (req.method === "POST" && url === "/api/model") {
      if (!isFromLab(req)) return sendJson(res, 403, { error: "Запит не з лабораторії." });
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        const reply = await callModel({
          system: body.system,
          messages: body.messages ?? [],
          tools: body.tools,
        });
        return sendJson(res, 200, reply);
      } catch (err) {
        return sendJson(res, 200, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Усе інше — файли сторінки з lab/public
    const file = path.join(
      publicDir,
      url === "/" ? "index.html" : path.normalize(url).replace(/^([/\\])+/, ""),
    );
    const insidePublic = file === publicDir || file.startsWith(publicDir + path.sep);
    if (!insidePublic || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "text/plain" });
    res.end(readFileSync(file));
  } catch (err) {
    console.error(err); // подробиці — у термінал, а не в браузер
    res.writeHead(500);
    res.end("server error");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Агентура: http://localhost:${PORT}`));
