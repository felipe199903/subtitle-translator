import { Request, Response } from 'express';
export declare class SubtitleController {
    private subtitleService;
    private languageDetectionService;
    private translationService;
    private glossary;
    private dict;
    private tmIndex;
    constructor();
    private loadResources;
    private buildTmIndex;
    private normalizeText;
    private applyGlossary;
    private queryTM;
    private queryDict;
    private translateWithTM;
    uploadAndProcess: (req: Request, res: Response) => Promise<void>;
    translateSubtitle: (req: Request, res: Response) => Promise<void>;
    getSupportedLanguages: (req: Request, res: Response) => Promise<void>;
    debugTM: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=SubtitleController.d.ts.map