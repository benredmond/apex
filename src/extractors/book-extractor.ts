import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";
import { LLMExtractor } from "./llm-extractor.js";
import { PatternValidator } from "./pattern-validator.js";
import { PatternInserter } from "../reflection/pattern-inserter.js";
import {
  type ExtractionConfig,
  type CompleteBookPattern,
  type BookSource,
  ExtractionConfigSchema,
} from "./schemas.js";

// [ARCH:DB:BULK_TRANSACTION] ★★★★★ - Single transaction for bulk insertion
// [FIX:ASYNC:UNHANDLED_REJECTION] ★★★★☆ - Comprehensive error handling

export class BookExtractor {
  private llmExtractor: LLMExtractor;
  private validator: PatternValidator;
  private patternInserter: PatternInserter;
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.llmExtractor = new LLMExtractor();
    this.validator = new PatternValidator();
    this.patternInserter = new PatternInserter(this.db);
  }

  /**
   * Extract patterns from a book file
   */
  async extractFromBook(config: ExtractionConfig): Promise<{
    extracted: number;
    inserted: number;
    failed: number;
  }> {
    // Validate configuration
    const validatedConfig = ExtractionConfigSchema.parse(config);

    console.log(
      `[BookExtractor] Starting extraction from: ${validatedConfig.bookFile}`,
    );
    console.log(
      `[BookExtractor] Book: ${validatedConfig.bookMetadata.title} by ${validatedConfig.bookMetadata.author}`,
    );

    // Read book content
    const bookContent = await this.readBookFile(validatedConfig.bookFile);

    // Split into chapters
    const chapters = this.splitIntoChapters(
      bookContent,
      validatedConfig.chapterRange,
    );
    console.log(`[BookExtractor] Found ${chapters.length} chapters to process`);

    // Process chapters
    const allPatterns: CompleteBookPattern[] = [];
    let extractedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      console.log(
        `[BookExtractor] Processing chapter ${i + 1}/${chapters.length}`,
      );

      try {
        // Extract patterns using LLM
        const rawPatterns = await this.llmExtractor.extractPatternsFromChapter(
          chapter.text,
          chapter.number,
          validatedConfig.bookMetadata.title,
        );

        console.log(
          `[BookExtractor] Extracted ${rawPatterns.length} patterns from chapter ${chapter.number}`,
        );
        extractedCount += rawPatterns.length;

        // Validate and transform patterns
        const bookSource: BookSource = {
          book: validatedConfig.bookMetadata.title,
          author: validatedConfig.bookMetadata.author,
          chapter: chapter.number,
          isbn: validatedConfig.bookMetadata.isbn,
          section: chapter.title,
        };

        const validPatterns = this.validator.validateAndTransform(
          rawPatterns.slice(0, validatedConfig.maxPatternsPerChapter),
          bookSource,
        );

        allPatterns.push(...validPatterns);
      } catch (error) {
        console.error(
          `[BookExtractor] Failed to process chapter ${chapter.number}:`,
          error,
        );
        failedCount++;
      }
    }

    // Insert patterns into database
    const insertedCount = await this.insertPatternsToDatabase(
      allPatterns,
      validatedConfig.dryRun,
    );

    console.log(`[BookExtractor] Extraction complete:`);
    console.log(`  - Extracted: ${extractedCount} patterns`);
    console.log(`  - Validated: ${allPatterns.length} patterns`);
    console.log(`  - Inserted: ${insertedCount} patterns`);
    console.log(`  - Failed chapters: ${failedCount}`);

    return {
      extracted: extractedCount,
      inserted: insertedCount,
      failed: failedCount,
    };
  }

  /**
   * Read book file content
   */
  private async readBookFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".txt") {
      return await fs.readFile(filePath, "utf-8");
    } else {
      throw new Error(
        `Unsupported file format: ${ext}. Currently only .txt is supported.`,
      );
    }
  }

  /**
   * Split book content into chapters
   */
  private splitIntoChapters(
    content: string,
    range?: { start?: number; end?: number },
  ): Array<{ number: number; title?: string; text: string }> {
    // Look for chapter markers (common patterns)
    const chapterPatterns = [
      /^Chapter\s+(\d+)[:\s]*(.*?)$/gim,
      /^CHAPTER\s+(\d+)[:\s]*(.*?)$/gim,
      /^(\d+)\.\s+(.*?)$/gm,
      /^Part\s+(\d+)[:\s]*(.*?)$/gim,
    ];

    let chapters: Array<{
      number: number;
      title?: string;
      text: string;
      startIndex: number;
    }> = [];

    // Try each pattern to find chapter divisions
    for (const pattern of chapterPatterns) {
      const matches = Array.from(content.matchAll(pattern));
      if (matches.length > 0) {
        // Found chapter markers
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const nextMatch = matches[i + 1];

          const chapterNumber = parseInt(match[1]);
          const chapterTitle = match[2]?.trim();
          const startIndex = match.index! + match[0].length;
          const endIndex = nextMatch?.index || content.length;

          chapters.push({
            number: chapterNumber,
            title: chapterTitle,
            text: content.substring(startIndex, endIndex).trim(),
            startIndex,
          });
        }
        break;
      }
    }

    // If no chapters found, treat the whole content as one chapter
    if (chapters.length === 0) {
      console.log(
        "[BookExtractor] No chapter markers found, treating as single chapter",
      );
      chapters = [
        {
          number: 1,
          title: "Full Content",
          text: content,
          startIndex: 0,
        },
      ];
    }

    // Apply range filter if specified
    if (range) {
      const start = range.start || 1;
      const end = range.end || chapters.length;
      chapters = chapters.filter(
        (ch) => ch.number >= start && ch.number <= end,
      );
    }

    // Remove startIndex before returning
    return chapters.map(({ startIndex, ...chapter }) => chapter);
  }

  /**
   * Insert patterns into database with bulk transaction
   * [ARCH:DB:BULK_TRANSACTION] - Single transaction for performance
   */
  private async insertPatternsToDatabase(
    patterns: CompleteBookPattern[],
    dryRun: boolean,
  ): Promise<number> {
    if (dryRun) {
      console.log("[BookExtractor] Dry run mode - skipping database insertion");
      console.log(
        "[BookExtractor] Would insert:",
        patterns.map((p) => ({
          id: p.id,
          title: p.title,
        })),
      );
      return 0;
    }

    let insertedCount = 0;

    // Use transaction for bulk insertion
    const transaction = this.db.transaction(() => {
      for (const pattern of patterns) {
        try {
          // Convert to format expected by PatternInserter
          const insertPattern = {
            id: pattern.id,
            title: pattern.title,
            summary: pattern.summary,
            snippets: pattern.snippets.map((s) => ({
              snippet_id: s.snippet_id,
              content: s.code,
              language: s.language,
              source_ref: s.source_ref,
            })),
            evidence: pattern.evidence,
            tags: pattern.tags,
          };

          this.patternInserter.insertNewPattern(insertPattern, "NEW_PATTERN");
          insertedCount++;
        } catch (error) {
          console.error(
            `[BookExtractor] Failed to insert pattern "${pattern.title}":`,
            error,
          );
        }
      }
    });

    try {
      transaction();
      console.log(
        `[BookExtractor] Successfully inserted ${insertedCount} patterns`,
      );
    } catch (error) {
      console.error("[BookExtractor] Transaction failed:", error);
      throw error;
    }

    return insertedCount;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
