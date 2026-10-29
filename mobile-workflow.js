const INVALID_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function sanitizeFileName(value, fallback = 'pagina.jpg') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(INVALID_FILE_CHARS, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function createCaptureFileName(sequence) {
  const number = Math.max(1, Number(sequence) || 1);
  return `pagina_${String(number).padStart(3, '0')}.jpg`;
}

export function shouldOpenEditorAfterImport({ mobile, explicitEdit = false }) {
  return !mobile || explicitEdit;
}

export function preferredPdfSaveMethod({ secureContext, hasSavePicker }) {
  return secureContext && hasSavePicker ? 'picker' : 'download';
}

export function isPageSequenceCurrent(pages, expectedIds) {
  return pages.length === expectedIds.length
    && pages.every((page, index) => page.id === expectedIds[index]);
}

export function createCameraOpenGate() {
  let generation = 0;
  let cancelled = true;
  return {
    begin() {
      cancelled = false;
      return ++generation;
    },
    cancel() {
      cancelled = true;
      generation += 1;
    },
    canUse(token, { exporting = false } = {}) {
      return token === generation && !cancelled && !exporting;
    },
  };
}

export async function writeBlobToFileHandle(handle, blob) {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.();
    } catch (_) {
      // Conservar el error original de escritura/cierre
    }
    throw error;
  }
}
