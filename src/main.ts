import './style.css';
import {
  contrastRatio,
  evaluateWcag,
  formatHsl,
  formatRgb,
  parseHex,
  rgbToHex,
  rgbToHsl,
} from './core/color';
import { generateCssVariables, paletteToJson } from './core/export';
import { decodeImageFile, validateImageFile } from './core/image';
import { extractPalette } from './core/palette';

const MAX_COLORS = 8;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const els = {
  dropZone: byId<HTMLButtonElement>('drop-zone'),
  dropHint: byId<HTMLElement>('drop-hint'),
  dropPreview: byId<HTMLElement>('drop-preview'),
  thumb: byId<HTMLImageElement>('thumb'),
  thumbMeta: byId<HTMLElement>('thumb-meta'),
  fileInput: byId<HTMLInputElement>('file-input'),
  imageStatus: byId<HTMLElement>('image-status'),
  clearImage: byId<HTMLButtonElement>('clear-image'),
  manualColor: byId<HTMLInputElement>('manual-color'),
  manualHex: byId<HTMLInputElement>('manual-hex'),
  addColor: byId<HTMLButtonElement>('add-color'),
  manualError: byId<HTMLElement>('manual-error'),
  paletteList: byId<HTMLUListElement>('palette-list'),
  paletteStatus: byId<HTMLElement>('palette-status'),
  paletteEmpty: byId<HTMLElement>('palette-empty'),
  clearPalette: byId<HTMLButtonElement>('clear-palette'),
  fgColor: byId<HTMLInputElement>('fg-color'),
  fgHex: byId<HTMLInputElement>('fg-hex'),
  fgError: byId<HTMLElement>('fg-error'),
  bgColor: byId<HTMLInputElement>('bg-color'),
  bgHex: byId<HTMLInputElement>('bg-hex'),
  bgError: byId<HTMLElement>('bg-error'),
  contrastRatio: byId<HTMLElement>('contrast-ratio'),
  wcagBadges: byId<HTMLUListElement>('wcag-badges'),
  sampleNormal: byId<HTMLElement>('sample-normal'),
  sampleLarge: byId<HTMLElement>('sample-large'),
  cssOutput: byId<HTMLTextAreaElement>('css-output'),
  jsonOutput: byId<HTMLTextAreaElement>('json-output'),
  copyCss: byId<HTMLButtonElement>('copy-css'),
  copyJson: byId<HTMLButtonElement>('copy-json'),
  copyStatus: byId<HTMLElement>('copy-status'),
};

// --- State -------------------------------------------------------------------

interface LoadedImage {
  objectUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  extractWidth: number;
  extractHeight: number;
}

let palette: string[] = [];
let fg = '#ffffff';
let bg = '#0b0f14';
let editingIndex: number | null = null;
let image: LoadedImage | null = null;

// --- Small helpers -----------------------------------------------------------

function setInputValue(input: HTMLInputElement, value: string): void {
  if (input.value !== value) input.value = value;
}

function showError(el: HTMLElement, message: string): void {
  el.textContent = message;
  el.hidden = false;
}

function hideError(el: HTMLElement): void {
  el.hidden = true;
  el.textContent = '';
}

function setStatus(el: HTMLElement, message: string, invalid = false): void {
  el.textContent = message;
  el.classList.toggle('invalid', invalid);
}

// --- Clipboard ---------------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function copyWithFeedback(
  text: string,
  button: HTMLButtonElement,
  label: string,
): Promise<void> {
  const ok = await copyText(text);
  button.textContent = ok ? 'Copied!' : 'Copy failed';
  els.copyStatus.textContent = ok ? 'Copied to clipboard.' : 'Copy failed.';
  window.setTimeout(() => {
    button.textContent = label;
  }, 1200);
}

function bindCopy(button: HTMLButtonElement, getText: () => string): void {
  const label = button.textContent ?? 'Copy';
  button.addEventListener('click', () => {
    void copyWithFeedback(getText(), button, label);
  });
}

// --- Rendering: image --------------------------------------------------------

