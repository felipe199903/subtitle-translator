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
// Routes
router.post('/upload', upload.single('srtFile'), uploadMiddleware_1.uploadMiddleware, subtitleController.uploadAndProcess);
router.post('/translate', subtitleController.translateSubtitle);
router.get('/languages', subtitleController.getSupportedLanguages);
exports.default = router;
//# sourceMappingURL=subtitleRoutes.js.map