import express from 'express';
import multer from 'multer';
import { SubtitleController } from '../controllers/SubtitleController';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

const router = express.Router();
const subtitleController = new SubtitleController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/x-subrip' || 
        file.originalname.endsWith('.srt') || 
        file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .srt files are allowed'));
    }
  }
});

// Configure multer for batch uploads (higher limits)
const batchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 100, // Max 100 files at once
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/x-subrip' || 
        file.originalname.endsWith('.srt') || 
        file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .srt files are allowed'));
    }
  }
});

// Routes
router.post('/upload', upload.single('srtFile'), uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate', upload.single('srt'), uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate-text', subtitleController.translateSubtitle);

// Training mode routes
router.post('/batch-upload', batchUpload.array('srtFiles', 100), subtitleController.batchUploadForTraining);
router.post('/analyze-training', subtitleController.analyzeTrainingResults);
router.get('/training-status/:sessionId', subtitleController.getTrainingStatus);
router.post('/improve-dictionary', subtitleController.improveDictionaryFromResults);

router.get('/languages', subtitleController.getSupportedLanguages);
router.get('/debug-tm', subtitleController.debugTM);

export default router;