function renderImage(): void {
  if (!image) {
    els.dropHint.hidden = false;
    els.dropPreview.hidden = true;
    els.clearImage.hidden = true;
    return;
  }
  els.dropHint.hidden = true;
  els.dropPreview.hidden = false;
  els.thumb.src = image.objectUrl;
  els.thumbMeta.textContent = `${image.sourceWidth}×${image.sourceHeight} → extracted at ${image.extractWidth}×${image.extractHeight}`;
  els.clearImage.hidden = false;
}

async function handleFile(file: File): Promise<void> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    setStatus(els.imageStatus, validation.message, true);
    return;
  }
  setStatus(els.imageStatus, 'Decoding image…');
  const result = await decodeImageFile(file);
  if (!result.ok) {
    setStatus(els.imageStatus, result.message, true);
    return;
  }
  if (image) URL.revokeObjectURL(image.objectUrl);
  image = {
    objectUrl: result.image.objectUrl,
    sourceWidth: result.image.sourceWidth,
    sourceHeight: result.image.sourceHeight,
    extractWidth: result.image.width,
    extractHeight: result.image.height,
  };
  renderImage();

  const extracted = extractPalette(result.image.pixels, MAX_COLORS);
  if (extracted.length === 0) {
    setStatus(els.imageStatus, 'No distinct colors found in the image.');
    return;
  }
  let added = 0;
  for (const color of extracted) {
    if (!palette.includes(color.hex)) {
      palette.push(color.hex);
      added += 1;
    }
  }
  setStatus(
    els.imageStatus,
    added > 0
      ? `Extracted ${extracted.length} color${extracted.length === 1 ? '' : 's'} (${added} new).`
      : 'Palette already contains all extracted colors.',
  );
  renderPalette();
}

// --- Rendering: palette ------------------------------------------------------

function refreshPressedStates(): void {
  const buttons = els.paletteList.querySelectorAll<HTMLButtonElement>('button[data-role]');
  for (const button of buttons) {
    const hex = button.dataset.hex ?? '';
    const pressed = button.dataset.role === 'fg' ? fg === hex : bg === hex;
    button.setAttribute('aria-pressed', String(pressed));
  }
}

function buildValueRow(value: string, copyLabel: string): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'value-row';
  const code = document.createElement('code');
  code.textContent = value;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.className = 'copy-value';
  copy.setAttribute('aria-label', `Copy ${copyLabel}: ${value}`);
  copy.addEventListener('click', () => {
    void copyWithFeedback(value, copy, 'Copy');
  });
  row.append(code, copy);
  return row;
}

function buildSwatchEditor(li: HTMLElement, index: number, hex: string): void {
  const block = document.createElement('div');
  block.className = 'swatch-color';
  block.style.background = hex;

  const row = document.createElement('div');
  row.className = 'edit-row';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = hex;
  colorInput.setAttribute('aria-label', `Edit color ${hex}`);

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = hex;
  textInput.spellcheck = false;
  textInput.autocomplete = 'off';
  textInput.className = 'mono';
  textInput.setAttribute('aria-label', `Hex value for color ${hex}`);
  textInput.setAttribute('aria-describedby', `swatch-error-${index}`);

  const error = document.createElement('p');
  error.id = `swatch-error-${index}`;
  error.className = 'error';
  error.hidden = true;

  const invalidMessage = 'Enter a hex color like #1a2b3c or #abc.';

  const applyDraft = (value: string): void => {
    block.style.background = value;
    setInputValue(colorInput, value);
  };

  colorInput.addEventListener('input', () => {
    hideError(error);
    textInput.value = colorInput.value;
    applyDraft(colorInput.value);
  });

  textInput.addEventListener('input', () => {
    const rgb = parseHex(textInput.value);
    if (rgb) {
      hideError(error);
      applyDraft(rgbToHex(rgb));
    } else {
      showError(error, invalidMessage);
    }
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    const rgb = parseHex(textInput.value);
    if (!rgb) {
      showError(error, invalidMessage);
      textInput.focus();
      return;
    }
    const updated = rgbToHex(rgb);
    palette[index] = updated;
    editingIndex = null;
    setPaletteStatus(`Updated ${updated}.`);
    renderPalette();
    renderContrast();
    refreshPressedStates();
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    editingIndex = null;
    renderPalette();
  });

  row.append(colorInput, textInput, save, cancel);
  li.append(block, row, error);
}

