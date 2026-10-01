// Real Electron app main/preload/renderer and SQLite, driven exclusively from
// app-shell buttons. Each child exits before a fresh offline process starts.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function inPage(mode) {
  const wait = async (test, label) => {
    for (let i = 0; i < 300; i++) {
      const value = await test();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('golden_timeout_' + label + ':' + document.querySelector('#review-entry-status')?.textContent + ':' + document.querySelector('#catalog-detail')?.textContent);
  };
  if (mode === 'offline') {
    const button = await wait(() => document.querySelector('#review-session-list button'), 'saved_session');
    button.click();
    await wait(() => !document.querySelector('#fixed-review').hidden, 'reopen');
    const packageId = document.querySelector('#review-package-id').value;
    const snapshot = await window.riichiCoachProvider.openReview({ packageId });
    const decisionId = snapshot.selection.items[0]?.decisionId;
    assertDecision(decisionId);
    const detail = await window.riichiCoachProvider.getReviewDetail({ packageId, decisionId, activeReportRefId: snapshot.activeReportRefId });
    const overview = document.querySelector('#fixed-review .review-overview');
    overview.querySelector('button')?.click();
    const list = document.querySelector('#fixed-review .review-list');
    await wait(() => !list.hidden, 'offline_list');
    list.querySelector('button')?.click();
    await wait(() => document.querySelector('#fixed-review .review-detail') !== null, 'offline_detail');
    return { packageId, snapshot, detail, listVisible: !list.hidden, detailVisible: document.querySelector('#fixed-review .review-detail') !== null };
  }
  if (mode === 'share') {
    await wait(() => !document.querySelector('.paipu-import').hidden, 'share_source');
    const catalog = await window.riichiCoachCatalog.listAnalyzableRecords();
    document.querySelector('#paipu-url').value = catalog[0].shareUrl;
    document.querySelector('#paipu-import').click();
  } else {
    const button = await wait(() => document.querySelector('#catalog-list button'), 'account_source');
    button.click();
  }
  if (mode === 'account_failure') {
    await wait(() => document.querySelector('#catalog-detail').textContent.includes('暂时无法分析'), 'account_failure');
    const sessions = await window.riichiCoachProvider.listReviewSessions();
    if (sessions.length !== 0 || !document.querySelector('#fixed-review').hidden) throw new Error('golden_failure_partial_navigation');
    return { sessions: sessions.length, sourceVisible: !document.querySelector('#catalog-list').hidden };
  }
  await wait(() => !document.querySelector('#fixed-review').hidden, 'opened_from_source');
  const packageId = document.querySelector('#review-package-id').value;
  let snapshot = await window.riichiCoachProvider.openReview({ packageId });
  if (snapshot.selection.selectedCount < 1) throw new Error('golden_no_selected_decisions');
  if (snapshot.activeReportRefId !== null) throw new Error('golden_fresh_session_has_report');
  const overview = document.querySelector('#fixed-review .review-overview');
  const generate = [...overview.querySelectorAll('button')].find((button) => button.textContent.includes('生成教练解说'));
  if (!generate) throw new Error('golden_generate_button_missing');
  generate.click();
  await wait(() => !document.querySelector('#fixed-review').hidden && !overview.querySelector('button')?.textContent.includes('生成教练解说'), 'generation');
  snapshot = await wait(async () => {
    const value = await window.riichiCoachProvider.openReview({ packageId });
    return value.activeReportRefId !== null ? value : null;
  }, 'saved_report');
  const decisionId = snapshot.selection.items[0].decisionId;
  const detail = await window.riichiCoachProvider.getReviewDetail({ packageId, decisionId, activeReportRefId: snapshot.activeReportRefId });
  document.querySelector('#fixed-review .review-overview button')?.click();
  const list = document.querySelector('#fixed-review .review-list');
  await wait(() => !list.hidden, 'list');
  list.querySelector('button')?.click();
  await wait(() => document.querySelector('#fixed-review .review-detail') !== null, 'detail');
  document.querySelector('#leave-review').click();
  await wait(() => document.querySelector('#fixed-review').hidden, 'leave');
  await wait(() => document.querySelector('#review-session-list').textContent.includes('已有教练解说'), 'session_refresh');
  if (mode === 'account') {
    document.querySelector('#catalog-list button').click();
    await wait(() => !document.querySelector('#fixed-review').hidden, 'reused_account');
    const reused = await window.riichiCoachProvider.openReview({ packageId });
    if (reused.activeReportRefId !== snapshot.activeReportRefId) throw new Error('golden_account_reuse_lost_report');
    document.querySelector('#leave-review').click();
    await wait(() => document.querySelector('#fixed-review').hidden, 'reused_leave');
    const sessions = await window.riichiCoachProvider.listReviewSessions();
    if (sessions.length !== 1) throw new Error('golden_duplicate_account_session');
  }
  return { packageId, snapshot, detail, listVisible: true, detailVisible: true, sessionText: document.querySelector('#review-session-list').textContent };
  function assertDecision(value) { if (!value) throw new Error('golden_no_decision'); }
}

