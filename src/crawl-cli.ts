import { crawl } from './crawler';
import { config } from './config';

console.log(`Crawling ${config.baseURL} (max ${config.maxPages} pages, concurrency ${config.crawlConcurrency})`);
crawl()
  .then(({ broken }) => {
    if (broken.length) {
      console.log('\nBroken pages found during crawl:');
      for (const b of broken.slice(0, 50)) console.log(`  ${b.status || 'ERR'}  ${b.url}  (linked from ${b.from ?? 'seed'})`);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
