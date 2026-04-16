"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { performCalculation } = require("./lib/calculator");

const HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_SIZE = 10_000;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, fileContents) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found." });
        return;
      }

      sendJson(response, 500, { error: "Unable to load the application." });
      return;
    }

    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
    });
    response.end(fileContents);
  });
}

function resolveStaticFile(requestPath) {
  const relativePath =
    requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);
  const publicRelativePath = path.relative(PUBLIC_DIR, resolvedPath);

  if (
    publicRelativePath.startsWith("..") ||
    path.isAbsolute(publicRelativePath)
  ) {
    return null;
  }

  return resolvedPath;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }

      body += chunk;

      if (Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE) {
        settled = true;
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (settled) {
        return;
      }

      if (!body) {
        settled = true;
        resolve({});
        return;
      }

      try {
        settled = true;
        resolve(JSON.parse(body));
      } catch (error) {
        settled = true;
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", () => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error("Unable to read the request body."));
    });
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${HOST}`);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/calculate"
    ) {
      try {
        const payload = await readJsonBody(request);
        const result = performCalculation(payload);

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "Calculation failed.",
        });
      }

      return;
    }

    if (request.method === "GET") {
      const staticFile = resolveStaticFile(requestUrl.pathname);

      if (!staticFile) {
        sendJson(response, 404, { error: "Not found." });
        return;
      }

      sendFile(response, staticFile);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  });
}

function startServer(port = DEFAULT_PORT) {
  const server = createServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer()
    .then((server) => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
      console.log(`Calculator app running at http://${HOST}:${port}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

module.exports = {
  createServer,
  resolveStaticFile,
  startServer,
};
