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
  const visibleSelection = () => ({
    overviewCount: Number(document.querySelector('.review-overview .review-selected-count')?.textContent),
    rows: [...document.querySelectorAll('.review-list tbody tr')].map((row) => ({
      decisionId: row.dataset.decisionId,
      rank: Number(/^第 (\d+) 条/.exec(row.cells[0]?.textContent ?? '')?.[1]),
    })),
  });
  const visibleHardEvidence = (detail) => {
    if (!detail.board || document.querySelectorAll('.workspace-hand .tile').length !== detail.board.hand.length + (detail.board.draw ? 1 : 0)) {
      throw new Error('golden_workspace_board_dto_mismatch');
    }
    if (detail.board.discardLoss?.status !== 'ready' || !detail.board.discardLoss.candidates.length) {
      throw new Error('golden_workspace_real_efficiency_missing:' + detail.board.discardLoss?.reason);
    }
    const fact = detail.provenance.find((item) => item.category === 'hard_evidence' && item.label === '局面事实');
    const riichi = fact?.details.find((item) => item.label === '自家立直');
    if (!fact?.displayRef || !fact.producer || !fact.summary.includes('自家未立直') || riichi?.value !== '否') {
      throw new Error('golden_hard_evidence_payload_missing');
    }
    const section = [...document.querySelectorAll('.review-detail details')]
      .find((node) => node.querySelector('summary')?.textContent === '证据摘要');
    if (section && !section.open) section.querySelector('summary').click();
    const card = [...(section?.querySelectorAll('article') ?? [])]
      .find((node) => node.textContent.includes(fact.summary) && node.textContent.includes('自家立直 · 当前决策：否'));
    if (!section?.open || !section.textContent.includes('确定性证据') || !card || card.getClientRects().length === 0) {
      throw new Error('golden_hard_evidence_not_visible');
    }
    return { displayRef: fact.displayRef, producer: fact.producer, summary: fact.summary,
      riichiValue: riichi.value, cardText: card.textContent };
  };
  if (mode === 'offline') {
    document.querySelector('.sidebar a[href="#/library"]').click();
    await wait(() => document.body.dataset.page === 'library', 'library_route');
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
    const selectionDom = visibleSelection();
    list.querySelector('button')?.click();
    await wait(() => document.querySelector('#fixed-review .review-detail') !== null, 'offline_detail');
    const sessions = await window.riichiCoachProvider.listReviewSessions();
    return { packageId, snapshot, detail, selectionDom, hardEvidence: visibleHardEvidence(detail), sessions,
      listVisible: !list.hidden, detailVisible: document.querySelector('#fixed-review .review-detail') !== null };
  }
  if (mode === 'share') {
    document.querySelector('[data-source="link"]').click();
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
  if (snapshot.selection.selectedCount !== 2) throw new Error('golden_selection_mismatch:' + JSON.stringify(snapshot.selection));
  if (snapshot.activeReportRefId !== null || snapshot.activeReportStatus !== 'not_generated') throw new Error('golden_fresh_session_has_report');
  const overview = document.querySelector('#fixed-review .review-overview');
  if (mode === 'single_action') {
    overview.querySelector('button').click();
    const firstDecisionId = snapshot.selection.items[0].decisionId;
    const firstRow = [...document.querySelectorAll('.review-list tr')].find(row => row.dataset.decisionId === firstDecisionId);
    firstRow.querySelector('.review-generate-one').click();
    const first = await wait(async () => {
      const value = await window.riichiCoachProvider.openReview({packageId});
      return value.explanationCounts.ready === 1 ? value : null;
    }, 'single_report');
    if (first.selection.items[1].explanationStatus !== 'not_generated') throw new Error('golden_single_scope_leaked');
    const firstDetail = await window.riichiCoachProvider.getReviewDetail({packageId, decisionId: firstDecisionId, activeReportRefId: first.activeReportRefId});
    const remaining = await wait(() => {
      const button = document.querySelector('.review-generate-remaining');
      return button && !button.disabled && button.textContent.includes('剩余 1 条') ? button : null;
    }, 'remaining_one');
    remaining.click();
    snapshot = await wait(async () => {
      const value = await window.riichiCoachProvider.openReview({packageId});
      return value.explanationCounts.ready === 2 ? value : null;
    }, 'remaining_report');
    if (snapshot.activeReportRefId === first.activeReportRefId) throw new Error('golden_single_new_report_ref_missing');
    const kept = await window.riichiCoachProvider.getReviewDetail({packageId, decisionId: firstDecisionId, activeReportRefId: snapshot.activeReportRefId});
    if (JSON.stringify(firstDetail.coachJudgments) !== JSON.stringify(kept.coachJudgments)
      || JSON.stringify(firstDetail.explanations) !== JSON.stringify(kept.explanations)) throw new Error('golden_single_content_lost');
  } else {
    const generate = overview.querySelector('.review-generate-remaining');
    if (!generate) throw new Error('golden_generate_button_missing');
    generate.click();
    snapshot = await wait(async () => {
      const value = await window.riichiCoachProvider.openReview({ packageId });
      return value.activeReportRefId !== null ? value : null;
    }, 'saved_report');
  }
  await wait(() => !document.querySelector('#fixed-review .review-generate-remaining')?.disabled && !document.querySelector('#fixed-review .review-live')?.textContent.includes('正在生成'), 'generation');
  const decisionId = snapshot.selection.items[0].decisionId;
  const detail = await window.riichiCoachProvider.getReviewDetail({ packageId, decisionId, activeReportRefId: snapshot.activeReportRefId });
  document.querySelector('#fixed-review .review-overview button')?.click();
  const list = document.querySelector('#fixed-review .review-list');
  await wait(() => !list.hidden, 'list');
  const selectionDom = visibleSelection();
  list.querySelector('button')?.click();
  await wait(() => document.querySelector('#fixed-review .review-detail') !== null, 'detail');
  const hardEvidence = visibleHardEvidence(detail);
  document.querySelector('#leave-review').click();
  await wait(() => document.querySelector('#fixed-review').hidden, 'leave');
  await wait(() => document.querySelector('#review-session-list').textContent.includes('已有教练解说'), 'session_refresh');
  const savedSessions = await window.riichiCoachProvider.listReviewSessions();
  const recordLabel = savedSessions.find(item => item.packageId === packageId)?.recordLabel;
  if (!recordLabel || recordLabel.players.length !== 4 || recordLabel.players.some(player => player.rank === null || player.finalScore === null)
    || recordLabel.selfSeat !== 3 || recordLabel.title.includes('sha256')) throw new Error('golden_saved_record_label_missing:' + JSON.stringify(recordLabel));
  if (document.querySelector('#review-session-list').textContent.includes('sha256')
    || document.querySelectorAll('#review-session-list .saved-review-player-self').length !== 1) throw new Error('golden_saved_record_label_dom');

  if (mode === 'account') {
    document.querySelector('#catalog-list button').click();
    await wait(() => !document.querySelector('#fixed-review').hidden, 'reused_account');
    const reused = await window.riichiCoachProvider.openReview({ packageId });
    if (reused.activeReportRefId !== snapshot.activeReportRefId) throw new Error('golden_account_reuse_lost_report');
    document.querySelector('#leave-review').click();
    await wait(() => document.querySelector('#fixed-review').hidden, 'reused_leave');
    const sessions = await window.riichiCoachProvider.listReviewSessions();
    if (sessions.length !== 1) throw new Error('golden_duplicate_account_session');
    if (sessions[0].sessionId !== savedSessions[0]?.sessionId || sessions[0].packageId !== packageId) {
      throw new Error('golden_account_session_identity_changed');
    }
  }
  return { packageId, snapshot, detail, selectionDom, hardEvidence, sessions: savedSessions,
    listVisible: true, detailVisible: true, sessionText: document.querySelector('#review-session-list').textContent };
  function assertDecision(value) { if (!value) throw new Error('golden_no_decision'); }
}

