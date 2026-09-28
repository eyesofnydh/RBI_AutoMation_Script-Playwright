(function () {
  'use strict';
  var R = JSON.parse(document.getElementById('report-data').textContent);
  var app = document.getElementById('app');
  var COLORS = { pass: 'var(--pass)', fail: 'var(--fail)', skip: 'var(--skip)', flaky: 'var(--flaky)', info: 'var(--info)', warning: 'var(--warning)' };
  var LABEL = { pass: 'Pass', fail: 'Fail', skip: 'Skip', flaky: 'Flaky', info: 'Info', warning: 'Warning' };
  var state = { view: 'dashboard', status: 'all', q: '', tag: '', device: '', selected: null };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dur(ms) {
    if (ms == null) return '';
    if (ms < 1000) return ms + 'ms';
    var s = ms / 1000;
    if (s < 60) return s.toFixed(s < 10 ? 2 : 1) + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + Math.round(s % 60) + 's';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function time(t) {
    return t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  }
  function dateTime(t) {
    return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function badge(s) {
    return '<span class="badge ' + s + '">' + LABEL[s] + '</span>';
  }
  function counts(tests) {
    var c = { total: tests.length, pass: 0, fail: 0, skip: 0, flaky: 0 };
    tests.forEach(function (t) { c[t.status]++; });
    return c;
  }
  function bar(c) {
    if (!c.total) return '<div class="bar"></div>';
    return '<div class="bar" title="' + c.pass + ' pass · ' + c.fail + ' fail · ' + c.skip + ' skip · ' + c.flaky + ' flaky">' +
      ['pass', 'flaky', 'fail', 'skip'].map(function (k) {
        return c[k] ? '<i style="width:' + (100 * c[k] / c.total) + '%;background:' + COLORS[k] + '"></i>' : '';
      }).join('') + '</div>';
  }
  function donut(parts, label) {
    var total = parts.reduce(function (a, p) { return a + p.n; }, 0) || 1;
    var at = 0;
    var stops = parts.filter(function (p) { return p.n; }).map(function (p) {
      var from = at; at += 360 * p.n / total;
      return p.color + ' ' + from + 'deg ' + at + 'deg';
    });
    var bg = stops.length ? 'conic-gradient(' + stops.join(',') + ')' : 'var(--border)';
    return '<div class="donut-wrap"><div class="donut" style="background:' + bg + '" data-label="' + esc(label) + '"></div>' +
      '<ul class="legend">' + parts.map(function (p) {
        return '<li><span class="swatch" style="background:' + p.color + '"></span>' + esc(p.label) + ' <b>' + p.n + '</b></li>';
      }).join('') + '</ul></div>';
  }
  function groupBy(tests, keyFn) {
    var m = {};
    tests.forEach(function (t) {
      [].concat(keyFn(t)).forEach(function (k) { (m[k] = m[k] || []).push(t); });
    });
    return Object.keys(m).sort().map(function (k) { return { key: k, tests: m[k] }; });
  }
  function lastAttempt(t) { return t.attempts[t.attempts.length - 1]; }
  function firstLine(s) { return String(s || '').split('\n').filter(Boolean)[0] || ''; }
  function eventCounts() {
    var c = { pass: 0, fail: 0, info: 0, warning: 0, skip: 0 };
    function walk(steps) {
      steps.forEach(function (s) { if (s.category === 'test.step' || s.category === 'expect') c[s.status]++; walk(s.steps); });
    }
    R.tests.forEach(function (t) {
      var a = lastAttempt(t);
      if (!a) return;
      walk(a.steps);
      a.logs.forEach(function (l) { c[l.status] = (c[l.status] || 0) + 1; });
    });
    return c;
  }

  // ---------- views ----------
  function dashboard() {
    var c = counts(R.tests);
    var passRate = c.total - c.skip ? Math.round(100 * (c.pass + c.flaky) / (c.total - c.skip)) : 0;
    var ev = eventCounts();
    var kpi = function (cls, v, l) { return '<div class="card kpi ' + cls + '"><div class="value">' + v + '</div><div class="label">' + l + '</div></div>'; };
    var summaryTable = function (title, groups, col) {
      return '<div class="card"><h3>' + title + '</h3><div class="table-scroll"><table><thead><tr><th>' + col +
        '</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th><th class="num">Flaky</th><th></th></tr></thead><tbody>' +
        groups.map(function (g) {
          var k = counts(g.tests);
          return '<tr><td>' + esc(g.key) + '</td><td class="num">' + k.pass + '</td><td class="num">' + k.fail + '</td><td class="num">' + k.skip +
            '</td><td class="num">' + k.flaky + '</td><td style="width:30%">' + bar(k) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    };
    return '<div class="grid kpis">' +
      kpi('', c.total, 'Tests') + kpi('pass', c.pass, 'Passed') + kpi('fail', c.fail, 'Failed') + kpi('skip', c.skip, 'Skipped') +
      kpi('flaky', c.flaky, 'Flaky (passed on retry)') + kpi('', dur(R.end - R.start), 'Duration') +
      '</div><div class="grid two" style="margin-top:16px">' +
      '<div class="card"><h3>Tests</h3>' + donut([
        { label: 'Passed', n: c.pass, color: COLORS.pass }, { label: 'Failed', n: c.fail, color: COLORS.fail },
        { label: 'Skipped', n: c.skip, color: COLORS.skip }, { label: 'Flaky', n: c.flaky, color: COLORS.flaky },
      ], passRate + '%\npass') + '</div>' +
      '<div class="card"><h3>Log events</h3>' + donut([
        { label: 'Pass', n: ev.pass, color: COLORS.pass }, { label: 'Fail', n: ev.fail, color: COLORS.fail },
        { label: 'Warning', n: ev.warning, color: COLORS.warning }, { label: 'Info', n: ev.info, color: COLORS.info },
        { label: 'Skip', n: ev.skip, color: COLORS.skip },
      ], String(ev.pass + ev.fail + ev.warning + ev.info + ev.skip)) + '</div>' +
      '<div class="card"><h3>Run</h3><table><tbody>' +
      '<tr><th>Started</th><td>' + dateTime(R.start) + '</td></tr><tr><th>Ended</th><td>' + dateTime(R.end) + '</td></tr>' +
      '<tr><th>Result</th><td>' + esc(R.status) + '</td></tr></tbody></table></div>' +
      '<div class="card"><h3>System / Environment</h3><table><tbody>' + R.system.map(function (r) {
        return '<tr><th>' + esc(r[0]) + '</th><td style="overflow-wrap:anywhere">' + esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      summaryTable('Categories', groupBy(R.tests, function (t) { return t.tags.length ? t.tags : ['(untagged)']; }), 'Category') +
      summaryTable('Devices', groupBy(R.tests, function (t) { return t.project || '(default)'; }), 'Device') +
      summaryTable('Features (spec files)', groupBy(R.tests, function (t) { return t.file; }), 'Spec') +
      '</div>';
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return R.tests.filter(function (t) {
      if (state.status !== 'all' && t.status !== state.status) return false;
      if (state.tag && t.tags.indexOf(state.tag) < 0) return false;
      if (state.device && t.project !== state.device) return false;
      if (q && (t.title + ' ' + t.suitePath.join(' ') + ' ' + t.file + ' ' + t.tags.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function testsView() {
    var list = filtered();
    if (!state.selected || !list.some(function (t) { return t.id === state.selected; })) {
      var firstFail = list.filter(function (t) { return t.status === 'fail'; })[0];
      state.selected = (firstFail || list[0] || {}).id || null;
    }
    var c = counts(R.tests);
    var chip = function (s, label, n) {
      return '<button type="button" class="chip' + (state.status === s ? ' active' : '') + '" data-status="' + s + '">' + label + ' ' + n + '</button>';
    };
    var filters = (state.tag ? '<button type="button" class="chip active" data-clear="tag">#' + esc(state.tag) + ' ✕</button>' : '') +
      (state.device ? '<button type="button" class="chip active" data-clear="device">' + esc(state.device) + ' ✕</button>' : '');
    return '<div class="split"><div class="card list-pane"><div class="toolbar">' +
      '<input id="q" type="search" placeholder="Search tests, tags, files…" value="' + esc(state.q) + '">' +
      chip('all', 'All', c.total) + chip('pass', 'Pass', c.pass) + chip('fail', 'Fail', c.fail) + chip('skip', 'Skip', c.skip) + chip('flaky', 'Flaky', c.flaky) +
      filters + '</div><ul class="test-list">' +
      (list.length ? list.map(function (t) {
        return '<li><button type="button" data-test="' + esc(t.id) + '" class="' + (t.id === state.selected ? 'selected' : '') + '">' +
          '<span class="dot ' + t.status + '"></span><span style="min-width:0"><span class="t-title">' + esc(t.title) + '</span>' +
          '<span class="t-sub">' + esc([t.project].concat(t.suitePath).join(' › ')) + '</span></span>' +
          '<span class="t-time">' + dur(t.duration) + '</span></button></li>';
      }).join('') : '<li class="empty">No tests match.</li>') +
      '</ul></div><div class="card detail" id="detail">' + detail(R.tests.filter(function (t) { return t.id === state.selected; })[0]) + '</div></div>';
  }

  function logRows(a) {
    var rows = [];
    function stepRow(s, depth, parentId, idx) {
      var id = parentId + '-' + idx;
      rows.push({
        t: s.start, depth: depth, parent: depth ? parentId : null, id: id,
        html: '<td>' + badge(s.status) + '</td><td>' + time(s.start) + '</td><td class="msg">' +
          (s.steps.length ? '<button type="button" class="step-toggle" data-toggle="' + id + '" aria-expanded="false">▸</button>' : '') +
          esc(s.title) + '<span class="dur">' + dur(s.duration) + '</span>' + (s.location ? '<span class="loc">' + esc(s.location) + '</span>' : '') +
          (s.error ? '<div class="step-err">' + esc(s.error) + '</div>' : '') + '</td>',
      });
      s.steps.forEach(function (k, i) { stepRow(k, depth + 1, id, i); });
    }
    var top = a.steps.map(function (s, i) { return { kind: 'step', t: s.start, s: s, i: i }; })
      .concat(a.logs.map(function (l) { return { kind: 'log', t: l.time || a.start, l: l }; }))
      .sort(function (x, y) { return x.t - y.t; });
    top.forEach(function (e) {
      if (e.kind === 'step') stepRow(e.s, 0, 's', e.i);
      else rows.push({ depth: 0, html: '<td>' + badge(e.l.status) + '</td><td>' + time(e.l.time) + '</td><td class="msg">' + esc(e.l.message) + '</td>' });
    });
    return rows.map(function (r) {
      var cls = r.depth ? 'child' : '';
      var attrs = r.depth ? ' data-parent="' + r.parent + '" hidden style="--depth:' + r.depth + '"' : '';
      return '<tr class="' + cls + '"' + attrs + (r.id ? ' data-id="' + r.id + '"' : '') + '>' + r.html + '</tr>';
    }).join('');
  }

  function attemptBody(t, a) {
    var h = '';
    if (a.errors.length) {
      h += '<div class="section-title">Errors</div>' + a.errors.map(function (e) {
        return '<pre class="err">' + esc(e.message) + (e.location ? '\n\n at ' + esc(e.location) : '') + '</pre>' +
          (e.snippet ? '<pre class="code">' + esc(e.snippet) + '</pre>' : '');
      }).join('');
    }
    var logs = logRows(a);
    h += '<div class="section-title">Steps &amp; log</div>' + (logs
      ? '<div class="table-scroll"><table class="log-table"><thead><tr><th>Status</th><th>Time</th><th>Details</th></tr></thead><tbody>' + logs + '</tbody></table></div>'
      : '<div class="empty">No steps recorded.</div>');
    var imgs = a.attachments.filter(function (x) { return x.href && /^image\//.test(x.contentType); });
    var files = a.attachments.filter(function (x) { return x.href && !/^image\//.test(x.contentType); });
    var inline = a.attachments.filter(function (x) { return x.inline != null; });
    if (imgs.length) {
      h += '<div class="section-title">Screenshots</div><div class="attachments">' + imgs.map(function (x) {
        return '<figure><img loading="lazy" src="' + esc(x.href) + '" alt="' + esc(x.name) + '"><figcaption>' + esc(x.name) + '</figcaption></figure>';
      }).join('') + '</div>';
    }
    if (files.length) {
      h += '<div class="section-title">Files</div><div class="file-links">' + files.map(function (x) {
        var label = x.name === 'trace' ? 'Trace (open at trace.playwright.dev)' : x.name;
        return '<a href="' + esc(x.href) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
      }).join('') + '</div>';
    }
    inline.forEach(function (x) {
      h += '<div class="section-title">' + esc(x.name) + '</div><pre class="code">' + esc(x.inline) + '</pre>';
    });
    if (a.stdout.length || a.stderr.length) {
      h += '<div class="section-title">Console output</div><pre class="code">' + esc(a.stdout.concat(a.stderr).join('')) + '</pre>';
    }
    return h;
  }

  function detail(t) {
    if (!t) return '<div class="empty">Select a test.</div>';
    var a = lastAttempt(t);
    var h = '<h2>' + esc(t.title) + '</h2><div class="crumbs">' + esc(t.suitePath.join(' › ')) + '</div>' +
      '<div class="meta-row">' + badge(t.status) + '<span>' + esc(t.project) + '</span><span>' + dur(t.duration) + '</span>' +
      '<span>' + esc(t.file) + ':' + t.line + '</span>' + (a ? '<span>' + dateTime(a.start) + '</span>' : '') +
      (t.attempts.length > 1 ? '<span>' + t.attempts.length + ' attempts</span>' : '') + '</div>' +
      (t.tags.length ? '<div>' + t.tags.map(function (g) { return '<span class="tag">#' + esc(g) + '</span>'; }).join('') + '</div>' : '') +
      (t.annotations.length ? '<div class="section-title">Annotations</div><table><tbody>' + t.annotations.map(function (n) {
        return '<tr><th>' + esc(n.type) + '</th><td>' + esc(n.description || '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '');
    if (!a) return h;
    h += attemptBody(t, a);
    if (t.attempts.length > 1) {
      h += '<div class="section-title">Earlier attempts</div>' + t.attempts.slice(0, -1).map(function (p) {
        return '<details class="attempt"><summary>Retry #' + p.retry + ' ' + badge(p.status) + ' ' + dur(p.duration) + '</summary>' + attemptBody(t, p) + '</details>';
      }).join('');
    }
    return h;
  }

  function groupsView(kind) {
    var groups = kind === 'categories'
      ? groupBy(R.tests, function (t) { return t.tags.length ? t.tags : ['(untagged)']; })
      : groupBy(R.tests, function (t) { return t.project || '(default)'; });
    return '<div class="card"><h3>' + (kind === 'categories' ? 'Categories (tags)' : 'Devices (projects)') + '</h3><div class="table-scroll"><table><thead><tr><th>Name</th>' +
      '<th class="num">Tests</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th><th class="num">Flaky</th><th>Pass rate</th><th></th></tr></thead><tbody>' +
      groups.map(function (g) {
        var k = counts(g.tests);
        var rate = k.total - k.skip ? Math.round(100 * (k.pass + k.flaky) / (k.total - k.skip)) + '%' : '–';
        var key = g.key === '(untagged)' || g.key === '(default)' ? '' : g.key;
        return '<tr><td><a href="#" data-' + (kind === 'categories' ? 'tag' : 'device') + '="' + esc(key) + '">' + esc(g.key) + '</a></td><td class="num">' + k.total +
          '</td><td class="num">' + k.pass + '</td><td class="num">' + k.fail + '</td><td class="num">' + k.skip + '</td><td class="num">' + k.flaky +
          '</td><td>' + rate + '</td><td style="width:25%">' + bar(k) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function exceptionsView() {
    var m = {};
    R.tests.forEach(function (t) {
      var a = lastAttempt(t);
      if (!a || t.status !== 'fail') return;
      a.errors.forEach(function (e) {
        var k = firstLine(e.message).replace(/\d+ms/g, 'Nms').slice(0, 200);
        (m[k] = m[k] || []).push(t);
      });
    });
    var keys = Object.keys(m).sort(function (x, y) { return m[y].length - m[x].length; });
    if (!keys.length) return '<div class="card empty">No exceptions — every test passed or was skipped.</div>';
    return '<div class="card"><h3>Exceptions (' + keys.length + ')</h3><div class="table-scroll"><table><thead><tr><th>Exception</th><th class="num">Tests</th><th>Failed tests</th></tr></thead><tbody>' +
      keys.map(function (k) {
        return '<tr><td><pre class="err" style="margin:0">' + esc(k) + '</pre></td><td class="num">' + m[k].length + '</td><td>' +
          m[k].slice(0, 20).map(function (t) { return '<div><a href="#" data-open="' + esc(t.id) + '">' + esc(t.title) + '</a> <span class="t-sub" style="display:inline">' + esc(t.project) + '</span></div>'; }).join('') +
          (m[k].length > 20 ? '<div>… ' + (m[k].length - 20) + ' more</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // ---------- render + events ----------
  function render() {
    document.querySelectorAll('.sidenav button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === state.view); });
    app.innerHTML = state.view === 'dashboard' ? dashboard()
      : state.view === 'tests' ? testsView()
      : state.view === 'exceptions' ? exceptionsView()
      : groupsView(state.view);
    var q = document.getElementById('q');
    if (q && state.focusSearch) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); state.focusSearch = false; }
  }
  function go(view) { state.view = view; save(); render(); window.scrollTo(0, 0); }
  function save() { try { localStorage.setItem('extent-view', state.view); } catch (e) { /* storage blocked */ } }

  document.querySelector('.sidenav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (b) go(b.dataset.view);
  });
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-status],[data-test],[data-tag],[data-device],[data-open],[data-clear],[data-toggle],img');
    if (!el) return;
    if (el.dataset.status) { state.status = el.dataset.status; render(); }
    else if (el.dataset.test) { state.selected = el.dataset.test; render(); }
    else if (el.dataset.tag != null) { e.preventDefault(); state.tag = el.dataset.tag; state.device = ''; state.status = 'all'; go('tests'); }
    else if (el.dataset.device != null) { e.preventDefault(); state.device = el.dataset.device; state.tag = ''; state.status = 'all'; go('tests'); }
    else if (el.dataset.open) { e.preventDefault(); state.selected = el.dataset.open; state.status = 'all'; state.tag = ''; state.device = ''; state.q = ''; go('tests'); }
    else if (el.dataset.clear) { state[el.dataset.clear] = ''; render(); }
    else if (el.dataset.toggle) {
      var open = el.getAttribute('aria-expanded') !== 'true';
      el.setAttribute('aria-expanded', String(open));
      el.textContent = open ? '▾' : '▸';
      toggleChildren(el.dataset.toggle, open);
    } else if (el.tagName === 'IMG') {
      var box = document.createElement('div');
      box.className = 'lightbox';
      box.innerHTML = '<img src="' + el.getAttribute('src') + '" alt="">';
      box.addEventListener('click', function () { box.remove(); });
      document.body.appendChild(box);
    }
  });
  function toggleChildren(id, open) {
    document.querySelectorAll('tr[data-parent="' + id + '"]').forEach(function (r) {
      r.hidden = !open;
      if (!open) {
        var t = r.querySelector('[data-toggle]');
        if (t) { t.setAttribute('aria-expanded', 'false'); t.textContent = '▸'; toggleChildren(t.dataset.toggle, false); }
      }
    });
  }
  app.addEventListener('input', function (e) {
    if (e.target.id === 'q') { state.q = e.target.value; state.focusSearch = true; render(); }
  });

  // theme
  var root = document.documentElement;
  try { var th = localStorage.getItem('extent-theme'); if (th) root.dataset.theme = th; } catch (e) { /* storage blocked */ }
  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('extent-theme', root.dataset.theme); } catch (e) { /* storage blocked */ }
  });

  document.getElementById('run-date').textContent = dateTime(R.start);
  try { var v = localStorage.getItem('extent-view'); if (v) state.view = v; } catch (e) { /* storage blocked */ }
  render();
})();
