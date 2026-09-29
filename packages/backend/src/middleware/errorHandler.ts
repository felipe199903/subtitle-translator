import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'Arquivo muito grande. O limite é 4 MB.',
      LIMIT_FILE_COUNT: 'Envie um arquivo por vez.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado. Use o campo "file".',
    };
    res.status(400).json({ error: messages[error.code] ?? `Erro no upload: ${error.message}` });
    return;
  }

  if ((error as any).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido na requisição.' });
    return;
  }

  console.error('Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor.',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
};
