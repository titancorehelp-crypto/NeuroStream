export interface StreamEvent<T> {
  event: string;
  data: T;
}

export interface NeuroStreamOptions {
  maxBufferSize?: number;
  highWatermark?: number;
  onError?: (e: Error, raw?: string) => void;
}
