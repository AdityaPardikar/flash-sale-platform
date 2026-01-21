import { promises as fs } from 'fs';
import path from 'path';
import Redis from 'ioredis';

export type LuaScriptName = 'decrementInventory' | 'reserveInventory' | 'releaseReservation';
export type LoadedLuaScript = {
  sha?: string;
  inline: string;
};

export type LuaScriptMap = Record<LuaScriptName, LoadedLuaScript>;

const SCRIPT_FILENAMES: Record<LuaScriptName, string> = {
  decrementInventory: 'decrementInventory.lua',
  reserveInventory: 'reserveInventory.lua',
  releaseReservation: 'releaseReservation.lua',
};

async function loadScript(
  redis: Redis,
  scriptName: LuaScriptName,
  scriptPath: string
): Promise<LoadedLuaScript> {
  const content = await fs.readFile(scriptPath, 'utf-8');
  try {
    const sha = await redis.script('load' as any, content);
    return { sha: String(sha), inline: content };
  } catch (error) {
    console.warn(`Lua script load fallback for ${scriptName}:`, (error as Error).message);
    return { sha: undefined, inline: content };
  }
}

export async function loadLuaScripts(redis: Redis): Promise<LuaScriptMap> {
  const basePath = path.join(__dirname, 'lua');

  const entries = await Promise.all(
    (Object.keys(SCRIPT_FILENAMES) as LuaScriptName[]).map(async (name) => {
      const scriptPath = path.join(basePath, SCRIPT_FILENAMES[name]);
      const sha = await loadScript(redis, name, scriptPath);
      return [name, sha] as [LuaScriptName, LoadedLuaScript];
    })
  );

  return Object.fromEntries(entries) as LuaScriptMap;
}
