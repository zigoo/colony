import type { GameState } from './types';

// Retained file handle so subsequent saves skip the picker dialog
let fileHandle: FileSystemFileHandle | null = null;

export const saveToFile = async (state: GameState): Promise<void> => {
  const json = JSON.stringify(state, null, 2);

  if ('showSaveFilePicker' in window) {
    try {
      if (!fileHandle) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `settlers-${Date.now()}.json`,
          types: [{ description: 'JSON save file', accept: { 'application/json': ['.json'] } }],
        });
      }
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e) {
      fileHandle = null;
      if ((e as DOMException).name !== 'AbortError') throw e;
    }
  } else {
    // Fallback for browsers without File System Access API
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `settlers-${Date.now()}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const resetSaveFileHandle = (): void => {
  fileHandle = null;
};

export const loadFromFile = async (): Promise<GameState> => {
  if ('showOpenFilePicker' in window) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON save file', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    // Remember handle so next Save overwrites the same file
    fileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    const state = JSON.parse(text) as GameState;
    if (!state.map || !state.map.tiles) throw new Error('Invalid save file');
    return state;
  } else {
    // Fallback
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { reject(new Error('No file selected')); return; }
        try {
          const text = await file.text();
          const state = JSON.parse(text) as GameState;
          if (!state.map || !state.map.tiles) throw new Error('Invalid save file');
          resolve(state);
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }
}
