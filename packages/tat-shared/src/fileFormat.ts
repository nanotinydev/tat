import { parse as parseYaml } from 'yaml';

export const TAT_EXTENSIONS = ['.tat.json', '.tat.yml', '.tat.yaml'] as const;

export function isTatFile(filePath: string): boolean {
  return TAT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

export function isYamlTatFile(filePath: string): boolean {
  return filePath.endsWith('.tat.yml') || filePath.endsWith('.tat.yaml');
}

export function parseTatFileContent(filePath: string, raw: string): unknown {
  if (filePath.endsWith('.tat.json')) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${filePath}: ${message}`);
    }
  }

  if (isYamlTatFile(filePath)) {
    try {
      return parseYaml(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid YAML in ${filePath}: ${message}`);
    }
  }

  throw new Error(`Unsupported file format: ${filePath}`);
}
