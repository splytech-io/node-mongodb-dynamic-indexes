# MongoDB Dynamic Indexes

## examples

```typescript
import { DynamicIndexes } from '@splytech-io/mongodb-dynamic-indexes';

const collection = MongoDB.collection;
const di = new DynamicIndexes.Watcher(collection);

// - init
await di.loadIndexes();

// - add new index
const filter = {
  name: 'John',
  surname: 'Smith',
}
// create new dynamic index based on mongodb query
di.track(Object.keys(filter));
collection.findOne(filter).then(...);

// - cleanup
setInterval(() => {
  di.cleanup(/*milis: number*/); //removes unused dynamic indexes
}, 3600000);
```
