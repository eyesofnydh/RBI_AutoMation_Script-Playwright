import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { config as siteConfig } from '../config';
import { parseLogAnnotation } from '../utils/reportLogger';
import { renderExtentHtml } from './extent-template';

/**
 * Extent-style HTML report (modelled on AventStack ExtentReports "Spark"), written to
 * extent-report/index.html (plus assets/ for screenshots, videos and traces).
 *
 * AventStack ExtentReports itself is a Java/.NET library, so this reporter reproduces its
 * layout for Playwright: Dashboard, Tests (with step log), Categories (= tags),
 * Devices (= projects), Exceptions and System info.
 *
 * Log lines come from:
 *  - test.step() and expect() calls (the step tree, with timings and errors)
 *  - `log.info/pass/warning/fail()` and SoftAssert (src/utils) → annotations `extent:*`
 *  - attachments (screenshots are shown inline, video/trace/JSON linked)
 *
 * Options (playwright.config.ts):
 *   ['./src/reporters/extent-reporter.ts', { outputFolder: 'extent-report', documentTitle: '…' }]
 */
type Options = { outputFolder?: string; documentTitle?: string; reportName?: string; maxStepsPerTest?: number };

export type XStatus = 'pass' | 'fail' | 'skip' | 'flaky' | 'warning' | 'info';

export type XStep = {
  title: string;
  category: string;
  status: XStatus;
  start: number;
  duration: number;
  error?: string;
  location?: string;
  steps: XStep[];
};

export type XAttachment = { name: string; contentType: string; href?: string; inline?: string };

export type XAttempt = {
  retry: number;
  status: XStatus;
  start: number;
  duration: number;
  errors: { message: string; stack?: string; snippet?: string; location?: string }[];
  steps: XStep[];
  logs: { status: XStatus; time?: number; message: string }[];
  attachments: XAttachment[];
  stdout: string[];
  stderr: string[];
};

export type XTest = {
  id: string;
  title: string;
  suitePath: string[];
  file: string;
  line: number;
  project: string;
  tags: string[];
  annotations: { type: string; description?: string }[];
  status: XStatus;
  duration: number;
  start: number;
  attempts: XAttempt[];
};

export type XReport = {
  title: string;
  reportName: string;
  start: number;
  end: number;
  status: string;
  system: [string, string][];
  tests: XTest[];
};

const MAX_INLINE_TEXT = 20_000;

class ExtentReporter implements Reporter {
  private readonly out: string;
  private readonly assetsDir: string;
  private readonly title: string;
  private readonly reportName: string;
  private readonly maxSteps: number;
  private config!: FullConfig;
  private start = Date.now();
  private readonly tests = new Map<string, XTest>();
  private assetSeq = 0;

  constructor(opts: Options = {}) {
    this.out = path.resolve(process.cwd(), opts.outputFolder ?? 'extent-report');
    this.assetsDir = path.join(this.out, 'assets');
    this.title = opts.documentTitle ?? 'Automation Report';
    this.reportName = opts.reportName ?? new URL(siteConfig.baseURL).host;
    this.maxSteps = opts.maxStepsPerTest ?? 400;
  }

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.config = config;
    this.start = Date.now();
    fs.rmSync(this.out, { recursive: true, force: true });
    fs.mkdirSync(this.assetsDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const x = this.tests.get(test.id) ?? this.newTest(test, result);
    this.tests.set(test.id, x);
    x.attempts.push(this.attempt(test, result, x));
    x.duration += result.duration;
    // Playwright's own outcome handles retries (flaky) and test.fail(); the last attempt wins.
    const outcome = test.outcome();
    x.status = outcome === 'expected' ? (result.status === 'skipped' ? 'skip' : 'pass') : outcome === 'flaky' ? 'flaky' : outcome === 'skipped' ? 'skip' : 'fail';
  }

  async onEnd(result: FullResult) {
    const report: XReport = {
      title: this.title,
      reportName: this.reportName,
      // merge-reports calls onBegin at merge time, so take the earliest test start instead.
      start: Math.min(this.start, ...[...this.tests.values()].map((t) => t.start)),
      end: Date.now(),
      status: result.status,
      system: this.systemInfo(),
      tests: [...this.tests.values()],
    };
    fs.mkdirSync(this.out, { recursive: true });
    fs.writeFileSync(path.join(this.out, 'index.html'), renderExtentHtml(report));
    fs.writeFileSync(
      path.join(this.out, 'summary.json'),
      JSON.stringify(
        {
          status: result.status,
          start: new Date(report.start).toISOString(),
          end: new Date(report.end).toISOString(),
          counts: countBy(report.tests.map((t) => t.status)),
        },
        null,
        2,
      ),
    );
    const rel = path.relative(process.cwd(), path.join(this.out, 'index.html'));
    console.log(`\n  Extent report: ${rel}`);
  }

  // ------------------------------------------------------------------------------------------

  private newTest(test: TestCase, result: TestResult): XTest {
    const [, projectName, file, ...describes] = test.titlePath();
    return {
      id: test.id,
      title: test.title,
      suitePath: describes.slice(0, -1).filter(Boolean),
      file: path.relative(this.config?.rootDir ?? process.cwd(), test.location.file) || file,
      line: test.location.line,
      project: projectName || test.parent.project()?.name || '',
      tags: test.tags.map((t) => t.replace(/^@/, '')),
      annotations: [],
      status: 'skip',
      duration: 0,
      start: result.startTime.getTime(),
      attempts: [],
    };
  }

