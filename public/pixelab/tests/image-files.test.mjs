// Copyright (c) 2026 Hayri Bakici (GitHub: hayribakici)
// SPDX-License-Identifier: MIT — see ../LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePpm, encodePpm} from '../image-files.js';

const size = 16;
const pixels = Array.from({length: size * size}, (_, i) => [i, 255 - i, i % 17]);
const encode = text => new TextEncoder().encode(text);

function binaryPpm(samples, maximum = 255, newline = '\n') {
  const header = encode(`P6${newline}# test${newline}16 16${newline}${maximum}${newline}`);
  const step = maximum < 256 ? 1 : 2;
  const bytes = new Uint8Array(header.length + samples.length * step);
  bytes.set(header);
  const data = new DataView(bytes.buffer, header.length);
  samples.forEach((value, i) => step === 1 ? data.setUint8(i, value) : data.setUint16(i * 2, value));
  return bytes;
}

test('P3 export/import retains every channel in row order', () => {
  const text = encodePpm(pixels, size);
  assert.deepEqual(decodePpm(encode(text), size), pixels);
  assert.ok(text.split('\n').every(line => line.length <= 70));
});

test('P3 supports comments, whitespace and scaling of the declared maximum', () => {
  const body = Array.from({length: 256}, () => '0\t7 # channel comment\r\n15').join('\n');
  assert.deepEqual(decodePpm(encode(`P3\n# heading\n16 16\n15\n${body}\n# end`), size),
    Array.from({length: 256}, () => [0, 119, 255]));
});

test('P6 preserves whitespace and comment-marker bytes in the raster', () => {
  for (const first of [9, 10, 13, 32, 35]) {
    const samples = pixels.flat();
    samples[0] = first;
    for (const newline of ['\n', '\r\n']) {
      assert.deepEqual(decodePpm(binaryPpm(samples, 255, newline), size).flat(), samples);
    }
  }
});

test('16-bit P6 reads big-endian channels and scales to RGB bytes', () => {
  const samples = Array.from({length: 256}, () => [0, 32768, 65535]).flat();
  assert.deepEqual(decodePpm(binaryPpm(samples, 65535), size),
    Array.from({length: 256}, () => [0, 128, 255]));
});

test('invalid formats, dimensions, maximums and sample counts are rejected', () => {
  for (const text of ['', 'P5\n16 16\n255', 'P3\n8 16\n255', 'P3\n16 16\n0',
    'P3\n16 16\n65536', 'P3\n16 16\n255\n0 0', 'P3\n16 16\n255\n-1',
    'P3\n16 16\n255\n256', 'P3\n16 16\n255\n1.5', encodePpm(pixels, size) + '1']) {
    assert.throws(() => decodePpm(encode(text), size));
  }
});

test('P6 rejects truncated, extra and out-of-range binary samples', () => {
  const bytes = binaryPpm(pixels.flat());
  assert.throws(() => decodePpm(bytes.slice(0, -1), size));
  assert.throws(() => decodePpm(new Uint8Array([...bytes, 0]), size));
  assert.throws(() => decodePpm(binaryPpm(Array(768).fill(16), 15), size));
});
