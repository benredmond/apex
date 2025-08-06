import { createHash } from "crypto";
function extractKeywords(data) {
    const keywords = new Set();
    if (data.title) {
        const titleWords = data.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2);
        titleWords.forEach((w) => keywords.add(w));
    }
    if (data.summary) {
        const summaryWords = data.summary
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2);
        summaryWords.forEach((w) => keywords.add(w));
    }
    if (data.snippets && Array.isArray(data.snippets)) {
        data.snippets.forEach((snippet) => {
            if (snippet.language) {
                keywords.add(snippet.language.toLowerCase());
            }
            if (snippet.content) {
                const snippetWords = snippet.content
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, " ")
                    .split(/\s+/)
                    .slice(0, 10)
                    .filter((w) => w.length > 2);
                snippetWords.forEach((w) => keywords.add(w));
            }
        });
    }
    if (data.id) {
        const idParts = data.id.split(":");
        idParts.forEach((part) => {
            if (part &&
                !["APEX", "SYSTEM", "PAT", "FIX", "CODE", "CMD"].includes(part)) {
                keywords.add(part.toLowerCase());
            }
        });
    }
    return Array.from(keywords).join(" ");
}
function buildSearchIndex(data) {
    const indexParts = [];
    if (data.title) {
        indexParts.push(data.title);
        indexParts.push(data.title);
    }
    if (data.summary) {
        indexParts.push(data.summary);
    }
    if (data.snippets && Array.isArray(data.snippets)) {
        data.snippets.forEach((snippet) => {
            if (snippet.content) {
                indexParts.push(snippet.content);
            }
        });
    }
    if (data.evidence && Array.isArray(data.evidence)) {
        data.evidence.forEach((ev) => {
            if (ev.file) {
                indexParts.push(ev.file);
            }
        });
    }
    return indexParts.join(" ");
}
const migration = {
    version: 9,
    id: "009-populate-pattern-search-fields",
    name: "Populate search fields from json_canonical for existing patterns",
    up(db) {
        try {
            const needsUpdate = db
                .prepare(`
        SELECT COUNT(*) as count 
        FROM patterns 
        WHERE (tags IS NULL OR keywords IS NULL OR search_index IS NULL)
          AND json_canonical IS NOT NULL
      `)
                .get();
            console.log(`[Migration 009] Found ${needsUpdate.count} patterns needing search field population`);
            if (needsUpdate.count === 0) {
                console.log(`[Migration 009] No patterns need updating, skipping`);
                return;
            }
            const patterns = db
                .prepare(`
        SELECT id, json_canonical 
        FROM patterns 
        WHERE (tags IS NULL OR keywords IS NULL OR search_index IS NULL)
          AND json_canonical IS NOT NULL
      `)
                .all();
            const updateStmt = db.prepare(`
        UPDATE patterns 
        SET tags = ?, keywords = ?, search_index = ?
        WHERE id = ?
      `);
            console.log(`[Migration 009] Dropping update trigger temporarily...`);
            db.exec(`DROP TRIGGER IF EXISTS patterns_au`);
            let successCount = 0;
            let errorCount = 0;
            for (const pattern of patterns) {
                try {
                    const data = JSON.parse(pattern.json_canonical);
                    let tagsStr = "";
                    if (data.tags) {
                        if (Array.isArray(data.tags)) {
                            tagsStr = data.tags.join(",");
                        }
                        else if (typeof data.tags === "string") {
                            tagsStr = data.tags;
                        }
                    }
                    const keywords = extractKeywords(data);
                    const searchIndex = buildSearchIndex(data);
                    updateStmt.run(tagsStr, keywords, searchIndex, pattern.id);
                    successCount++;
                }
                catch (error) {
                    console.error(`[Migration 009] Error processing pattern ${pattern.id}:`, error);
                    errorCount++;
                }
            }
            console.log(`[Migration 009] Successfully updated ${successCount} patterns, ${errorCount} errors`);
            console.log(`[Migration 009] Recreating update trigger...`);
            db.exec(`
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
      `);
            console.log(`[Migration 009] Rebuilding FTS5 index...`);
            db.exec(`DELETE FROM patterns_fts`);
            db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, tags, keywords, search_index
        FROM patterns
        WHERE invalid = 0
      `);
            db.exec(`INSERT INTO patterns_fts(patterns_fts) VALUES('optimize')`);
            console.log(`[Migration 009] FTS5 index rebuilt successfully`);
        }
        catch (error) {
            throw new Error(`Migration 009 failed: ${error.message}`);
        }
    },
    down(db) {
        try {
            console.log(`[Migration 009] Rolling back - clearing search fields`);
            db.exec(`DROP TRIGGER IF EXISTS patterns_au`);
            db.exec(`
        UPDATE patterns 
        SET tags = NULL, keywords = NULL, search_index = NULL
      `);
            db.exec(`DELETE FROM patterns_fts`);
            db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, NULL, NULL, NULL
        FROM patterns
      `);
            db.exec(`
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
      `);
            console.log(`[Migration 009] Rollback complete`);
        }
        catch (error) {
            throw new Error(`Migration 009 rollback failed: ${error.message}`);
        }
    },
    get checksum() {
        const hash = createHash("sha256");
        hash.update(this.up.toString());
        hash.update(this.down.toString());
        return hash.digest("hex");
    },
};
export default migration;