function buildSwatchDisplay(li: HTMLElement, index: number, hex: string): void {
  const rgb = parseHex(hex);
  if (!rgb) return;
  const hexText = rgbToHex(rgb);

  const block = document.createElement('div');
  block.className = 'swatch-color';
  block.style.background = hexText;

  const values = document.createElement('ul');
  values.className = 'swatch-values';
  values.append(
    buildValueRow(hexText, `HEX ${hexText}`),
    buildValueRow(formatRgb(rgb), `RGB ${formatRgb(rgb)}`),
    buildValueRow(formatHsl(rgbToHsl(rgb)), `HSL ${formatHsl(rgbToHsl(rgb))}`),
  );

  const actions = document.createElement('div');
  actions.className = 'swatch-actions';

  const fgButton = document.createElement('button');
  fgButton.type = 'button';
  fgButton.textContent = 'FG';
  fgButton.dataset.role = 'fg';
  fgButton.dataset.hex = hexText;
  fgButton.setAttribute('aria-pressed', String(fg === hexText));
  fgButton.setAttribute('aria-label', `Use ${hexText} as foreground color`);
  fgButton.title = 'Use as foreground (text) color';
  fgButton.addEventListener('click', () => {
    fg = hexText;
    renderContrast();
    refreshPressedStates();
  });

  const bgButton = document.createElement('button');
  bgButton.type = 'button';
  bgButton.textContent = 'BG';
  bgButton.dataset.role = 'bg';
  bgButton.dataset.hex = hexText;
  bgButton.setAttribute('aria-pressed', String(bg === hexText));
  bgButton.setAttribute('aria-label', `Use ${hexText} as background color`);
  bgButton.title = 'Use as background color';
  bgButton.addEventListener('click', () => {
    bg = hexText;
    renderContrast();
    refreshPressedStates();
  });

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.setAttribute('aria-label', `Edit color ${hexText}`);
  edit.addEventListener('click', () => {
    editingIndex = index;
    renderPalette();
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', `Remove color ${hexText}`);
  remove.addEventListener('click', () => {
    palette.splice(index, 1);
    if (editingIndex === index) editingIndex = null;
    else if (editingIndex !== null && editingIndex > index) editingIndex -= 1;
    setPaletteStatus(`Removed ${hexText}.`);
    renderPalette();
    renderContrast();
    refreshPressedStates();
  });

  actions.append(fgButton, bgButton, edit, remove);
  li.append(block, values, actions);
}

function renderPalette(): void {
  const items = palette.map((hex, index) => {
    const li = document.createElement('li');
    li.className = 'swatch';
    if (index === editingIndex) buildSwatchEditor(li, index, hex);
    else buildSwatchDisplay(li, index, hex);
    return li;
  });
  els.paletteList.replaceChildren(...items);
  els.paletteEmpty.hidden = palette.length > 0;
  els.clearPalette.disabled = palette.length === 0;
  renderExports();
}

function setPaletteStatus(message: string, invalid = false): void {
  setStatus(els.paletteStatus, message, invalid);
}

// --- Rendering: contrast -----------------------------------------------------

function renderBadges(ratio: number): void {
  const evaluation = evaluateWcag(ratio);
  const entries: Array<[string, boolean]> = [
    ['AA · normal', evaluation.aaNormal],
    ['AA · large', evaluation.aaLarge],
    ['AAA · normal', evaluation.aaaNormal],
    ['AAA · large', evaluation.aaaLarge],
  ];
  const items = entries.map(([label, pass]) => {
    const li = document.createElement('li');
    li.className = `badge ${pass ? 'pass' : 'fail'}`;
    const name = document.createElement('span');
    name.className = 'badge-name';
    name.textContent = label;
    const result = document.createElement('span');
    result.className = 'badge-result';
    result.textContent = pass ? 'pass' : 'fail';
    li.append(name, result);
    return li;
  });
  els.wcagBadges.replaceChildren(...items);
}

function renderContrast(): void {
  setInputValue(els.fgColor, fg);
  setInputValue(els.bgColor, bg);
  setInputValue(els.fgHex, fg);
  setInputValue(els.bgHex, bg);
  hideError(els.fgError);
  hideError(els.bgError);

  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  if (!fgRgb || !bgRgb) {
    els.contrastRatio.textContent = '—';
    renderBadges(0);
    return;
  }

  const ratio = contrastRatio(fgRgb, bgRgb);
  els.contrastRatio.textContent = ratio.toFixed(2);
  renderBadges(ratio);
  els.sampleNormal.style.color = fg;
  els.sampleNormal.style.backgroundColor = bg;
  els.sampleLarge.style.color = fg;
  els.sampleLarge.style.backgroundColor = bg;
}

// --- Rendering: export -------------------------------------------------------

function renderExports(): void {
  const colors = palette.map((hex) => ({ hex }));
  els.cssOutput.value = generateCssVariables(colors);
  els.jsonOutput.value = paletteToJson(colors);
  els.cssOutput.placeholder = palette.length ? '' : 'Add colors to generate CSS variables.';
  els.jsonOutput.placeholder = palette.length ? '' : 'Add colors to generate JSON.';
}

// --- Events: image -----------------------------------------------------------

els.dropZone.addEventListener('click', () => {
  els.fileInput.click();
});

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files?.[0];
  if (file) void handleFile(file);
  els.fileInput.value = '';
});

