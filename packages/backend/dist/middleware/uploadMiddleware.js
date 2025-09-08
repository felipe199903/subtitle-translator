"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMiddleware = void 0;
const uploadMiddleware = (req, res, next) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file provided' });
            return;
        }
        // Validate file size (10MB max)
        if (req.file.size > 10 * 1024 * 1024) {
            res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
            return;
        }
        // Validate file extension
        if (!req.file.originalname.toLowerCase().endsWith('.srt')) {
            res.status(400).json({ error: 'Invalid file type. Only .srt files are allowed.' });
            return;
        }
        // Validate file content is text
        const content = req.file.buffer.toString('utf-8');
        if (!content || content.trim().length === 0) {
            res.status(400).json({ error: 'File appears to be empty or corrupted.' });
            return;
        }
        // Basic SRT format validation
        if (!content.includes('-->')) {
            res.status(400).json({ error: 'File does not appear to be a valid SRT subtitle file.' });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Upload middleware error:', error);
        res.status(500).json({
            error: 'Failed to process uploaded file',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.uploadMiddleware = uploadMiddleware;
//# sourceMappingURL=uploadMiddleware.js.map