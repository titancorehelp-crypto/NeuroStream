import NeuroStream, { StreamEvent } from '../NeuroStream';

async function demo() {
  const response = await fetch('https://example.com/sse');
  const ns = await NeuroStream.fromFetch<unknown>(response);

  for await (const evt of ns) {
    console.log(`[${evt.event}]`, evt.data);
  }
}

demo();
