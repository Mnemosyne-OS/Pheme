/**
 * The whole stylesheet. Every rule reads the skin tokens (--ph-*): skins
 * swap one data attribute on the root, this file never changes per skin.
 */
// ── Look — every rule reads the skin tokens (--ph-*), never the host's ──────
// directly: skins swap one data attribute, the stylesheet never changes.

export const CSS = `
.pheme { container-type:inline-size; display:flex; flex-direction:column; height:100vh;
  background:var(--ph-bg); color:var(--ph-text); font-family:var(--ph-font); }
.head { display:flex; align-items:center; justify-content:space-between; padding:8px 18px 4px;
  border-bottom:1px solid var(--ph-border); }
.brand { display:flex; align-items:center; gap:12px; }
.phi { font-size:21px; color:var(--ph-accent); font-weight:600; }
.head h1 { margin:0; font-size:17px; letter-spacing:var(--ph-head-spacing); font-family:var(--ph-font-head); }
.tagline { margin:0; font-size:11.5px; color:var(--ph-muted); }
.body { flex:1; overflow-y:auto; }
.foot { display:flex; justify-content:space-between; gap:12px; padding:8px 18px; font-size:11px; color:var(--ph-muted); border-top:1px solid var(--ph-border); }
.netIcon { display:inline-block; vertical-align:-2px; flex-shrink:0; }

/* ── The dock: networks on the mark's own line, icons only ──────────────────
   Names cost the width of a monitor and are read slower than a logo. The
   label lives in the tooltip; the destination proves it. Hover magnifies the
   way a dock does — the pointer says which one it means before the click. */
.dock { display:flex; align-items:center; gap:2px; flex-wrap:nowrap; margin-left:auto;
  padding-left:10px; min-width:0; }
.dock.compact { gap:6px; }
.dockItem { position:relative; display:inline-flex; align-items:center; justify-content:center;
  width:34px; height:34px; padding:0; border:none; border-radius:10px; cursor:pointer;
  background:none; color:var(--ph-muted); font-family:inherit; line-height:1;
  transition:transform .13s ease, background-color .13s ease; transform-origin:center bottom; }
.dockItem:hover { transform:scale(1.32); background:color-mix(in srgb, var(--ph-accent) 12%, transparent); }
.dockItem:focus-visible { outline:2px solid var(--ph-accent); outline-offset:1px; }
.dockItem.active { background:color-mix(in srgb, var(--ph-accent) 18%, transparent); color:var(--ph-text); }
.dockItem.active::after { content:''; position:absolute; bottom:-3px; left:50%; translate:-50% 0;
  width:4px; height:4px; border-radius:50%; background:var(--ph-accent); }
.dockGlyph { font-size:16px; }
.dockItem.locked { opacity:.4; }
.dockItem.locked .netIcon { filter:grayscale(70%); }
.dockItem.locked.active { opacity:.85; }
.dockRule { width:1px; height:18px; margin:0 5px; background:var(--ph-border); flex-shrink:0; }
/* The count rides ON the icon — "where are my replies" answered without
   reading a single word. */
.dockBadge { position:absolute; top:-1px; right:-1px; min-width:15px; height:15px; padding:0 4px;
  display:inline-flex; align-items:center; justify-content:center; border-radius:8px;
  background:var(--ph-accent); color:var(--ph-on-accent); font-size:9.5px; font-weight:700;
  font-family:var(--ph-font-tag); }
/* A magnified neighbour must not be clipped by the header's own edge. */
.head { overflow:visible; }
/* An explicit surface, never transparent: a see-through native control lets
   the platform paint whatever it likes behind its own text. */
.navSelect { background:var(--ph-panel); border:1px solid var(--ph-border);
  border-radius:var(--ph-radius); border-bottom:2px solid var(--ph-accent);
  color:var(--ph-text); font-family:var(--ph-font); font-size:13px; cursor:pointer;
  padding:4px 8px 5px; max-width:60%; outline:none; }
.navSelect option, .navSelect optgroup { background:var(--ph-panel); color:var(--ph-text); }

/* Mini mode. A cartridge is as wide as the pane it was given, so this keys
   off the CONTAINER, not the screen: the same window can hold Pheme wide on
   one monitor and squeezed beside another app on the next. Chrome gives up
   its margins first — the content is what the user came for. */
@container (max-width: 620px) {
  .head { padding:6px 12px 2px; }
  .tagline { display:none; }
  .phi { font-size:18px; }
  .head h1 { font-size:15px; }
  .netbar { padding:4px 12px 0; }
  .pane { padding:10px 12px 20px; }
  .kpis { grid-template-columns:repeat(auto-fit, minmax(118px, 1fr)); gap:8px; }
  .kpiVal { font-size:21px; }
  .foot { padding:4px 12px; }
  .netCards { grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; }
  .askHandle { top:38%; }
}
.pane { padding:14px 18px 24px; max-width:860px; }
/* Grid-bearing tabs (Radar, Pseudo) breathe across the window; reading
   surfaces (Studio, Settings, onboarding) keep a book-width column. Wide is
   not unlimited: a maximised window stretched every list row edge to edge,
   which is how a label and its button ended up a screen apart. */
.pane.wide { max-width:1440px; }
.onboard { padding:22px 18px; max-width:640px; }
.onboard h2, .pane h2 { margin:0 0 6px; font-size:17px; font-family:var(--ph-font-head); }
.lead { color:var(--ph-text-2); font-size:13.5px; line-height:1.55; }
label { display:block; margin-top:18px; font-size:13px; font-weight:600; font-family:var(--ph-font-head); }
.hint { margin:2px 0 8px; font-size:12px; color:var(--ph-muted); }
.chips { display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px solid var(--ph-border);
  border-radius:var(--ph-radius); background:var(--ph-panel); }
.chips input { flex:1; min-width:140px; background:none; border:none; outline:none;
  color:var(--ph-text); font-size:13px; font-family:var(--ph-font); }
.chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:2px 8px; border-radius:10px;
  background:color-mix(in srgb, var(--ph-accent) 16%, transparent); }
.chip.small { font-size:10.5px; padding:1px 7px; }
.chip button { background:none; border:none; color:inherit; cursor:pointer; font-size:12px; padding:0; }
.voices { display:flex; flex-wrap:wrap; gap:6px; }
.voice { font-size:12px; padding:4px 9px; border-radius:var(--ph-radius); cursor:pointer;
  border:1px solid var(--ph-border); background:none; color:var(--ph-muted); font-family:inherit; }
.voice.on { border-color:var(--ph-accent); color:var(--ph-text);
  background:color-mix(in srgb, var(--ph-accent) 18%, transparent); }
.voiceRow { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; margin:8px 0 6px; }
.voiceRow .hint { margin:0; }
.primary { margin-top:14px; background:var(--ph-accent); color:var(--ph-on-accent); border:none;
  border-radius:var(--ph-radius); padding:8px 16px; font-size:13px; cursor:pointer; font-family:inherit; }
.primary:disabled { opacity:.45; cursor:default; }
button { font-family:inherit; }
.row { display:flex; align-items:center; gap:10px; margin-top:10px; }
.row input, .row select { flex:1; padding:7px 10px; border-radius:var(--ph-radius); border:1px solid var(--ph-border);
  background:var(--ph-panel); color:var(--ph-text); font-size:13px; font-family:var(--ph-font); }
.row select { flex:0 1 240px; }
.row button, .actions button, .draftHead button {
  padding:6px 12px; border-radius:var(--ph-radius); font-size:12.5px; cursor:pointer;
  border:1px solid var(--ph-border); background:none; color:var(--ph-text); }
.row button.primary, .actions button.primary { background:var(--ph-accent); border-color:transparent;
  color:var(--ph-on-accent); margin-top:0; }
.warn { color:var(--ph-warn); font-size:12.5px; }
.warn.small { font-size:11.5px; }
.empty { color:var(--ph-muted); font-size:13px; margin-top:18px; }
.list { list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:10px; }
.card { border:1px solid var(--ph-border); border-radius:var(--ph-radius); padding:12px; background:var(--ph-panel); }
.cardHead { display:flex; gap:12px; align-items:flex-start; }
.score { min-width:34px; text-align:center; font-size:13px; font-weight:700; color:var(--ph-accent);
  border:1px solid color-mix(in srgb, var(--ph-accent) 40%, transparent); border-radius:var(--ph-radius); padding:3px 0;
  font-family:var(--ph-font-tag); }
.cardTitle { display:flex; flex-direction:column; gap:3px; }
.cardTitle strong { font-size:13.5px; line-height:1.35; font-family:var(--ph-font-head); }
.meta { font-size:11.5px; color:var(--ph-muted); font-family:var(--ph-font-tag); }
.why { margin-top:8px; display:flex; gap:5px; flex-wrap:wrap; }
.actions { margin-top:10px; display:flex; gap:8px; }
.toggleRow { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:13px; }
.memoryBox { margin-top:14px; font-size:12.5px; }
.memoryBox pre { white-space:pre-wrap; color:var(--ph-text-2); font-size:12px;
  background:var(--ph-panel); padding:10px; border-radius:var(--ph-radius); }
.draft { margin-top:14px; }
.draft.chosen textarea { border-color:color-mix(in srgb, var(--ph-ok) 55%, transparent); }
.chosenTag { font-size:10px; padding:1px 6px; border-radius:8px; font-family:var(--ph-font-tag);
  color:var(--ph-ok); border:1px solid color-mix(in srgb, var(--ph-ok) 45%, transparent); }
.editedTag { font-size:10px; padding:1px 6px; border-radius:8px; font-family:var(--ph-font-tag);
  color:var(--ph-muted); border:1px solid var(--ph-border); margin-left:6px; }
.choiceLine { margin:6px 0 0; font-size:12.5px; color:var(--ph-ok); }
.voiceBarCell { width:34%; }
.voiceBar { display:inline-block; height:7px; min-width:4px; border-radius:4px;
  background:color-mix(in srgb, var(--ph-accent) 75%, transparent); }
.askHandle { position:fixed; left:0; top:44%; z-index:60; padding:10px 8px 10px 5px;
  background:var(--ph-panel); border:1px solid var(--ph-border); border-left:none;
  border-radius:0 12px 12px 0; color:var(--ph-accent); cursor:pointer;
  font-size:16px; font-weight:700; }
.askHandle:hover { border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent); }
.askDrawer { position:fixed; top:0; left:0; bottom:0; width:min(380px, 92vw); z-index:70;
  background:var(--ph-bg); border-right:1px solid var(--ph-border);
  box-shadow:8px 0 30px rgba(0,0,0,.18);
  display:flex; flex-direction:column; padding:14px;
  transform:translateX(-103%); transition:transform .22s ease; }
.askDrawer.open { transform:none; }
.askDrawer .draftHead { flex-wrap:wrap; }
.askMsgs { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;
  margin:10px 0; scrollbar-width:thin; }
.askMsg { border:1px solid var(--ph-border); border-radius:var(--ph-radius);
  padding:8px 10px; font-size:12.5px; line-height:1.5; max-width:94%; white-space:pre-wrap; }
.askMsg.user { align-self:flex-end; color:var(--ph-text);
  border-color:color-mix(in srgb, var(--ph-accent) 45%, transparent); }
.askMsg.ai { align-self:flex-start; color:var(--ph-text-2); background:var(--ph-panel); }
.askInput { display:flex; gap:8px; align-items:stretch; }
.askInput textarea { flex:1; resize:none; min-height:58px; }
.askInputSide { display:flex; flex-direction:column; gap:6px; }
.askInputSide .primary, .askInputSide .mini { margin-top:0; }

.inbox { border:1px solid color-mix(in srgb, var(--ph-accent) 40%, transparent);
  border-radius:var(--ph-radius); padding:10px 12px;
  background:color-mix(in srgb, var(--ph-accent) 5%, transparent); }
.inboxRow { border-color:color-mix(in srgb, var(--ph-accent) 25%, transparent); }
.pseudoBox { margin-top:14px; }
.streamHead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.streamHead label { flex:1; }
/* One card per live network — the cockpit row that replaced the Reddit-shaped
   tile streams (their content lives on the network boards now). */
.netCards { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
  gap:10px; margin-top:8px; }
.netCard { display:flex; flex-direction:column; gap:4px; align-items:flex-start; text-align:left;
  padding:10px 12px; background:none; cursor:pointer; font-family:inherit;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); transition:border-color .12s; }
.netCard:hover { border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent); }
.netCard .meta { font-size:10.5px; color:var(--ph-muted); }
.netCardHead { display:inline-flex; align-items:center; font-size:13px; color:var(--ph-text); }
/* Memory settings: a checkbox and its consequence, on one line each. */
.memRows { display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.memRow { display:flex; align-items:flex-start; gap:9px; cursor:pointer; }
.memRow > span { display:flex; flex-direction:column; gap:1px; }
.memRow strong { font-size:12.5px; font-weight:600; color:var(--ph-text); }
.memRow .hint { margin:0; }
.diagTiles { margin-top:10px; }
.diagTiles .kpi { cursor:default; }
.diagTiles .kpi:hover { border-color:var(--ph-border); }
.diagWhy { margin:2px 0 0; font-size:11.5px; color:var(--ph-text-2); line-height:1.35;
  text-transform:none; letter-spacing:0; }
.draftHead { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.voiceTag { font-size:11px; letter-spacing:.1em; color:var(--ph-accent); font-weight:700;
  font-family:var(--ph-font-tag); text-transform:uppercase; }
.draft textarea { width:100%; box-sizing:border-box; resize:vertical; font-size:13px; line-height:1.5;
  color:var(--ph-text); background:var(--ph-panel); border:1px solid var(--ph-border);
  border-radius:var(--ph-radius); padding:10px; font-family:var(--ph-font); }
.draft textarea:focus { outline:none; border-color:var(--ph-accent); }
.polishRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px; }
.polishRow .mini { margin-top:0; }
.polishRow .warn { margin:0; }
/* A translation is read, not written — say it in the field itself. */
.draft textarea[readonly] { opacity:.85; cursor:default; }
.coachNote { margin-top:14px; font-size:12.5px; color:var(--ph-text-2);
  border-left:2px solid var(--ph-accent); padding-left:10px; }
.gauge { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; color:var(--ph-muted); }
.gauge .big { font-size:22px; font-weight:700; color:var(--ph-text); font-family:var(--ph-font-head); }
.gauge .sep { margin:0 4px; }
.ok { color:var(--ph-ok); }
.ko { color:var(--ph-warn); }
.gauge .ok, .gauge .ko { margin-left:12px; font-weight:600; }
/* ── The verdict board (doc 75 §5) ──────────────────────────────────────────
   BLOCKED is the loudest tone in the app on purpose: it is the only verdict
   that changes WHAT to do rather than how much, and seeing it early saves
   three weeks. UNKNOWN is dashed and muted — visibly not an answer, so it
   can never be mistaken for a clean slate.
   (No backticks anywhere in this file: the whole stylesheet is one template
   literal, and one of them ends it.) */
.vTag { display:inline-block; font-size:10px; padding:1px 7px; border-radius:8px; white-space:nowrap;
  font-family:var(--ph-font-tag); letter-spacing:.06em; text-transform:uppercase;
  border:1px solid var(--ph-border); color:var(--ph-text-2); }
.vTag.ready { color:var(--ph-ok); border-color:color-mix(in srgb, var(--ph-ok) 45%, transparent); }
.vTag.close { color:var(--ph-accent); border-color:color-mix(in srgb, var(--ph-accent) 50%, transparent); }
.vTag.notyet { color:var(--ph-warn); border-color:color-mix(in srgb, var(--ph-warn) 45%, transparent); }
.vTag.blocked { color:var(--ph-danger); border-color:color-mix(in srgb, var(--ph-danger) 60%, transparent);
  background:color-mix(in srgb, var(--ph-danger) 10%, transparent); }
.vTag.unknown { color:var(--ph-muted); border-style:dashed; }
.nextMove { margin-top:14px; padding:12px 14px; border:1px solid var(--ph-border);
  border-left:2px solid var(--ph-accent); border-radius:var(--ph-radius); background:var(--ph-panel); }
.nextMove label { margin-top:0; }
.nextMove h3 { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  margin:6px 0 0; font-size:14px; font-family:var(--ph-font-head); }
.because { margin:6px 0 0; padding-left:16px; font-size:12px; color:var(--ph-text-2); }
.because li { margin:2px 0; }
/* A community's own words are QUOTED, so they must not read as our sentence. */
.because li.verbatim { color:var(--ph-text); font-style:italic; }
.because li.gap { color:var(--ph-muted); }
/* Acts written without Pheme weigh double in the verdict, so the line that
   carries them is not left looking like the counts around it. */
.because li.solo { color:var(--ph-accent); }
.vTable td { vertical-align:top; }
.vTable .because { margin-top:0; }
.vRules { margin-top:6px; font-size:12px; }
.vRules summary { cursor:pointer; color:var(--ph-muted); font-size:11.5px; }
.vRules ul { margin:6px 0 0; padding-left:16px; color:var(--ph-text-2); }
.vRules li { margin:3px 0; }
.sourceTag { font-size:10px; padding:1px 7px; border-radius:8px; margin-right:8px;
  font-family:var(--ph-font-tag); letter-spacing:.06em; text-transform:uppercase;
  border:1px solid var(--ph-border); color:var(--ph-muted); }

/* The report's fact sheet — every figure here is COUNTED by this app, and an
   absent one is a dash. A zero in this grid would be a measurement. */
.reportBox { margin-top:14px; }
.factSheet { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));
  gap:8px; margin-top:12px; }
.factCell { display:flex; flex-direction:column; gap:2px; padding:8px 10px;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); background:var(--ph-panel); }
.factVal { font-size:18px; font-weight:700; color:var(--ph-text); font-family:var(--ph-font-head); }
.factVal.absent { color:var(--ph-muted); font-weight:400; }
.factLabel { font-size:10.5px; color:var(--ph-muted); }
/* A movement, and only where two dated measurements exist. No badge means
   "nothing to compare against", never "it did not move". */
.factDelta { margin-left:5px; font-size:11px; font-weight:600; font-family:var(--ph-font-tag); }
.factDelta.up { color:var(--ph-ok); }
.factDelta.down { color:var(--ph-warn); }
/* Where a published post actually landed — asked for, never guessed. */
.postedUrl { flex:1; min-width:140px; margin-left:6px; padding:3px 8px; font-size:11.5px;
  border-radius:var(--ph-radius); border:1px dashed var(--ph-border);
  background:var(--ph-panel); color:var(--ph-text-2); font-family:var(--ph-font); }

.stats { margin-top:14px; border-collapse:collapse; width:100%; font-size:12.5px; }
.stats th { text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--ph-muted); padding:6px 10px 6px 0; font-family:var(--ph-font-tag); }
.stats td { padding:6px 10px 6px 0; border-top:1px solid var(--ph-border); }
.ghost { background:none; border:1px solid var(--ph-border); border-radius:var(--ph-radius);
  color:var(--ph-muted); padding:6px 12px; font-size:12px; cursor:pointer; margin-top:16px; font-family:inherit; }
.ghost.danger { color:var(--ph-danger); }
.skins { display:flex; gap:10px; flex-wrap:wrap; }
.skinCard { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); background:var(--ph-panel);
  color:var(--ph-text); font-size:12.5px; font-family:inherit; }
.skinCard.on { border-color:var(--ph-accent); box-shadow:inset 0 0 0 1px var(--ph-accent); }
.skinSwatch { display:inline-flex; align-items:center; justify-content:center; width:34px; height:24px;
  border-radius:4px; border:1px solid rgba(128,128,128,.35); }
.skinDot { width:10px; height:10px; border-radius:50%; }
.mini { margin-top:8px; background:none; border:1px dashed var(--ph-border); border-radius:var(--ph-radius);
  color:var(--ph-muted); padding:4px 10px; font-size:11.5px; cursor:pointer; }
.mini:disabled { opacity:.5; cursor:default; }
.sugRow { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.sugChip { font-size:11.5px; padding:3px 9px; border-radius:10px; cursor:pointer;
  border:1px dashed color-mix(in srgb, var(--ph-accent) 55%, transparent);
  background:none; color:var(--ph-text-2); }
.sugChip:hover { background:color-mix(in srgb, var(--ph-accent) 12%, transparent); }
.sugChip.all { border-style:solid; color:var(--ph-accent); font-weight:600; }
.badge { display:inline-block; margin-left:6px; min-width:16px; text-align:center; font-size:10px;
  font-weight:700; line-height:16px; border-radius:8px; background:var(--ph-accent); color:var(--ph-on-accent); }
.direct { color:inherit; text-decoration:none; }
.direct:hover strong { text-decoration:underline; }
.angleChip { font-size:11.5px; padding:4px 10px; border-radius:12px; cursor:pointer; text-align:left;
  border:1px dashed color-mix(in srgb, var(--ph-accent) 55%, transparent); background:none; color:var(--ph-text-2); }
.angleChip.on { border-style:solid; border-color:var(--ph-accent); color:var(--ph-text);
  background:color-mix(in srgb, var(--ph-accent) 14%, transparent); }
.checks { display:flex; gap:5px; flex-wrap:wrap; margin:0 8px; }
.checkChip { font-size:10px; padding:1px 6px; border-radius:8px; font-family:var(--ph-font-tag); }
.checkChip.ok { color:var(--ph-ok); border:1px solid color-mix(in srgb, var(--ph-ok) 45%, transparent); }
.checkChip.ko { color:var(--ph-warn); border:1px solid color-mix(in srgb, var(--ph-warn) 55%, transparent); }
.presConfig { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-top:6px; }
@media (max-width: 720px) { .presConfig { grid-template-columns:1fr; } }
.presConfig label { margin-top:8px; font-size:12px; }
.presConfig input { width:100%; box-sizing:border-box; margin-top:4px; padding:7px 10px;
  border-radius:var(--ph-radius); border:1px solid var(--ph-border); background:var(--ph-panel);
  color:var(--ph-text); font-size:13px; font-family:var(--ph-font); }
.karma { font-size:12.5px; color:var(--ph-muted); }
/* One status line. The separator is drawn between segments by CSS so that a
   segment can be absent without leaving a dangling dot behind it. */
.statusLine { margin:8px 0 0; font-size:12.5px; color:var(--ph-muted); }
.statusLine > span + span::before { content:' · '; color:var(--ph-muted); }
.kindTag { font-size:10px; padding:1px 7px; border-radius:8px; margin-right:6px; font-family:var(--ph-font-tag);
  border:1px solid var(--ph-border); color:var(--ph-text-2); }
.kindTag.post { color:var(--ph-accent); border-color:color-mix(in srgb, var(--ph-accent) 50%, transparent); }
.kindTag.comment { color:var(--ph-ok); border-color:color-mix(in srgb, var(--ph-ok) 45%, transparent); }
.kindTag.none { color:var(--ph-warn); border-color:color-mix(in srgb, var(--ph-warn) 50%, transparent); }
/* Written without Pheme. Filled rather than outlined, because it is the only
   tag on a card that is a small victory rather than a classification. */
.kindTag.solo { color:var(--ph-accent); letter-spacing:.06em; text-transform:uppercase;
  border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent);
  background:color-mix(in srgb, var(--ph-accent) 12%, transparent); }
.grid { list-style:none; margin:14px 0 0; padding:0; display:grid;
  grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px; }
.tile { border:1px solid var(--ph-border); border-radius:var(--ph-radius); padding:12px;
  background:var(--ph-panel); cursor:pointer; transition:border-color .12s; }
.tile:hover { border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent); }
.tile.dim { opacity:.55; }
.tile .cardTitle strong { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.backBtn { margin-top:6px; margin-bottom:4px; }
.detailGrid { display:grid; grid-template-columns:minmax(0,1fr) 240px; gap:20px; align-items:start; margin-top:10px; }
@media (max-width:900px) { .detailGrid { grid-template-columns:1fr; } }
.detailMain { min-width:0; }
.detailSide { position:sticky; top:12px; display:flex; flex-direction:column; gap:8px; }
.detailSide button { padding:9px 12px; border-radius:var(--ph-radius); font-size:12.5px; cursor:pointer;
  border:1px solid var(--ph-border); background:var(--ph-panel); color:var(--ph-text); text-align:left;
  font-family:inherit; }
.detailSide button.primary { background:var(--ph-accent); color:var(--ph-on-accent); border-color:transparent; margin-top:0; }
.detailSide button:disabled { opacity:.5; cursor:default; }
.detailSide button.followOn { border-color:var(--ph-ok); color:var(--ph-ok); }
.sideRule { border:none; border-top:1px solid var(--ph-border); margin:4px 0; width:100%; }
.biGrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:1100px) { .biGrid { grid-template-columns:1fr; } }
.biHead { margin:12px 0 4px; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--ph-muted); font-family:var(--ph-font-tag); }
.postFull { white-space:pre-wrap; color:var(--ph-text-2); font-size:13px; font-family:var(--ph-font);
  background:var(--ph-panel); padding:12px; border-radius:var(--ph-radius); margin:12px 0 0;
  border:1px solid var(--ph-border); max-height:340px; overflow-y:auto; }
.followOn { border-color:var(--ph-ok) !important; color:var(--ph-ok) !important; }
.toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:6px; }
.toolbar .primary { margin-top:0; }
.spacer { flex:1; }
.filters { display:inline-flex; gap:5px; }
.fchip { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:4px 10px; cursor:pointer;
  border:1px solid var(--ph-border); border-radius:14px; background:none; color:var(--ph-muted); }
.fchip.on { border-color:var(--ph-accent); color:var(--ph-text);
  background:color-mix(in srgb, var(--ph-accent) 14%, transparent); }
.fchip .netChip { margin-right:0; width:14px; height:14px; font-size:9px; }
.notice { margin:8px 0 0; font-size:12px; color:var(--ph-warn);
  border:1px solid color-mix(in srgb, var(--ph-warn) 35%, transparent);
  border-radius:var(--ph-radius); padding:6px 10px; }
.cooldownOver { margin:8px 0 0; font-size:12px; color:var(--ph-ok);
  border:1px solid color-mix(in srgb, var(--ph-ok) 35%, transparent);
  border-radius:var(--ph-radius); padding:6px 10px; }
.card.dim { opacity:.55; }
.mnemoBtn { margin-top:0; color:var(--ph-accent); border-color:color-mix(in srgb, var(--ph-accent) 45%, transparent); }
.tile.mnHigh { border-color:color-mix(in srgb, var(--ph-ok) 60%, transparent);
  background:color-mix(in srgb, var(--ph-ok) 6%, transparent); }
.tile.mnLow { opacity:.5; }
.mnTag { font-size:10px; padding:1px 6px; border-radius:8px; font-family:var(--ph-font-tag);
  color:var(--ph-ok); border:1px solid color-mix(in srgb, var(--ph-ok) 45%, transparent); }
.mnWhy { display:block; font-size:11px; color:var(--ph-ok); margin-top:2px; }
.pinX { background:none; border:none; cursor:pointer; font-size:15px; line-height:1;
  color:var(--ph-muted); padding:0 2px; flex-shrink:0; }
.pinX.on { color:var(--ph-accent); }
.scoreUp { margin-left:6px; color:var(--ph-ok); font-weight:700; font-size:11px; }
.subMeta { color:var(--ph-muted); font-size:10px; }
.witRow { align-items:baseline; gap:6px; margin:8px 0; flex-wrap:wrap; }
.witRow .hint { margin:0 4px 0 0; }
.pinX:hover { color:var(--ph-accent); }
.storyList { flex-wrap:wrap; margin-top:10px; }
.storyCard { margin-top:12px; }
.storyCard .row input { flex:1; }
.chars.over { color:var(--ph-warn); font-weight:700; }
.draft.posted textarea { opacity:.6; }
.svgPreview { margin-top:8px; border:1px solid var(--ph-border); border-radius:var(--ph-radius);
  overflow:hidden; max-width:480px; background:#fff; }
.svgPreview svg { display:block; width:100%; height:auto; }
.soonChip { opacity:.55; cursor:default; }
.netbar { display:flex; flex-wrap:wrap; gap:6px; padding:6px 18px 0; }
.postPreview { margin-top:6px; border:1px solid var(--ph-border); border-top:3px solid var(--ph-accent);
  border-radius:var(--ph-radius); padding:12px 14px; max-width:560px; background:var(--ph-panel); }
.ppHead { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.ppAvatar { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px;
  border-radius:50%; border:1px solid var(--ph-border); color:var(--ph-accent); font-weight:700; }
.ppText { margin:0; font-size:13.5px; line-height:1.55; color:var(--ph-text); white-space:pre-wrap; }
.repliedTag { margin-left:8px; font-size:10px; color:var(--ph-ok); font-family:var(--ph-font-tag); }
.draftedTag { margin-left:8px; font-size:10px; color:var(--ph-accent); font-family:var(--ph-font-tag); }
/* "You are three weeks late" — muted, because it is a fact, not an alarm. */
.staleTag { margin-left:8px; font-size:10px; color:var(--ph-muted); font-family:var(--ph-font-tag); }
.hideX { margin-left:auto; align-self:flex-start; background:none; border:none; cursor:pointer;
  color:var(--ph-muted); font-size:15px; line-height:1; padding:2px 6px; }
.hideX:hover { color:var(--ph-danger); }
.itemHead { display:flex; gap:12px; align-items:flex-start; margin-top:10px; padding:12px;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); background:var(--ph-panel); }
.itemHead > button { margin-left:auto; padding:6px 12px; border-radius:var(--ph-radius); font-size:12.5px;
  cursor:pointer; border:1px solid var(--ph-border); background:none; color:var(--ph-text); }
.stepHead { margin:20px 0 2px; font-size:11.5px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--ph-accent); font-family:var(--ph-font-tag); font-weight:700; }
.chars { font-size:10.5px; color:var(--ph-muted); font-family:var(--ph-font-tag); margin-left:auto; margin-right:8px; }
.draftHead .checks { margin-left:8px; margin-right:0; }
.spark { display:flex; align-items:flex-end; gap:5px; height:38px; margin-top:6px; }
.sparkBar { width:16px; border-radius:3px 3px 0 0; background:var(--ph-border); }
.sparkBar.on { background:var(--ph-accent); }
.cfgBox { margin-top:8px; font-size:12.5px; }
.cfgBox summary { cursor:pointer; color:var(--ph-muted); }
.netChip { display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px;
  margin-right:7px; font-size:10.5px; font-weight:800; color:#fff; font-family:var(--ph-font-tag);
  vertical-align:text-bottom; }
.netChip.hn { background:#FF6600; border-radius:3px; }
.netChip.rd { background:#FF4500; border-radius:50%; }
.group { margin-top:20px; }
.groupHead { margin:0 0 8px; font-size:13.5px; font-family:var(--ph-font-head); letter-spacing:.04em; }
.group .card { margin-bottom:10px; }
/* The fold that keeps discovery out of the way of "what is waiting for me".
   Its lid is a section header, not a footnote: closed, it is the only thing
   standing between the user and half the board, so it has to read as a door. */
.boardRest { margin-top:18px; border-top:1px solid var(--ph-border); }
.boardRest > summary { cursor:pointer; padding:10px 0 2px; color:var(--ph-muted);
  font-family:var(--ph-font-head); letter-spacing:var(--ph-head-spacing); }
.boardRest > summary:hover { color:var(--ph-text); }

.postBox { margin-top:8px; font-size:12.5px; }
.postBox summary { cursor:pointer; color:var(--ph-muted); }
.postBox .filters { display:flex; flex-wrap:wrap; margin-top:8px; }
.postBox pre { white-space:pre-wrap; color:var(--ph-text-2); font-size:12px; font-family:var(--ph-font);
  background:var(--ph-panel); padding:10px; border-radius:var(--ph-radius); margin:6px 0 0; }
/* What the surface's own public feed says you published — titles as doors. */
.feedList { list-style:none; margin:8px 0 0; padding:0; }
.feedList li { padding:5px 0; border-bottom:1px solid var(--ph-border); font-size:12.5px; }
.feedList li:last-child { border-bottom:0; }
.linkish { background:none; border:0; padding:0; cursor:pointer; text-align:left;
  color:var(--ph-text); font:inherit; }
.linkish:hover { color:var(--ph-accent); text-decoration:underline; }

/* The images a post carries — one row each, so "unread" and "read by a
   machine" are two visibly different states rather than one warning. */
.mediaBox { margin-top:10px; }
.mediaRow + .mediaRow { margin-top:8px; padding-top:8px; border-top:1px solid var(--ph-border); }
.mediaRow .row { margin-top:4px; }
.myMsg { margin-top:8px; border-left:2px solid var(--ph-accent); padding-left:10px; }
.myMsg p { margin:2px 0 0; font-size:12.5px; color:var(--ph-text-2); }
/* The words being answered, at the head of the box that answers them. */
.answering { margin:0 0 10px; padding:8px 10px; border-radius:var(--ph-radius);
  border:1px dashed color-mix(in srgb, var(--ph-accent) 45%, transparent);
  background:color-mix(in srgb, var(--ph-accent) 6%, transparent); }
.answering .meta { font-size:11px; font-family:var(--ph-font-tag); }
.answering p { margin:4px 0 0; font-size:12.5px; color:var(--ph-text-2); }
.mini.on { border-style:solid; border-color:var(--ph-accent); color:var(--ph-text); }
/* An answer opened inside a reply row: it owns the width, not the indent. */
.reply .studioBox { margin-left:-14px; }
.replyList { list-style:none; margin:10px 0 0; padding:0 0 0 14px;
  border-left:1px solid var(--ph-border); display:flex; flex-direction:column; gap:10px; }
.reply p { margin:2px 0; font-size:12.5px; color:var(--ph-text-2); }
.replyMeta { font-size:11px; color:var(--ph-muted); font-family:var(--ph-font-tag); }
.reply .mini { margin-top:2px; }
.newChip { margin-left:8px; font-size:9.5px; padding:1px 6px; border-radius:8px; text-transform:uppercase;
  letter-spacing:.06em; background:var(--ph-accent); color:var(--ph-on-accent); font-weight:700; }
.card.fresh { border-color:color-mix(in srgb, var(--ph-accent) 45%, transparent); }
.snippet { font-size:12px; color:var(--ph-text-2); margin-top:2px; }
.nets { display:flex; flex-wrap:wrap; gap:8px; }
.net { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; padding:6px 11px;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); background:var(--ph-panel); }
.net.soon { opacity:.55; }
.netTag { font-size:9.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--ph-muted);
  font-family:var(--ph-font-tag); }
.net.live .netTag { color:var(--ph-ok); }
.corner { display:flex; align-items:center; gap:6px; }
.cornerSkin { display:inline-flex; align-items:center; justify-content:center; width:26px; height:20px;
  border-radius:4px; border:1px solid var(--ph-border); cursor:pointer; padding:0; }
.cornerSkin.on { border-color:var(--ph-accent); box-shadow:0 0 0 1px var(--ph-accent); }
.cornerSkin span { width:8px; height:8px; border-radius:50%; }
.cornerLang { background:none; border:1px solid var(--ph-border); border-radius:4px;
  color:var(--ph-muted); font-size:11px; padding:3px 8px; cursor:pointer; }
.ver { font-family:var(--ph-font-tag); }
.studioBox { margin-top:26px; border-top:1px solid var(--ph-border); padding-top:4px; }
.ideas { width:100%; box-sizing:border-box; min-height:64px; resize:vertical; font-size:13px; line-height:1.5;
  color:var(--ph-text); background:var(--ph-panel); border:1px solid var(--ph-border);
  border-radius:var(--ph-radius); padding:10px; font-family:var(--ph-font); margin-top:4px; }
.draftHead .mini { margin-top:0; }
.kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-top:12px; }
.kpi { display:flex; flex-direction:column; gap:3px; align-items:flex-start; padding:10px 12px;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius); background:var(--ph-panel);
  cursor:pointer; text-align:left; transition:border-color .12s; font-family:inherit; }
.kpi:hover { border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent); }
.kpiVal { font-size:26px; font-weight:700; color:var(--ph-text); font-family:var(--ph-font-head); }
.kpiVal.ok { color:var(--ph-ok); }
.kpiVal.ko { color:var(--ph-warn); }
.kpiVal.accent { color:var(--ph-accent); }
.kpiLabel { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--ph-muted);
  font-family:var(--ph-font-tag); }
/* A network's own numbers: denser than the cockpit's, they sit above a board
   the user is already reading, not on a page of their own. */
.netKpis { grid-template-columns:repeat(auto-fit, minmax(108px, 1fr)); gap:8px; margin-top:10px; }
.netKpis .kpiVal { font-size:19px; }
.dashGrid { display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:start; }
@media (max-width:900px) { .dashGrid { grid-template-columns:1fr; } }
.actList { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; }
.actItem { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12.5px;
  color:var(--ph-text-2); padding:8px 12px; border:1px solid var(--ph-border);
  border-radius:var(--ph-radius); background:var(--ph-panel); }
.actItem .mini { margin-top:0; flex-shrink:0; }

/* Board lists. Full-width rows put their button an entire screen away from
   their label on a wide window — the whole CARD is the door instead, and the
   list wraps into columns rather than stretching one line to 2000px. */
.actGrid { list-style:none; margin:6px 0 0; padding:0; display:grid; gap:10px;
  grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); align-items:start; }
/* The row owns its height. A 100% height on the button was circular once the
   li held a SECOND child (the unfolded thread): the button grew to the whole
   row while the thread overflowed outside it, painting over the cards below. */
.actGrid > li { display:flex; flex-direction:column; min-width:0; }
.actCard { display:flex; flex-direction:column; gap:5px; align-items:flex-start; text-align:left;
  width:100%; flex:1 1 auto; min-width:0; padding:9px 12px; cursor:pointer; font-family:inherit;
  border:1px solid var(--ph-border); border-radius:var(--ph-radius);
  background:var(--ph-panel); transition:border-color .12s; }
.actCard:hover { border-color:color-mix(in srgb, var(--ph-accent) 55%, transparent); }
/* An unfolded conversation takes the full row: a threaded exchange in a
   310px column is unreadable, and it is the thing you came to read. */
.actGrid > li.spanAll { grid-column:1 / -1; }
/* Expanded, the header is a header — it must not stretch to the thread's
   height, which is what made it a tall empty box in the first place. */
.actGrid > li.spanAll .actCard { flex:0 0 auto; }
.actCard.on { border-color:var(--ph-accent);
  border-bottom-left-radius:0; border-bottom-right-radius:0; }
.actCard.on + .card { border-top:none; border-top-left-radius:0; border-top-right-radius:0;
  margin-top:0; border-color:var(--ph-accent); }
.actTop { display:flex; align-items:center; flex-wrap:wrap; gap:7px; width:100%; }
.actTop .meta, .actTop .staleTag, .actTop .scoreUp { margin-left:0; font-size:10.5px; color:var(--ph-muted); }
.actTop .score { font-size:11px; padding:1px 7px; }
.actTitle { font-size:12.5px; line-height:1.35; color:var(--ph-text);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
/* The direct link out, next to what it opens — not at the far edge. */
.actOpen { margin-left:auto; color:var(--ph-muted); text-decoration:none; font-size:12px; padding:0 2px; }
.actOpen:hover { color:var(--ph-accent); }
`;
