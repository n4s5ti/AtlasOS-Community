export interface ExactFileAdapter<TFileLike> {
  normalize(path: string): string;
  get(path: string): TFileLike | null;
  read(file: TFileLike): Promise<string>;
}

export async function readExactFile<TFileLike>(
  path: string,
  adapter: ExactFileAdapter<TFileLike>,
): Promise<string> {
  const normalized = adapter.normalize(path);
  if (normalized !== path || normalized.toLowerCase().split('/').includes('.obsidian')) {
    throw new Error('Authorized file not found');
  }
  const file = adapter.get(normalized);
  if (!file) throw new Error('Authorized file not found');
  return adapter.read(file);
}
