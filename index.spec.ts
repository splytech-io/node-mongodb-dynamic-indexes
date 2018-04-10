import { expect } from 'chai';
import { Collection } from 'mongodb';
import { DynamicIndexes } from './index';
import sinon = require('sinon');

describe('DynamicIndexes', () => {
  const sandbox = sinon.sandbox.create();

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  function createCollection(): Collection {
    const indexes: DynamicIndexes.DBIndex[] = [{
      v: 0,
      key: { _id: 1 },
      name: '_id',
      ns: 'none',
      background: false,
    }];

    return <any>{
      indexes: async () => indexes,
      dropIndex: async (name: string) => {
        const index = indexes.find((item) => item.name === name);

        if (index) {
          indexes.splice(indexes.indexOf(index), 1);
        }
      },
      createIndex: async (schema: object, options: { name: string }) => {
        indexes.push({
          v: 0,
          key: <any>schema,
          name: options.name,
          ns: 'none',
          background: true,
        });
      },
      aggregate: () => ({
        toArray: async (): Promise<DynamicIndexes.DBIndexStats[]> => {
          return indexes.map((item) => ({
            name: item.name,
            accesses: {
              ops: 0,
              since: new Date(Date.now() - 1000),
            },
          }));
        },
      }),
    };
  }

  it('should flatten keys', async () => {
    expect(DynamicIndexes.flattenKeys(['bob', 'alice'])).to.equals('alice;bob');
  });

  it('should filter di indexes', async () => {
    const date = new Date();

    expect(DynamicIndexes.filterIndexes([{
      name: 'test',
      accesses: {
        ops: 1,
        since: date,
      },
    }, {
      name: 'di:a',
      accesses: {
        ops: 1,
        since: date,
      },
    }])).to.deep.equals([{
      name: 'di:a',
      accesses: {
        ops: 1,
        since: date,
      },
    }]);
  });

  it('indexes should not be created initially', async () => {
    const collection = createCollection();
    const di = new DynamicIndexes.Watcher(collection);

    await di.loadIndexes();

    expect(di.indexes.has('a')).to.equal(false);
    expect(di.indexes.has('b')).to.equal(false);

    expect(di.indexes.size).to.gt(0);
  });

  it('should not start tracking system index', async () => {
    const collection = createCollection();
    const di = new DynamicIndexes.Watcher(collection);

    await di.loadIndexes();

    expect(di.track(['_id'])).to.equal(false);

    await Promise.all(di.processQueue);

    expect(di.processQueue.length).to.equals(0);
  });

  it('should dynamically add indexes', async () => {
    const collection = createCollection();
    const di = new DynamicIndexes.Watcher(collection);

    await di.loadIndexes();

    expect(di.track(['a'])).to.equal(true);
    expect(di.track(['b'])).to.equal(true);
    expect(di.track(['b'])).to.equal(false);

    expect(di.processQueue.length).to.equals(2);

    await Promise.all(di.processQueue);

    expect(di.processQueue.length).to.equals(0);

    await di.loadIndexes();

    expect(di.indexes.has('a')).to.equal(true);
    expect(di.indexes.has('b')).to.equal(true);

    await Promise.all(di.processQueue);
  });

  it('should not throw an error for very long expressions', async () => {
    const collection = createCollection();
    const di = new DynamicIndexes.Watcher(collection);

    await di.loadIndexes();

    expect(di.track([
      'references.partner_ids',
      'references.something_else',
      'references.another_key',
      'references.another_key2',
      'references.another_key3',
      'type',
    ])).to.equal(true);

    expect(di.processQueue.length).to.equals(1);

    await Promise.all(di.processQueue);

    expect(di.processQueue.length).to.equals(0);

    await di.loadIndexes();
  });

  it('should cleanup indexes', async () => {
    const collection = createCollection();
    const di = new DynamicIndexes.Watcher(collection);

    await di.loadIndexes();

    expect(di.track(['one'])).to.equal(true);
    expect(di.track(['two'])).to.equal(true);

    expect(di.processQueue.length).to.equals(2);

    await Promise.all(di.processQueue);

    await di.cleanup().then((results: any[]) => {
      expect(results.sort()).to.deep.equals([
        'di:one',
        'di:two',
      ]);
    });
  });
});
