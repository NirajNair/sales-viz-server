import { strToU8, zipSync } from "fflate";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prettyFactory } from "pino-pretty";
import { config } from "../lib/config";
import { loggerWithContext } from "../lib/logger";

const prettifier = prettyFactory({
  colorize: false,
  translateTime: "SYS:standard",
  ignore: "pid,hostname",
  messageKey: "msg",
  timestampKey: "time",
});

export async function handleLogsExport() {
  try {
    const logDir = join(process.cwd(), config.logs.dir);
    const zipEntries: Record<string, Uint8Array> = {};
    const prettyLines: string[] = [];

    const entries = await readdir(logDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
      .map((entry) => entry.name);

    if (files.length === 0) {
      prettyLines.push("No log files found.");
    } else {
      for (const fileName of files) {
        const filePath = join(logDir, fileName);
        const data = await readFile(filePath);
        const content = new TextDecoder().decode(data);

        zipEntries[fileName] = data;
        prettyLines.push(`== ${fileName} ==`);

        for (const line of content.split(/\r?\n/u)) {
          if (!line.trim()) continue;

          try {
            const record = JSON.parse(line) as Record<string, unknown>;
            prettyLines.push(prettifier(record).trimEnd());
          } catch {
            prettyLines.push(line);
          }
        }
      }
    }

    zipEntries["logs.txt"] = strToU8(`${prettyLines.join("\n")}\n`);

    const zipData = zipSync(zipEntries, { level: 6 });
    const zipArrayBuffer = zipData.buffer.slice(
      zipData.byteOffset,
      zipData.byteOffset + zipData.byteLength,
    ) as ArrayBuffer;

    return new Response(zipArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="logs-export.zip"',
      },
    });
  } catch (error) {
    loggerWithContext.error({ error }, "Logs export failed");
    throw error instanceof Error ? error : new Error("Logs export failed");
  }
}
