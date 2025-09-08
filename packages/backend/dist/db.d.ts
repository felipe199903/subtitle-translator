/// <reference types="./vendor-typings/sqlite3" />
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
export declare function getDb(): Promise<Database<sqlite3.Database, sqlite3.Statement>>;
export declare function upsertTM(src: string, tgt: string): Promise<void>;
export declare function queryTMExact(src: string): Promise<any>;
export declare function queryTMSimilar(src: string, limit?: number): Promise<any[]>;
export declare function getAllTM(): Promise<any[]>;
//# sourceMappingURL=db.d.ts.map