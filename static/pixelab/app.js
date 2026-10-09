/*
MIT License

Copyright (c) 2026 Hayri Bakici (GitHub: hayribakici)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import 'https://esm.run/@material/web/all.js';
import {
  computePosition, autoUpdate, offset, flip, shift
} from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.8.0/+esm';

// PPM specification: https://netpbm.sourceforge.net/doc/ppm.html
const isWhitespace = byte => [9, 10, 11, 12, 13, 32].includes(byte);

function createTokenReader(bytes) {
  let position = 0;
  return {
    get position() { return position; },
    next() {
      while (position < bytes.length) {
        if (isWhitespace(bytes[position])) position++;
        else if (bytes[position] === 35) {
          while (position < bytes.length && ![10, 13].includes(bytes[position])) position++;
        } else break;
      }
      const start = position;
      while (position < bytes.length && !isWhitespace(bytes[position]) && bytes[position] !== 35) position++;
      return new TextDecoder().decode(bytes.subarray(start, position));
    },
  };
}

function readInteger(reader, maximum) {
  const token = reader.next();
  const value = Number(token);
  if (!/^\d+$/.test(token) || !Number.isSafeInteger(value) || value > maximum) {
    throw new Error('Die PPM-Datei enthält fehlende oder ungültige Zahlenwerte.');
  }
  return value;
}

function readHeader(reader, size) {
  const type = reader.next();
  if (type !== 'P3' && type !== 'P6') throw new Error('Bitte eine PPM-Datei im Format P3 oder P6 auswählen.');
  const width = readInteger(reader, Number.MAX_SAFE_INTEGER);
  const height = readInteger(reader, Number.MAX_SAFE_INTEGER);
  if (width !== size || height !== size) throw new Error(`Das Bild muss ${size} × ${size} Pixel groß sein.`);
  const maximum = readInteger(reader, 65535);
  if (maximum === 0) throw new Error('Der maximale PPM-Farbwert muss zwischen 1 und 65535 liegen.');
  return {type, maximum};
}

function readTextSamples(reader, count, maximum) {
  const samples = Array.from({length: count}, () => readInteger(reader, maximum));
  if (reader.next() !== '') throw new Error('Die PPM-Datei enthält mehr Farbwerte als erwartet.');
  return samples;
}

function readBinarySamples(bytes, position, count, maximum) {
  const bytesPerSample = maximum < 256 ? 1 : 2;
  const expectedLength = count * bytesPerSample;
  if (!isWhitespace(bytes[position])) throw new Error('Der PPM-Dateikopf ist unvollständig.');
  // Consume only the separator: the first color byte may itself be whitespace or #.
  let start = position + 1;
  if (bytes[position] === 13 && bytes[start] === 10 && bytes.length - start === expectedLength + 1) start++;
  if (bytes.length - start !== expectedLength) throw new Error('Die Anzahl der PPM-Farbwerte stimmt nicht.');
  const data = new DataView(bytes.buffer, bytes.byteOffset + start, expectedLength);
  return Array.from({length: count}, (_, index) => {
    const value = bytesPerSample === 1 ? data.getUint8(index) : data.getUint16(index * 2);
    if (value > maximum) throw new Error('Ein PPM-Farbwert überschreitet den angegebenen Maximalwert.');
    return value;
  });
}

function decodePpm(buffer, size) {
  const bytes = new Uint8Array(buffer);
  const reader = createTokenReader(bytes);
  const {type, maximum} = readHeader(reader, size);
  const count = size * size * 3;
  const samples = type === 'P3'
    ? readTextSamples(reader, count, maximum)
    : readBinarySamples(bytes, reader.position, count, maximum);
  return Array.from({length: size * size}, (_, index) =>
    samples.slice(index * 3, index * 3 + 3).map(value => Math.round(value * 255 / maximum)));
}

function encodePpm(pixels, size) {
  // One pixel per line keeps the exported text easy to inspect and below 70 columns.
  return `P3\n# Pixel-Labor (sRGB)\n${size} ${size}\n255\n${pixels.map(pixel => pixel.join(' ')).join('\n')}\n`;
}

function createPngBlob(pixels, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Der Browser kann das PNG-Bild nicht erstellen.');
  const image = context.createImageData(size, size);
  pixels.forEach((pixel, index) => image.data.set([...pixel, 255], index * 4));
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Das PNG-Bild konnte nicht erstellt werden.'));
  }, 'image/png'));
}


const SIZE = 16;
const DEFAULT_PIXEL_SIZE = 40;
const MIN_VALUE_PIXEL_SIZE = 40;
document.querySelector('#footer-year').textContent = new Date().getFullYear();
const pixels = Array.from({length: SIZE * SIZE}, () => [255, 255, 255]);
const grid = document.querySelector('#grid');
const editor = document.querySelector('#editor');
const fields = ['red', 'green', 'blue'].map(id => document.getElementById(id));
const acceptedFieldValues = new WeakMap();
const formatOptions = document.querySelector('#format');
const formatRadios = [...formatOptions.querySelectorAll('md-radio')];
const valuesToggle = document.querySelector('#values-toggle');
const settings = document.querySelector('#settings');
const pixelSize = document.querySelector('#pixel-size');
const pixelSizeValue = document.querySelector('#pixel-size-value');
const preview = document.querySelector('#preview');
const error = document.querySelector('#error');
const editorTitle = document.querySelector('#editor-title');
const ppmFileInput = document.querySelector('#ppm-file');
const uploadPpmButton = document.querySelector('#upload-ppm');
const fileMessage = document.querySelector('#file-message');
const downloadToggle = document.querySelector('#download-toggle');
const downloadOptions = document.querySelector('#download-options');
let selected = null;
let cleanupPosition = null;
let format = 'dec';
let valuesEnabled = true;

const hexFormat = {base: 16, digits: 2, pattern: /^[a-f\d]{1,2}$/i, range: '00–FF'};
const formats = {
  dec: {base: 10, digits: 3, pattern: /^\d{1,3}$/, range: '0–255'},
  'hex-rgb': hexFormat,
  hex: hexFormat,
  bin: {base: 2, digits: 8, pattern: /^[01]{1,8}$/, range: '00000000–11111111'},
};
const color = values => `rgb(${values.join(',')})`;
const representation = values => format === 'hex'
  ? `#${values.map(fieldValue).join('')}`
  : values.map((value, index) => `${'RGB'[index]} ${fieldValue(value)}`).join('\n');
const fieldValue = value => value.toString(formats[format].base).toUpperCase()
  .padStart(format === 'dec' ? 1 : formats[format].digits, '0');

function parseField(value) {
  const text = value.trim();
  if (!formats[format].pattern.test(text)) return null;
  const n = Number.parseInt(text, formats[format].base);
  return n <= 255 ? n : null;
}

function setFieldValue(field, value) {
  field.value = value;
  acceptedFieldValues.set(field, value);
}

function getInput() {
  const channels = fields.map(field => parseField(field.value));
  return channels.includes(null) ? null : channels;
}

function contrast(values) {
  const [r, g, b] = values.map(channel => {
    const s = channel / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b > .179 ? '#1b1b1f' : '#fff';
}

function paint(index, values) {
  const cell = grid.children[index];
  cell.style.backgroundColor = color(values);
  cell.style.color = contrast(values);
  cell.querySelector('.value').textContent = representation(values);
  cell.setAttribute('aria-label', `Pixel ${index % SIZE + 1}, ${Math.floor(index / SIZE) + 1}; Rot ${values[0]}, Grün ${values[1]}, Blau ${values[2]}`);
}

function closeEditor() {
  if (selected === null) return;
  paint(selected, pixels[selected]);
  cleanupPosition?.();
  cleanupPosition = null;
  editor.hidden = true;
  grid.children[selected].setAttribute('aria-pressed', 'false');
  grid.children[selected].focus();
  selected = null;
  error.hidden = true;
}

function showInputError() {
  error.textContent = `Ungültige Werte. Erlaubt: ${formats[format].range}.`;
  error.hidden = false;
  fields.find(field => parseField(field.value) === null)?.focus();
}

function save() {
  if (selected === null) return;
  const input = getInput();
  if (!input) {
    showInputError();
    return;
  }
  pixels[selected] = input;
  closeEditor();
}

function updatePreview() {
  if (selected === null) return;
  const input = getInput();
  error.hidden = true;
  if (!input) return;
  paint(selected, input);
  preview.style.backgroundColor = color(input);
}

function openEditor(index) {
  closeEditor();
  selected = index;
  grid.children[index].setAttribute('aria-pressed', 'true');
  editorTitle.textContent = `Pixel (${index % SIZE + 1}, ${Math.floor(index / SIZE) + 1})`;
  fields.forEach((field, i) => setFieldValue(field, fieldValue(pixels[index][i])));
  preview.style.backgroundColor = color(pixels[index]);
  error.hidden = true;
  editor.hidden = false;
  cleanupPosition = autoUpdate(grid.children[index], editor, () => {
    computePosition(grid.children[index], editor, {
      strategy: 'fixed', placement: 'bottom-start', middleware: [offset(8), flip(), shift({padding: 12})],
    }).then(({x, y}) => Object.assign(editor.style, {left: `${x}px`, top: `${y}px`}));
  });
  fields[0].focus();
}

for (let index = 0; index < pixels.length; index++) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'pixel';
  cell.setAttribute('aria-pressed', 'false');
  const content = document.createElement('span');
  content.className = 'value';
  cell.append(content);
  cell.addEventListener('click', () => openEditor(index));
  grid.append(cell);
  paint(index, pixels[index]);
}

function handleChannelInput(event) {
  if (event.isComposing) return;
  const field = event.currentTarget;
  const value = field.value;
  // Empty fields remain editable; complete values must match the active format.
  if (value !== '' && (!formats[format].pattern.test(value) || parseField(value) === null)) {
    field.value = acceptedFieldValues.get(field) ?? '';
    return;
  }
  acceptedFieldValues.set(field, value);
  updatePreview();
}

function handleChannelArrowKey(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const field = event.currentTarget;
  const currentValue = parseField(field.value) ?? 0;
  const increment = event.key === 'ArrowUp' ? 1 : -1;
  const nextValue = Math.max(0, Math.min(255, currentValue + increment));
  setFieldValue(field, fieldValue(nextValue));
  updatePreview();
}

fields.forEach(field => {
  field.addEventListener('input', handleChannelInput);
  field.addEventListener('compositionend', handleChannelInput);
  field.addEventListener('keydown', handleChannelArrowKey);
});

editor.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
  if (event.key === 'Enter') { event.preventDefault(); save(); }
});
document.querySelector('#cancel').addEventListener('click', closeEditor);
document.querySelector('#save').addEventListener('click', save);

formatOptions.addEventListener('change', () => {
  const draft = selected === null ? null : getInput();
  if (selected !== null && !draft) {
    formatRadios.forEach(radio => { radio.checked = radio.value === format; });
    showInputError();
    return;
  }
  format = formatRadios.find(radio => radio.checked).value;
  grid.dataset.format = format;
  for (let i = 0; i < pixels.length; i++) paint(i, selected === i && draft ? draft : pixels[i]);
  if (draft) fields.forEach((field, i) => setFieldValue(field, fieldValue(draft[i])));
});
function updateValuesVisibility() {
  const tooSmall = pixelSize.value < MIN_VALUE_PIXEL_SIZE;
  const visible = valuesEnabled && !tooSmall;
  valuesToggle.disabled = tooSmall;
  valuesToggle.selected = visible;
  grid.classList.toggle('hide-values', !visible);
  formatOptions.disabled = !visible;
  formatRadios.forEach(radio => { radio.disabled = !visible; });
}

valuesToggle.addEventListener('input', () => {
  valuesEnabled = valuesToggle.selected;
  updateValuesVisibility();
});

function updatePixelSize() {
  grid.style.setProperty('--pixel-size', `${pixelSize.value}px`);
  pixelSizeValue.value = `${pixelSize.value} px`;
  updateValuesVisibility();
}

pixelSize.addEventListener('input', updatePixelSize);

function showFileMessage(message, isError = false) {
  fileMessage.textContent = message;
  fileMessage.dataset.error = String(isError);
  fileMessage.hidden = !message;
}

function getExportPixels() {
  const draft = selected === null ? null : getInput();
  if (selected !== null && !draft) {
    showInputError();
    throw new Error('Bitte zuerst die Farbwerte des ausgewählten Pixels vervollständigen.');
  }
  return pixels.map((pixel, index) => [...(index === selected ? draft : pixel)]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadImage(type) {
  try {
    const imagePixels = getExportPixels();
    const blob = type === 'png' ? await createPngBlob(imagePixels, SIZE)
      : new Blob([encodePpm(imagePixels, SIZE)], {type: 'image/x-portable-pixmap'});
    downloadBlob(blob, `pixel-labor.${type}`);
  } catch (failure) {
    showFileMessage(failure.message, true);
  }
}

async function uploadPpm() {
  const file = ppmFileInput.files[0];
  if (!file) return;
  uploadPpmButton.disabled = true;
  try {
    if (file.size > 1024 * 1024) throw new Error('Die PPM-Datei ist zu groß (maximal 1 MB).');
    const importedPixels = decodePpm(await file.arrayBuffer(), SIZE);
    closeEditor();
    pixels.splice(0, pixels.length, ...importedPixels);
    pixels.forEach((pixel, index) => paint(index, pixel));
    openEditor(0);
  } catch (failure) {
    showFileMessage(failure.message, true);
  } finally {
    ppmFileInput.value = '';
    uploadPpmButton.disabled = false;
  }
}

document.querySelector('#download-png').addEventListener('click', () => downloadImage('png'));
document.querySelector('#download-ppm').addEventListener('click', () => downloadImage('ppm'));
function setDownloadMenu(open) {
  downloadOptions.hidden = !open;
  downloadToggle.setAttribute('aria-expanded', String(open));
}

downloadToggle.addEventListener('click', () => setDownloadMenu(downloadOptions.hidden));
downloadOptions.addEventListener('click', () => setDownloadMenu(false));
uploadPpmButton.addEventListener('click', () => ppmFileInput.click());
ppmFileInput.addEventListener('change', uploadPpm);

document.addEventListener('pointerdown', event => {
  if (!event.composedPath().includes(downloadToggle) && !event.composedPath().includes(downloadOptions)) setDownloadMenu(false);
  if (selected === null) return;
  const path = event.composedPath();
  if (![editor, settings, grid.children[selected]].some(element => path.includes(element))) closeEditor();
});

await Promise.all([...fields, valuesToggle, pixelSize].map(element => element.updateComplete));
pixelSize.value = DEFAULT_PIXEL_SIZE;
updatePixelSize();
openEditor(0);
