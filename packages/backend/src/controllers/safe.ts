import { Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;

/** Wraps async handlers so database errors become a JSON 500 instead of a hung request. */
export const safe = (fn: Handler): Handler => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('Erro na API:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
  }
};
