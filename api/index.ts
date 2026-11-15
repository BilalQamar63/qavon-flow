import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApp } from '../server.ts';

export const config = {
  maxDuration: 30,
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app(req as never, res as never);
}
