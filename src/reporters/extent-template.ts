import fs from 'fs';
import path from 'path';
import type { XReport } from './extent-reporter';

const asset = (name: string) => fs.readFileSync(path.join(__dirname, 'extent', name), 'utf8');

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Builds the single-page report; data is embedded as JSON and rendered by extent.js. */
export function renderExtentHtml(report: XReport): string {
  // "<" is escaped so no string in the data can close the <script> tag.
  const data = JSON.stringify(report).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.title)}</title>
<style>${asset('extent.css')}</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="logo">E</span><span>${esc(report.title)}</span></div>
  <div class="topbar-meta"><span id="run-name">${esc(report.reportName)}</span><span id="run-date"></span>
    <button id="theme" class="icon-btn" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>
  </div>
</header>
<nav class="sidenav" aria-label="Report views">
  <button data-view="dashboard" class="active" type="button"><span>▦</span>Dashboard</button>
  <button data-view="tests" type="button"><span>☰</span>Tests</button>
  <button data-view="categories" type="button"><span>#</span>Categories</button>
  <button data-view="devices" type="button"><span>▭</span>Devices</button>
  <button data-view="exceptions" type="button"><span>!</span>Exceptions</button>
</nav>
<main id="app"></main>
<script type="application/json" id="report-data">${data}</script>
<script>${asset('extent.js')}</script>
</body>
</html>`;
}
