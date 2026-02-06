import { describe, it, expect } from 'vitest';
import NeuroStream from '../src/NeuroStream';

describe('NeuroStream', () => {
  it('parses a single JSON object', async () => {
    const ns = new NeuroStream();
    ns.push('{"a":1}');
    ns.close();

    const result = [];
    for await (const evt of ns) {
      result.push(evt.data);
    }

    expect(result).toEqual([{ a: 1 }]);
  });
});
