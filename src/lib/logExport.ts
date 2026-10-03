import type { AppLogs } from "./types.ts";

export function buildLogExport(appName: string, lines: AppLogs["lines"], savedAt = new Date()) {
  let name = appName.replace(/[<>:"/\\|?*]|\p{Cc}/gu, "").trim().replace(/[. ]+$/, "");
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(name)) name = `app-${name}`;
  name = Array.from(name).slice(0, 80).join("").replace(/[. ]+$/, "") || "application";
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${savedAt.getFullYear()}${pad(savedAt.getMonth() + 1)}${pad(savedAt.getDate())}-${pad(savedAt.getHours())}${pad(savedAt.getMinutes())}${pad(savedAt.getSeconds())}`;
  const text = lines.map(line => {
    const at = new Date(line.at);
    const timestamp = Number.isNaN(at.getTime()) ? `원본 시간(시간대 미확인): ${line.at}` : at.toISOString();
    return `[${timestamp}] ${line.message.replace(/\r\n|\r|\n/g, "\r\n")}`;
  }).join("\r\n");
  return {
    filename: `${name}_${time}.txt`,
    blob: new Blob(["\uFEFF", text, text ? "\r\n" : ""], { type: "text/plain;charset=utf-8" }),
  };
}