  private attempt(test: TestCase, result: TestResult, x: XTest): XAttempt {
    const status: XStatus =
      result.status === 'skipped' ? 'skip' : result.status === test.expectedStatus ? 'pass' : 'fail';

    const annotations = (result as TestResult & { annotations?: TestCase['annotations'] }).annotations ?? test.annotations;
    const logs = annotations
      .map((a) => parseLogAnnotation(a))
      .filter((l): l is NonNullable<typeof l> => !!l)
      .map((l) => ({ status: l.status as XStatus, time: l.time?.getTime(), message: l.message }));
    x.annotations = dedupe([...x.annotations, ...annotations.filter((a) => !a.type.startsWith('extent:'))]);

    let budget = this.maxSteps;
    const mapStep = (s: TestStep, depth: number): XStep | undefined => {
      if (budget-- <= 0) return undefined;
      if (s.category === 'fixture' && !s.error) return undefined;
      return {
        title: s.title,
        category: s.category,
        status: s.error ? 'fail' : 'pass',
        start: s.startTime.getTime(),
        duration: s.duration,
        error: s.error?.message ? stripAnsi(s.error.message).split('\n').slice(0, 6).join('\n') : undefined,
        location: s.location ? `${path.basename(s.location.file)}:${s.location.line}` : undefined,
        steps: depth < 4 ? (s.steps.map((c) => mapStep(c, depth + 1)).filter(Boolean) as XStep[]) : [],
      };
    };
    // Hooks with no nested user steps are noise; keep them only when something inside failed or logged.
    const steps = result.steps
      .map((s) => mapStep(s, 0))
      .filter((s): s is XStep => !!s)
      .filter((s) => s.category !== 'hook' || s.status === 'fail' || s.steps.some((c) => c.category === 'test.step'))
      // SoftAssert / logger internals are already in the log as pass/fail lines; passing API calls are noise.
      .filter((s) => !(s.location && /^(softAssert|reportLogger)\.ts:/.test(s.location)))
      .filter((s) => s.category !== 'pw:api' || s.status === 'fail');

    return {
      retry: result.retry,
      status,
      start: result.startTime.getTime(),
      duration: result.duration,
      errors: result.errors.map((e) => ({
        message: stripAnsi(e.message ?? e.value ?? 'Error'),
        stack: e.stack ? stripAnsi(e.stack) : undefined,
        snippet: e.snippet ? stripAnsi(e.snippet) : undefined,
        location: e.location ? `${path.relative(process.cwd(), e.location.file)}:${e.location.line}` : undefined,
      })),
      steps,
      logs,
      attachments: result.attachments.map((a) => this.saveAttachment(test, result, a)).filter(Boolean) as XAttachment[],
      stdout: result.stdout.map(String).slice(0, 200),
      stderr: result.stderr.map(String).slice(0, 200),
    };
  }

  /** Copies attachment files into assets/ so the report folder is self-contained. */
  private saveAttachment(test: TestCase, result: TestResult, a: TestResult['attachments'][number]): XAttachment | undefined {
    const isText = /^(text\/|application\/json)/.test(a.contentType);
    if (a.body && isText) {
      return { name: a.name, contentType: a.contentType, inline: a.body.toString('utf8').slice(0, MAX_INLINE_TEXT) };
    }
    const ext = path.extname(a.path ?? '') || extFor(a.contentType);
    const fileName = `${++this.assetSeq}-${slug(test.title).slice(0, 40)}-r${result.retry}-${slug(a.name).slice(0, 30)}${ext}`;
    const dest = path.join(this.assetsDir, fileName);
    try {
      if (a.path && fs.existsSync(a.path)) fs.copyFileSync(a.path, dest);
      else if (a.body) fs.writeFileSync(dest, a.body);
      else return undefined;
    } catch {
      return undefined;
    }
    return { name: a.name, contentType: a.contentType, href: `assets/${fileName}` };
  }

  private systemInfo(): [string, string][] {
    const projects = this.config?.projects ?? [];
    const version = this.config?.version ?? '';
    return [
      ['Base URL', siteConfig.baseURL],
      ['Projects (devices)', projects.map((p) => p.name).join(', ')],
      ['Browser window', siteConfig.maximize ? `Maximised (${siteConfig.windowSize.join('×')} headless)` : 'Fixed viewport'],
      ['Playwright', version],
      ['Node.js', process.version],
      ['OS', `${os.type()} ${os.release()} (${os.arch()})`],
      ['Host', os.hostname()],
      ['User', safeUser()],
      ['Workers', String(this.config?.workers ?? '')],
      ['Retries', String(projects[0]?.retries ?? '')],
      ['CI', process.env.CI ? 'yes' : 'no'],
    ];
  }
}

// ---------------------------------------------------------------------------------------------
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file';
const extFor = (ct: string) =>
  ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'video/webm': '.webm', 'application/zip': '.zip', 'text/html': '.html' })[ct] ?? '.bin';
const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const dedupe = <T extends { type: string; description?: string }>(xs: T[]) =>
  xs.filter((a, i) => xs.findIndex((b) => b.type === a.type && b.description === a.description) === i);
function safeUser() {
  try {
    return os.userInfo().username;
  } catch {
    return '';
  }
}

export default ExtentReporter;
