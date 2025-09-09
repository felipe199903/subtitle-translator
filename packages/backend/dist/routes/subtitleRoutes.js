"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const SubtitleController_1 = require("../controllers/SubtitleController");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const router = express_1.default.Router();
const subtitleController = new SubtitleController_1.SubtitleController();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/x-subrip' ||
            file.originalname.endsWith('.srt') ||
            file.mimetype === 'text/plain') {
            cb(null, true);
        }
        else {
            cb(new Error('Only .srt files are allowed'));
        }
    }
});
// Configure multer for batch uploads (higher limits)
const batchUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 150, // Max 150 files at once (increased limit)
        fieldSize: 100 * 1024 * 1024, // 100MB total form data
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/x-subrip' ||
            file.originalname.endsWith('.srt') ||
            file.mimetype === 'text/plain') {
            cb(null, true);
        }
        else {
            cb(new Error('Only .srt files are allowed'));
        }
    }
});
// Routes
router.post('/upload', upload.single('srtFile'), uploadMiddleware_1.uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate', upload.single('srt'), uploadMiddleware_1.uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate-text', subtitleController.translateSubtitle);
// Multer error handler middleware for batch uploads
const handleBatchUploadErrors = (error, req, res, next) => {
    if (error && error.code) {
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files in single batch',
                details: error.message,
                suggestion: 'Please upload files in smaller batches (max 150 files per batch). The frontend will automatically handle this.',
                maxFilesAllowed: 150,
                errorCode: 'LIMIT_FILE_COUNT'
            });
        }
        else if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'One or more files are too large',
                details: error.message,
                suggestion: 'Please ensure each file is smaller than 50MB',
                maxFileSize: '50MB',
                errorCode: 'LIMIT_FILE_SIZE'
            });
        }
        else if (error.code === 'LIMIT_FIELD_VALUE') {
            return res.status(400).json({
                error: 'Form data too large',
                details: error.message,
                suggestion: 'Please reduce the number of files or file sizes',
                errorCode: 'LIMIT_FIELD_VALUE'
            });
        }
        return res.status(400).json({
            error: 'Upload error',
            details: error.message,
            errorCode: error.code
        });
    }
    next(error);
};
// Training mode routes
router.post('/batch-upload', batchUpload.array('srtFiles', 150), handleBatchUploadErrors, subtitleController.batchUploadForTraining);
router.post('/analyze-training', subtitleController.analyzeTrainingResults);
router.get('/training-status/:sessionId', subtitleController.getTrainingStatus);
router.post('/improve-dictionary', subtitleController.improveDictionaryFromResults);
router.get('/languages', subtitleController.getSupportedLanguages);
router.get('/debug-tm', subtitleController.debugTM);
// System metrics and training impact routes
router.get('/system-metrics', subtitleController.getSystemMetrics);
router.post('/compare-training-impact', subtitleController.compareTrainingImpact);
// Massive training monitoring
router.get('/massive-training-stats', subtitleController.getMassiveTrainingStats);
// Resource management routes
router.post('/reload-resources', subtitleController.reloadResources);
router.get('/test-translation', subtitleController.testTranslation);
exports.default = router;
//# sourceMappingURL=subtitleRoutes.js.map