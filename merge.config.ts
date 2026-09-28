// Used by CI to merge sharded blob reports: npx playwright merge-reports --config merge.config.ts ./all-blobs
import { config } from './src/config';

export default {
  testDir: './tests',
  reporter: [
    ['html', { open: 'never' }],
    ['./src/reporters/extent-reporter.ts', { outputFolder: config.reportDir, documentTitle: config.reportTitle }],
  ],
};
