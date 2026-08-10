(() => {
  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const r = (i >> 5) & 7;
    const g = (i >> 2) & 7;
    const b = i & 3;
    palette[i * 3] = Math.round(r * 255 / 7);
    palette[i * 3 + 1] = Math.round(g * 255 / 7);
    palette[i * 3 + 2] = Math.round(b * 255 / 3);
  }

  class Sink {
    constructor() {
      this.chunks = [];
      this.buffer = new Uint8Array(65536);
      this.offset = 0;
    }
    byte(value) {
      if (this.offset >= this.buffer.length) this.flush();
      this.buffer[this.offset++] = value & 255;
    }
    bytes(values) {
      for (let i = 0; i < values.length; i++) this.byte(values[i]);
    }
    ascii(text) {
      for (let i = 0; i < text.length; i++) this.byte(text.charCodeAt(i));
    }
    u16(value) {
      this.byte(value);
      this.byte(value >> 8);
    }
    flush() {
      if (!this.offset) return;
      this.chunks.push(this.buffer.slice(0, this.offset));
      this.buffer = new Uint8Array(65536);
      this.offset = 0;
    }
    blob(type) {
      this.flush();
      return new Blob(this.chunks, { type });
    }
  }

  function quantize(imageData) {
    const rgba = imageData.data;
    const indexed = new Uint8Array(rgba.length >> 2);
    for (let src = 0, dst = 0; src < rgba.length; src += 4, dst++) {
      indexed[dst] = (rgba[src] & 0xe0) | ((rgba[src + 1] & 0xe0) >> 3) | (rgba[src + 2] >> 6);
    }
    return indexed;
  }

  function lzwCompress(indexed, minCodeSize = 8) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let nextCode;
    let codeSize;
    let dictionary;
    const out = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const reset = () => {
      dictionary = new Map();
      nextCode = endCode + 1;
      codeSize = minCodeSize + 1;
    };

    const writeCode = code => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        out.push(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    };

    reset();
    writeCode(clearCode);
    if (!indexed.length) {
      writeCode(endCode);
      if (bitCount) out.push(bitBuffer & 255);
      return Uint8Array.from(out);
    }

    let prefix = indexed[0];
    for (let i = 1; i < indexed.length; i++) {
      const suffix = indexed[i];
      const key = prefix * 256 + suffix;
      const found = dictionary.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }

      writeCode(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        writeCode(clearCode);
        reset();
      }
      prefix = suffix;
    }

    writeCode(prefix);
    writeCode(endCode);
    if (bitCount) out.push(bitBuffer & 255);
    return Uint8Array.from(out);
  }

  function writeSubBlocks(sink, data) {
    for (let offset = 0; offset < data.length; offset += 255) {
      const length = Math.min(255, data.length - offset);
      sink.byte(length);
      sink.bytes(data.subarray(offset, offset + length));
    }
    sink.byte(0);
  }

  async function encode({ width, height, frames, delayMs = 125, repeat = 0, onProgress = null, shouldCancel = null }) {
    if (!width || !height || !frames?.length) throw new Error('GIF requires at least one frame.');
    if (width > 65535 || height > 65535) throw new Error('GIF dimensions are too large.');

    const sink = new Sink();
    sink.ascii('GIF89a');
    sink.u16(width);
    sink.u16(height);
    sink.byte(0xf7); // global 256-color table, 8-bit color resolution
    sink.byte(0); // background index
    sink.byte(0); // pixel aspect ratio
    sink.bytes(palette);

    // Loop forever (Netscape application extension).
    sink.bytes([0x21, 0xff, 0x0b]);
    sink.ascii('NETSCAPE2.0');
    sink.bytes([0x03, 0x01]);
    sink.u16(repeat);
    sink.byte(0);

    const delayCs = Math.max(2, Math.round(delayMs / 10));
    for (let i = 0; i < frames.length; i++) {
      if (shouldCancel?.()) {
        const error = new Error('GIF render cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      const frame = frames[i];
      if (!(frame instanceof Uint8Array) || frame.length !== width * height) {
        throw new Error(`Invalid GIF frame ${i + 1}.`);
      }

      // Graphic control extension: keep the previous frame, no transparency.
      sink.bytes([0x21, 0xf9, 0x04, 0x04]);
      sink.u16(delayCs);
      sink.bytes([0x00, 0x00]);

      // Full-frame image descriptor using the global palette.
      sink.byte(0x2c);
      sink.u16(0); sink.u16(0);
      sink.u16(width); sink.u16(height);
      sink.byte(0x00);
      sink.byte(0x08);
      writeSubBlocks(sink, lzwCompress(frame, 8));

      onProgress?.((i + 1) / frames.length);
      if ((i & 1) === 1) await new Promise(resolve => setTimeout(resolve, 0));
    }

    sink.byte(0x3b);
    return sink.blob('image/gif');
  }

  window.CanvassGifEncoder = { quantize, encode };
})();
