import * as lancedb from "@lancedb/lancedb";
import { randomUUID } from "node:crypto";

const TABLE_NAME = "growth_signals";

export class GrowthDB {
    constructor(dbPath, vectorDim = 3072) {
        this.dbPath = dbPath;
        this.vectorDim = vectorDim;
        this.db = null;
        this.table = null;
    }

    async init() {
        this.db = await lancedb.connect(this.dbPath);
        const tables = await this.db.tableNames();
        if (tables.includes(TABLE_NAME)) {
            this.table = await this.db.openTable(TABLE_NAME);
        } else {
            this.table = await this.db.createTable(TABLE_NAME, [
                {
                    id: randomUUID(),
                    source: "init",
                    title: "",
                    url: "",
                    content: "",
                    type: "pattern",
                    vector: new Array(this.vectorDim).fill(0),
                    created_at: Date.now()
                }
            ]);
            await this.table.delete("source = 'init'");
        }
    }

    async addSignal(signal) {
        const row = {
            id: randomUUID(),
            created_at: Date.now(),
            ...signal
        };
        await this.table.add([row]);
        return row;
    }

    async searchSimilar(vector, limit = 5) {
        const results = await this.table
            .vectorSearch(vector)
            .limit(limit)
            .toArray();
        return results.map(row => ({
            score: 1 / (1 + row._distance),
            ...row
        }));
    }
}
