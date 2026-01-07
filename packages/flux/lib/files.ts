import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";

const LOCK_TIMEOUT = 5000;
const LOCK_RETRY_INTERVAL = 50;

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = `${filePath}.lock`;
  const startTime = Date.now();

  while (existsSync(lockPath)) {
    if (Date.now() - startTime > LOCK_TIMEOUT) {
      try {
        unlinkSync(lockPath);
      } catch {
        throw new Error(`Lock timeout for ${filePath}`);
      }
    }
    await new Promise((r) => setTimeout(r, LOCK_RETRY_INTERVAL));
  }

  try {
    await Bun.write(lockPath, String(process.pid));
    const result = await fn();
    return result;
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = join(dir, `.${Date.now()}.tmp`);
  await Bun.write(tmpPath, content);

  const { rename } = await import("fs/promises");
  await rename(tmpPath, filePath);
}

export async function readFileOrDefault(
  filePath: string,
  defaultContent: string,
): Promise<string> {
  if (!existsSync(filePath)) {
    return defaultContent;
  }
  return Bun.file(filePath).text();
}

export async function ensureFile(
  filePath: string,
  defaultContent: string,
): Promise<void> {
  if (!existsSync(filePath)) {
    await atomicWrite(filePath, defaultContent);
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
