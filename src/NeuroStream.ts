import { TextDecoder as NodeDecoder } from "util";
const Decoder = globalThis.TextDecoder ?? NodeDecoder;
import { StreamEvent, NeuroStreamOptions } from './types';

export default class NeuroStream<T = any> {
  private _buf = '';
  private _dec = new Decoder();
  private _q: StreamEvent<T>[] = [];
  private _closed = false;
  private _wake: (() => void) | null = null;
  private _wait: Promise<void>;
  
  private _stack: string[] = [];
  private _inStr = false;
  private _esc = false;
  private _start = -1;
  private _currentEvent = 'message';

  private readonly MAX_BUF: number;
  private readonly HIGH_WATERMARK: number;
  private readonly onError?: (e: Error, r?: string) => void;

  constructor(options: NeuroStreamOptions = {}) {
    this.MAX_BUF = options.maxBufferSize || 10 * 1024 * 1024;
    this.HIGH_WATERMARK = options.highWatermark || 1000;
    this.onError = options.onError;
    this._wait = new Promise((r) => (this._wake = r));
  }

  push(chunk: Uint8Array | string): boolean {
    if (this._closed) return false;
    let raw = typeof chunk === 'string' ? chunk : this._dec.decode(chunk, { stream: true });
    const eventMatch = raw.match(/^event:\s*(.*)$/m);
    if (eventMatch) this._currentEvent = eventMatch[1].trim();
    const cleanData = raw.replace(/^data:\s*/gm, '').replace(/\[DONE\]/g, '');
    if (this._buf.length + cleanData.length > this.MAX_BUF) {
      this.onError?.(new Error("BufferOverflow"), cleanData.substring(0, 50));
      return false;
    }
    this._buf += cleanData;
    this._proc();
    return this._q.length < this.HIGH_WATERMARK;
  }

  private _proc() {
    for (let i = 0, len = this._buf.length; i < len; i++) {
      const char = this._buf[i];
      if (this._esc) { this._esc = false; continue; }
      if (char === '\\') { this._esc = true; continue; }
      if (char === '"' && !this._esc) { this._inStr = !this._inStr; continue; }
      if (!this._inStr) {
        if (char === '{' || char === '[') {
          if (this._stack.length === 0) this._start = i;
          this._stack.push(char);
        } else if (char === '}' || char === ']') {
          this._stack.pop();
          if (this._stack.length === 0 && this._start !== -1) {
            const raw = this._buf.substring(this._start, i + 1);
            try {
              this._q.push({ event: this._currentEvent, data: JSON.parse(raw) });
              this._buf = this._buf.substring(i + 1);
              this._start = -1; i = -1; len = this._buf.length;
              this._triggerWake();
            } catch (e) {
              this.onError?.(e as Error, raw);
            }
          }
        }
      }
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent<T>> {
    while (true) {
      if (this._q.length > 0) { while (this._q.length > 0) yield this._q.shift()!; continue; }
      if (this._closed) break;
      await this._wait;
      this._wait = new Promise((r) => (this._wake = r));
    }
  }

  private _triggerWake() { if (this._wake) { this._wake(); this._wake = null; } }

  close() {
    this._closed = true;
    this._triggerWake();
  }

  static async fromFetch<R = any>(response: Response, options?: NeuroStreamOptions) {
    const ns = new NeuroStream<R>(options);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream unreachable");
    (async () => {
      try { while (true) { const { done, value } = await reader.read(); if (done) break; ns.push(value); } } finally { ns.close(); }
    })();
    return ns;
  }
}
