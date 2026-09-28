import AxeBuilder from '@axe-core/playwright';
import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { pagePaths } from '../../src/data';
import { config } from '../../src/config';

/**
 * axe-core WCAG 2.1 A/AA scan per crawled page. Fails on serious/critical violations;
 * moderate/minor ones are attached to the report as warnings.
 * Limit with A11Y_PAGE_LIMIT (default 200) since axe is slow on a site this size.
 */
test.describe.configure({ mode: 'parallel' });

for (const path of pagePaths(config.a11yPageLimit)) {
  test(`a11y ${path}`, { tag: '@a11y' }, async ({ page }, testInfo) => {
    await gotoAndSettle(page, path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const fmt = (v: (typeof results.violations)[number]) =>
      `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)\n    e.g. ${v.nodes[0]?.target.join(' ')}`;

    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const minor = results.violations.filter((v) => !blocking.includes(v));

    if (results.violations.length) {
      await testInfo.attach('axe-violations.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
    }
    minor.forEach((v) => testInfo.annotations.push({ type: 'a11y-warning', description: fmt(v) }));
    expect(blocking.map(fmt), 'serious/critical accessibility violations').toEqual([]);
  });
}
