import { Request, Response } from 'express';
export declare class SubtitleController {
    private subtitleService;
    private languageDetectionService;
    private translationService;
    private glossary;
    private dict;
    private tmIndex;
    private trainingSessions;
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
    batchUploadForTraining: (req: Request, res: Response) => Promise<void>;
    private processTrainingBatch;
    getTrainingStatus: (req: Request, res: Response) => Promise<void>;
    analyzeTrainingResults: (req: Request, res: Response) => Promise<void>;
    private generateRecommendations;
    improveDictionaryFromResults: (req: Request, res: Response) => Promise<void>;
    private saveDictionary;
    /**
     * Force reload all translation resources (dict, glossary, TM)
     * Call this after making changes to ensure they're applied immediately
     */
    reloadAllResources(): Promise<void>;
    /**
     * Automatically apply high-confidence learned phrases from a training session
     */
    private autoApplyLearnedPhrases;
    getSystemMetrics: (req: Request, res: Response) => Promise<void>;
    private calculateAverageTranslationMethods;
    private generateSystemRecommendations;
    getMassiveTrainingStats: (req: Request, res: Response) => Promise<void>;
    compareTrainingImpact: (req: Request, res: Response) => Promise<void>;
    private calculateSessionStats;
    private generateImprovementSummary;
    reloadResources: (req: Request, res: Response) => Promise<void>;
    testTranslation: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=SubtitleController.d.ts.map