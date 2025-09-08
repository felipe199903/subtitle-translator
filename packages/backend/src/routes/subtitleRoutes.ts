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

// Routes
router.post('/upload', upload.single('srtFile'), uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate', subtitleController.translateSubtitle);
router.get('/languages', subtitleController.getSupportedLanguages);

export default router;
