import {resolve} from 'node:path';

import {SyncDatabase} from './database.ts';
import {createSyncServer} from './http.ts';

const port = Number(process.env.CERU_SYNC_PORT || 31231);
const host = process.env.CERU_SYNC_HOST || '0.0.0.0';
const dbPath = resolve(process.env.CERU_SYNC_DB_PATH || process.env.CERU_SYNC_DB || './data/ceru-sync.sqlite');
const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

const database = new SyncDatabase(dbPath);
const server = createSyncServer({database, port, host});

server.listen(port, host, () => {
  console.log(`[ceru-sync] listening on http://${displayHost}:${port}`);
  console.log(`[ceru-sync] sqlite: ${dbPath}`);
});

const shutdown = () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);