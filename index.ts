import { Collection } from 'mongodb';
import { createHash } from 'crypto';
import * as debug from 'debug';

export namespace DynamicIndexes {

  export interface DBIndex {
    v: number;
    key: { [key: string]: number };
    name: string;
    ns: string;
    background: boolean;
  }

  export interface DBIndexStats {
    name: string;
    accesses: {
      ops: number;
      since: Date;
    };
  }

  const d = debug('app:dynamic-index');

  export class Watcher {
    collection: Collection;
    indexes = new Set<string>();
    processQueue: Promise<any>[] = [];

    /**
     *
     * @param {Collection} collection
     */
    constructor(collection: Collection) {
      this.collection = collection;
      // this.cleanup().catch((e) => console.error(e));
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async loadIndexes(): Promise<void> {
      const indexes: DBIndex[] = await this.collection.indexes();

      this.indexes.clear();

      indexes.forEach((dbIndex) => {
        const key = DynamicIndexes.flattenKeys(Object.keys(dbIndex.key));

        this.indexes.add(key);
      });
    }

    /**
     *
     * @param {string[]} keys
     * @returns {boolean}
     */
    track(keys: string[]) {
      if (keys.length === 0) {
        return;
      }

      const key = DynamicIndexes.flattenKeys(keys);
      const name = `di:${key}`;

      if (this.indexes.has(key)) {
        return false;
      }

      d(`adding ${name} DynamicIndex to ${this.collection.collectionName}`);

      this.indexes.add(key);

      const schema = keys.reduce((result: any, propertyName: string) => {
        result[propertyName] = 1;

        return result;
      }, {});

      const promise = this.collection.createIndex(schema, {
        name,
        background: true,
      });

      /* tslint:disable-next-line */
      promise.catch(() => null).then(() => {
        this.processQueue.splice(this.processQueue.indexOf(promise), 1);
      });

      this.processQueue.push(promise);

      return true;
    }

    /**
     *
     * @param {number} interval
     * @returns {Promise<any[]>}
     */
    async cleanup(interval = 1000 * 3600 * 24 * 7) {
      const result = [];

      // - return only indexes matching /^di/ pattern
      const indexStats: DBIndexStats[] = await this.collection
        .aggregate([{ $indexStats: {} }])
        .toArray()
        .then(DynamicIndexes.filterIndexes);

      for (const indexStat of indexStats) {
        const dayDiff = (new Date().getTime() - indexStat.accesses.since.getTime()) / interval;
        const frequency = indexStat.accesses.ops / dayDiff;

        // - delete index if it's being used less than once per xxx time
        if (frequency < 1) {
          result.push(indexStat.name);

          d(`dropping ${indexStat.name} DynamicIndex from ${this.collection.collectionName}`);

          await this.collection.dropIndex(indexStat.name);
        }
      }

      await this.loadIndexes();

      return result;
    }
  }

  /**
   *
   * @param {string[]} keys
   * @returns {string}
   */
  export function flattenKeys(keys: string[]) {
    const str = keys.sort((a, b) => a.localeCompare(b)).join(';');

    if (str.length < 120) {
      return str;
    }

    return createHash('md5')
      .update(str)
      .digest('hex');
  }

  /**
   *
   * @param {Watcher.DBIndexStats[]} results
   * @returns {Watcher.DBIndexStats[]}
   */
  export function filterIndexes(results: DBIndexStats[]) {
    const pattern = /^di/;

    return results.filter((indexStat: DBIndexStats) => {
      return pattern.test(indexStat.name);
    });
  }
}