for (const type of ['dragenter', 'dragover'] as const) {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add('dragover');
  });
}
for (const type of ['dragleave', 'drop'] as const) {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove('dragover');
  });
}
els.dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void handleFile(file);
});
// Dropping anywhere else should not navigate the browser to the file.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

els.clearImage.addEventListener('click', () => {
  if (image) URL.revokeObjectURL(image.objectUrl);
  image = null;
  renderImage();
  setStatus(els.imageStatus, '');
});

// --- Events: manual color ----------------------------------------------------

els.manualColor.addEventListener('input', () => {
  setInputValue(els.manualHex, els.manualColor.value);
  hideError(els.manualError);
});

els.manualHex.addEventListener('input', () => {
  const rgb = parseHex(els.manualHex.value);
  if (rgb) {
    setInputValue(els.manualColor, rgbToHex(rgb));
    hideError(els.manualError);
  } else {
    showError(els.manualError, 'Enter a hex color like #1a2b3c or #abc.');
  }
});

els.addColor.addEventListener('click', () => {
  const rgb = parseHex(els.manualHex.value);
  if (!rgb) {
    showError(els.manualError, 'Enter a hex color like #1a2b3c or #abc.');
    els.manualHex.focus();
    return;
  }
  const hex = rgbToHex(rgb);
  if (palette.includes(hex)) {
    setPaletteStatus(`${hex} is already in the palette.`);
    return;
  }
  palette.push(hex);
  setPaletteStatus(`Added ${hex}.`);
  renderPalette();
});

// --- Events: palette ---------------------------------------------------------

els.clearPalette.addEventListener('click', () => {
  if (palette.length === 0) return;
  palette = [];
  editingIndex = null;
  setPaletteStatus('Palette cleared.');
  renderPalette();
});

// --- Events: contrast --------------------------------------------------------

function bindHexField(
  input: HTMLInputElement,
  error: HTMLElement,
  apply: (hex: string) => void,
): void {
  input.addEventListener('input', () => {
    const rgb = parseHex(input.value);
    if (!rgb) {
      showError(error, 'Enter a hex color like #1a2b3c or #abc.');
      return;
    }
    hideError(error);
    apply(rgbToHex(rgb));
    renderContrast();
    refreshPressedStates();
  });
}

bindHexField(els.fgHex, els.fgError, (hex) => {
  fg = hex;
});
bindHexField(els.bgHex, els.bgError, (hex) => {
  bg = hex;
});
els.fgColor.addEventListener('input', () => {
  fg = els.fgColor.value;
  renderContrast();
  refreshPressedStates();
});
els.bgColor.addEventListener('input', () => {
  bg = els.bgColor.value;
  renderContrast();
  refreshPressedStates();
});

// --- Events: export ----------------------------------------------------------

bindCopy(els.copyCss, () => els.cssOutput.value);
bindCopy(els.copyJson, () => els.jsonOutput.value);

// --- Init --------------------------------------------------------------------

function init(): void {
  renderImage();
  renderContrast();
  renderPalette();
  setStatus(els.imageStatus, '');
}

init();
