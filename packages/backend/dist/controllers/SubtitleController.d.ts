import { Request, Response } from 'express';
export declare class SubtitleController {
    private subtitleService;
    private languageDetectionService;
    private translationService;
    constructor();
    uploadAndProcess: (req: Request, res: Response) => Promise<void>;
    translateSubtitle: (req: Request, res: Response) => Promise<void>;
    getSupportedLanguages: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=SubtitleController.d.ts.map