if (process.versions.electron) {
  const { app } = require('electron');
  const mode = process.argv.find((arg) => ['account','share','evidence_only','account_failure','offline'].includes(arg));
  const root = process.env.RIICHI_MVP_GOLDEN_ROOT;
  if (!mode || !root) throw new Error('golden_child_arguments_missing');
  app.setPath('userData', root);
  let networkRequests = 0;
  globalThis.fetch = async () => { networkRequests++; throw new Error('golden_network_disabled'); };
  app.on('session-created', (sourceSession) => {
    sourceSession.webRequest.onBeforeRequest((details, callback) => {
      const remote = /^(https?|wss?):/.test(details.url);
      if (remote) networkRequests++;
      callback({ cancel: remote });
    });
  });
  let finished = false;
  const timeout = setTimeout(() => { if (!finished) { console.error('golden_child_timeout'); app.exit(1); } }, 90000);
  app.once('browser-window-created', (_event, window) => {
    window.hide();
    window.webContents.setBackgroundThrottling(false);
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript('(' + inPage.toString() + ')(' + JSON.stringify(mode) + ')');
        assert.equal(networkRequests, 0);
        finished = true;
        clearTimeout(timeout);
        console.log('GOLDEN_RESULT=' + JSON.stringify({ result, networkRequests }));
        app.quit();
      } catch (error) { finished = true; clearTimeout(timeout); console.error(error.stack || error); app.exit(1); }
    });
  });
  import('../dist/electron-entry.js').catch((error) => { console.error(error); app.exit(1); });
} else {
  const electron = require('electron');
  function child(root, mode) {
    const result = spawnSync(electron, [__filename, mode === 'offline' ? '--mvp-golden-offline' : '--mvp-golden-child', mode], {
      env: { ...process.env, RIICHI_MVP_GOLDEN_ROOT: root, RIICHI_MVP_GOLDEN_TEST: '1', RIICHI_MVP_GOLDEN_REPORT: mode === 'evidence_only' ? 'evidence_only' : 'complete', RIICHI_MVP_GOLDEN_FAIL_ANALYSIS: mode === 'account_failure' ? '1' : '0', RIICHI_COACH_API_KEY: '' },
      timeout: 120000, encoding: 'utf8', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('Electron ' + mode + ' failed: ' + result.error + '\n' + result.stdout + '\n' + result.stderr);
    const line = result.stdout.split(/\r?\n/).find((row) => row.startsWith('GOLDEN_RESULT='));
    if (!line) throw new Error('Golden result missing: ' + result.stdout);
    return JSON.parse(line.slice('GOLDEN_RESULT='.length));
  }
  const failedRoot = mkdtempSync(join(tmpdir(), 'riichi-mvp-golden-failed-'));
  try {
    const failed = child(failedRoot, 'account_failure');
    assert.equal(failed.result.sessions, 0);
    assert.equal(failed.networkRequests, 0);
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(join(failedRoot, 'review-library', 'library.sqlite'));
    try {
      assert.equal(database.prepare('SELECT count(*) AS n FROM analysis_packages').get().n, 0);
      assert.equal(database.prepare('SELECT count(*) AS n FROM review_sessions').get().n, 0);
    } finally { database.close(); }
    console.log('[electron-mvp-golden] account_failure PASS packages=0 sessions=0');
  } finally { rmSync(failedRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  for (const mode of ['account', 'share', 'evidence_only']) {
    const root = mkdtempSync(join(tmpdir(), 'riichi-mvp-golden-'));
    try {
      const before = child(root, mode);
      const after = child(root, 'offline');
      assert.equal(before.networkRequests, 0);
      assert.equal(before.result.snapshot.activeReportStatus, mode === 'evidence_only' ? 'evidence_only' : 'complete');
      assert(before.result.snapshot.selection.selectedCount > 0);
      assert(before.result.snapshot.activeReportRefId);
      if (mode === 'evidence_only') assert.equal(before.result.detail.coachJudgments.length, 0);
      else { assert(before.result.detail.coachJudgments.length > 0); assert(before.result.detail.explanations.length > 0); }
      assert.equal(after.networkRequests, 0);
      assert.equal(after.result.packageId, before.result.packageId);
      assert.equal(after.result.snapshot.activeReportRefId, before.result.snapshot.activeReportRefId);
      assert.deepEqual(after.result.detail.coachJudgments, before.result.detail.coachJudgments);
      assert.deepEqual(after.result.detail.explanations, before.result.detail.explanations);
      assert.deepEqual(after.result.detail.provenance, before.result.detail.provenance);
      assert.equal(after.result.snapshot.activeReportStatus, before.result.snapshot.activeReportStatus);
      assert.equal(after.result.snapshot.selection.selectedCount, before.result.snapshot.selection.selectedCount);
      assert.equal(after.result.listVisible && after.result.detailVisible, true);
      console.log('[electron-mvp-golden] ' + mode + ' PASS status=' + before.result.snapshot.activeReportStatus + ' judgments=' + before.result.detail.coachJudgments.length + ' selected=' + before.result.snapshot.selection.selectedCount + ' offline requests=0');
    } finally { rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }
}
