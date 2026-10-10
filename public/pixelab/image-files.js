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

export function decodePpm(buffer, size) {
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

export function encodePpm(pixels, size) {
  // One pixel per line keeps the exported text easy to inspect and below 70 columns.
  return `P3\n# Pixel-Labor (sRGB)\n${size} ${size}\n255\n${pixels.map(pixel => pixel.join(' ')).join('\n')}\n`;
}

export function createPngBlob(pixels, size) {
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
