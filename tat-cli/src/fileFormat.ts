import { parse as parseYaml } from 'yaml';

export const TAT_EXTENSIONS = ['.tat.json', '.tat.yml', '.tat.yaml'] as const;

/** Check whether a file path ends with a recognised TAT extension. */
export function isTatFile(filePath: string): boolean {
  return TAT_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/** Parse raw file content as JSON or YAML based on the file extension. */
export function parseFileContent(filePath: string, raw: string): unknown {
  if (filePath.endsWith('.tat.json')) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON in ${filePath}: ${(e as Error).message}`);
    }
  }

  if (filePath.endsWith('.tat.yml') || filePath.endsWith('.tat.yaml')) {
    try {
      return parseYaml(raw);
    } catch (e) {
      throw new Error(`Invalid YAML in ${filePath}: ${(e as Error).message}`);
    }
  }

  throw new Error(`Unsupported file format: ${filePath}`);
}
