// src/utils/fileUtils.ts

import { promises as fs } from 'fs';
import path from 'path';

export async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw new Error(`Failed to read JSON file at ${filePath}: ${err}`);
  }
}
