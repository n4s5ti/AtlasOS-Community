import { describe, expect, it, vi } from 'vitest';
import { readExactFile } from '../src/exact-file-reader';

interface FakeFile { path: string }

function harness(files: FakeFile[]) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const get = vi.fn((path: string) => byPath.get(path) ?? null);
  const read = vi.fn(async (file: FakeFile) => file.path);
  return {
    adapter: {
      normalize: (path: string) => path.replace('/./', '/'),
      get,
      read,
    },
    get,
    read,
  };
}

describe('readExactFile', () => {
  it('reads only the exact vault-relative path', async () => {
    const { adapter, get } = harness([
      { path: 'Atlas Apps/runtime-data.json' },
      { path: 'Other/runtime-data.json' },
    ]);

    await expect(readExactFile('Atlas Apps/runtime-data.json', adapter)).resolves.toBe(
      'Atlas Apps/runtime-data.json',
    );
    expect(get).toHaveBeenCalledWith('Atlas Apps/runtime-data.json');
    expect(get).not.toHaveBeenCalledWith('Other/runtime-data.json');
  });

  it('does not satisfy a grant by basename ambiguity', async () => {
    const { adapter } = harness([
      { path: 'Atlas Apps/runtime-data.json' },
      { path: 'Other/runtime-data.json' },
    ]);
    await expect(readExactFile('runtime-data.json', adapter)).rejects.toThrow(
      'Authorized file not found',
    );
  });

  it('rejects paths changed by normalization', async () => {
    const { adapter } = harness([{ path: 'Atlas Apps/runtime-data.json' }]);
    await expect(readExactFile('Atlas Apps/./runtime-data.json', adapter)).rejects.toThrow(
      'Authorized file not found',
    );
  });

  it('rejects .obsidian paths defensively', async () => {
    const { adapter } = harness([{ path: '.obsidian/plugins/data.json' }]);
    await expect(readExactFile('.obsidian/plugins/data.json', adapter)).rejects.toThrow(
      'Authorized file not found',
    );
  });

  it('rejects case-variant .obsidian paths', async () => {
    const { adapter } = harness([{ path: '.Obsidian/plugins/data.json' }]);
    await expect(readExactFile('.Obsidian/plugins/data.json', adapter)).rejects.toThrow(
      'Authorized file not found',
    );
  });

});
