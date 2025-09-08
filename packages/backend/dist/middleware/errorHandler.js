"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (error, req, res, next) => {
    console.error('Error occurred:', error);
    // Multer errors
    if (error.message.includes('Only .srt files are allowed')) {
        res.status(400).json({
            error: 'Invalid file type',
            message: 'Only .srt subtitle files are allowed'
        });
        return;
    }
    if (error.message.includes('File too large')) {
        res.status(400).json({
            error: 'File too large',
            message: 'Maximum file size is 10MB'
        });
        return;
    }
    // Default error response
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map