// Exercise the shipped renderer and its persisted preferences in a real Electron page.
async function checkWorkspaceSkin() {
  const check=(condition,label)=>{if(!condition)throw new Error('workspace_skin_'+label);};
  if(document.querySelector('#fixed-review').hidden)document.querySelector('#review-session-list button').click();
  for(let i=0;i<100&&!document.querySelector('.workspace-hand button');i++)await new Promise(resolve=>setTimeout(resolve,100));
  check(!!document.querySelector('.workspace-hand button'),'reopen_board');
  const choose=(id)=>{
    const select=document.querySelector('[data-skin-select]');
    select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
    check([...document.querySelectorAll('[data-skin-select]')].every(x=>x.value===id),'selectors');
  };
  choose('classic');
  if(document.documentElement.dataset.theme!=='light')document.querySelector('#theme-toggle').click();
  const lightPreference=localStorage.getItem('coach-workspace-theme');
  choose('othercide');
  check(document.documentElement.dataset.theme==='dark','night_only');
  check(document.querySelector('#theme-toggle').hidden,'night_toggle');
  check(localStorage.getItem('coach-workspace-theme')===lightPreference,'preserve_light_preference');
  check(getComputedStyle(document.querySelector('.workspace')).backgroundColor==='rgb(20, 19, 21)','othercide_asset');
  choose('rhine');
  check(document.documentElement.dataset.theme==='light','restore_light');
  document.querySelector('#theme-toggle').click();
  choose('othercide');choose('orbit');
  check(document.documentElement.dataset.theme==='dark','restore_dark');
  choose('othercide');
  const tableBefore=document.querySelector('.mahjong-table');
  const tabs=document.querySelectorAll('.workspace-coach-tabs button');
  check(tabs.length===2,'coach_tabs');
  tabs[1].click();
  check(document.querySelector('.workspace-coach').dataset.panel==='compare','compare_panel');
  check(document.querySelector('.mahjong-table')===tableBefore,'tab_preserves_board');
  tabs[0].click();
  check(document.querySelector('.workspace-coach').dataset.panel==='coach','coach_panel');
  check(document.querySelectorAll('.review-comparison .comparison-tiles .tile').length>0,'comparison_tiles');
  const input=document.querySelector('#coach-base-url');
  if(input){
    for(let parent=input.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
    input.focus();
    check(getComputedStyle(input).outlineOffset==='0px','single_focus_edge');
    check(getComputedStyle(input).boxShadow==='none','no_inner_shadow');
    for(let parent=input.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=false;}
  }
  const buttons=[...document.querySelectorAll('.workspace-hand button')];
  let readyLoss=false;
  for(const button of buttons){
    button.click();
    const groups=[...document.querySelectorAll('.hand-loss .loss-group')];
    if(groups.length===2){
      check(getComputedStyle(groups[0]).borderBottomWidth==='1px','group_separator');
      check(getComputedStyle(groups[1]).borderBottomWidth==='0px','no_footer_separator');
      check(getComputedStyle(groups[1]).paddingBottom==='0px','no_footer_gap');
      check(getComputedStyle(groups[1]).marginBottom==='0px','no_footer_margin');
      readyLoss=true;break;
    }
  }
  check(readyLoss,'real_loss_groups:'+buttons.length+':'+document.querySelector('.hand-loss')?.textContent);
  const expected={
    classic:{background:'rgb(37, 39, 41)',color:'rgb(233, 235, 236)',line:'rgb(65, 69, 72)',number:'Segoe UI',numberSize:'22px',titleSize:'15px'},
    orbit:{background:'rgb(29, 42, 53)',color:'rgb(244, 238, 227)',line:'rgb(73, 92, 104)',number:'Consolas',numberSize:'22px',titleSize:'15px'},
    rhine:{background:'rgb(36, 46, 39)',color:'rgb(239, 243, 230)',line:'rgb(72, 91, 71)',number:'Consolas',numberSize:'22px',titleSize:'15px'},
    othercide:{background:'rgb(36, 32, 37)',color:'rgb(233, 229, 223)',line:'rgb(99, 81, 95)',number:'Georgia',numberSize:'25px',titleSize:'23px'}
  };
  for(const [skin,reference] of Object.entries(expected)){
    choose(skin);
    const card=document.querySelector('.hand-loss'),style=getComputedStyle(card);
    check(style.backgroundColor===reference.background,skin+'_loss_background');
    check(style.color===reference.color,skin+'_loss_text');
    check(style.width==='306px',skin+'_loss_width');
    const title=getComputedStyle(card.querySelector('.loss-heading strong'));
    check(title.fontSize===reference.titleSize,skin+'_loss_title');
    const number=card.querySelector('.loss-summary b');
    check(!!number,skin+'_number_structure');
    check(getComputedStyle(number).fontFamily.includes(reference.number),skin+'_number_font');
    check(getComputedStyle(number).fontSize===reference.numberSize,skin+'_number_size');
    check(getComputedStyle(card.querySelector('.loss-group')).borderBottomColor===reference.line,skin+'_separator_color');
    check(getComputedStyle(card.querySelector('.loss-tile .tile')).width==='34px',skin+'_tile_size');
    if(skin==='othercide'){
      check(style.overflow==='visible','unclipped_loss_edge');
      check(getComputedStyle(card,'::before').height==='7px','bone_edge_height');
      check(getComputedStyle(card,'::before').top==='-5px','bone_edge_position');
      check(getComputedStyle(card,'::after').backgroundColor==='rgb(173, 25, 50)','scar_color');
      check(getComputedStyle(card.querySelector('.loss-tile span')).color==='rgb(242, 150, 164)','loss_color');
    }
  }
  choose('classic');document.querySelector('#theme-toggle').click();
  const light={classic:['rgb(255, 255, 255)','rgb(37, 41, 44)'],orbit:['rgb(248, 245, 237)','rgb(32, 43, 53)'],rhine:['rgb(252, 253, 248)','rgb(34, 43, 32)']};
  for(const [skin,[background,color]] of Object.entries(light)){
    choose(skin);const style=getComputedStyle(document.querySelector('.hand-loss'));
    check(style.backgroundColor===background,skin+'_light_loss_background');
    check(style.color===color,skin+'_light_loss_text');
  }
  choose('othercide');
  return {nightOnly:true,lightAndDarkRestored:true,singleFocusEdge:true,lossFooterTrimmed:true,visualParity:7};
}

if (process.versions.electron) {
  const { app } = require('electron');
  const mode = process.argv.find((arg) => ['account','share','evidence_only','account_failure','single_action','offline'].includes(arg));
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
        if(mode!=='account_failure') {
          result.skinChecks=await window.webContents.executeJavaScript('(' + checkWorkspaceSkin.toString() + ')()');
        }
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
  void (async () => {
  const electron = require('electron');
  const { createReviewSessionRepository } = await import('../dist/review-session-repository.js');
  const { selectReviewDecisions } = await import('@riichi-coach/reasoning');
  function assertSavedSelection(root, result) {
    const repository = createReviewSessionRepository({ root: join(root, 'review-library') });
    try {
      const saved = repository.openByPackageId(result.packageId);
      const expected = selectReviewDecisions(saved.analysisPackage);
      assert.equal(saved.analysisPackage.packageId, result.packageId);
      assert.deepEqual(saved.selection, expected);
      assert.equal(saved.activeReportRefId, result.snapshot.activeReportRefId);
      assert.notEqual(expected.selected.length, saved.analysisPackage.decisions.length);
      assert.equal(result.snapshot.selection.policyVersion, expected.policyVersion);
      assert.equal(result.snapshot.selection.selectedCount, expected.selected.length);
      const selected = expected.selected.map(({ decisionId, rank, selectionReason }) => ({ decisionId, rank, selectionReason }));
      assert.deepEqual(result.snapshot.selection.items.map(({ decisionId, rank, selectionReason }) => ({ decisionId, rank, selectionReason })), selected);
      assert.equal(result.selectionDom.overviewCount, expected.selected.length);
      assert.deepEqual(result.selectionDom.rows, selected.map(({ decisionId, rank }) => ({ decisionId, rank })));
      assert.equal(result.sessions.length, 1);
      assert.equal(result.sessions[0].sessionId, saved.sessionId);
      assert.equal(result.sessions[0].packageId, saved.analysisPackage.packageId);
      const reportScopes = saved.readBack.reports.map(report => [...report.selectedDecisionIds]).sort((a,b) => a.join('|').localeCompare(b.join('|')));
      if (result.singleAction === true) {
        assert.equal(reportScopes.length, 2);
        assert(reportScopes.every(scope => scope.length === 1));
        assert.equal(saved.decisionReportRefs.length, 2);
      }
      return { sessionId: saved.sessionId, selected, reportScopes, recordLabel: result.sessions[0].recordLabel };
    } finally { repository.close(); }
  }
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
  for (const mode of ['account', 'share', 'evidence_only', 'single_action']) {
    const root = mkdtempSync(join(tmpdir(), 'riichi-mvp-golden-'));
    try {
      const before = child(root, mode);
      if (mode === 'single_action') before.result.singleAction = true;
      const beforeOracle = assertSavedSelection(root, before.result);
      const after = child(root, 'offline');
      const afterOracle = assertSavedSelection(root, after.result);
      assert.deepEqual(afterOracle, beforeOracle);
      assert.equal(before.networkRequests, 0);
      assert.equal(before.result.snapshot.activeReportStatus, mode === 'evidence_only' ? 'evidence_only' : 'complete');
      assert.equal(before.result.snapshot.selection.selectedCount, beforeOracle.selected.length);
      assert(before.result.snapshot.activeReportRefId);
      if (mode === 'evidence_only') {
        assert.equal(before.result.detail.coachJudgments.length, 0);
        assert.equal(before.result.hardEvidence.riichiValue, '否');
        assert.deepEqual(after.result.hardEvidence, before.result.hardEvidence);
      }
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
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
