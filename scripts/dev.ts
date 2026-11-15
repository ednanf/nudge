import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { handle } from '../server/app';
const api = createServer(async (req, res) => {
  try {
    const request = new Request(`http://127.0.0.1:3001${req.url}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      ...(['GET', 'HEAD'].includes(req.method || 'GET')
        ? {}
        : { body: req as unknown as ReadableStream, duplex: 'half' }),
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('Local API adapter failed.');
  }
});
api.listen(3001, '127.0.0.1');
const vite = await createViteServer();
await vite.listen();
vite.printUrls();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    api.close();
    await vite.close();
    process.exit(0);
  });
