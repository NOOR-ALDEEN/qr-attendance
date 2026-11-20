/* نظام الحضور الذكي — نسخة الموبايل (PWA)
   © 2026 Dr. Noor Aldeen — جميع الحقوق محفوظة */
'use strict';
const APP_VERSION = '1.0';
const CFG = window.APP_CONFIG || {};
const AUTHOR = { name: CFG.authorName || 'Dr. Noor Aldeen', email: CFG.email || '' };
const COPYRIGHT = `© 2026 ${AUTHOR.name} — جميع الحقوق محفوظة`;
const { ALL, normName, makePayload, parsePayload, randomSecret } = CORE;
const X = XLSX_AR;

/* ------------------------------------------------------------ helpers */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowHMS = () => new Date().toTimeString().slice(0, 8);
const hmsToDate = t => { const [h, m, s] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, s || 0); return d; };
const safeName = s => String(s).replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim().slice(0, 80) || 'ملف';

let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.onclick = null;
  t.className = kind === 'bad' ? 'bad' : '';
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

/* ------------------------------------------------------------ storage */
const KEY = 'qra_mobile_db_v1';
function blank() {
  return { secret: randomSecret(), secretSource: 'phone', students: [], sessions: [], attendance: [], hwm: 0, nextSid: 1, settings: {} };
}
function loadDB() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d) {
      d.attendance = (d.att || []).map(a => ({ session_id: a[0], code: a[1], time: a[2], method: a[3] ? 'يدوي' : 'QR' }));
      delete d.att;
      return Object.assign(blank(), d);
    }
  } catch (e) { /* corrupted -> start fresh */ }
  return blank();
}
let DB = loadDB();
function save() {
  const d = Object.assign({}, DB);
  d.att = DB.attendance.map(a => [a.session_id, a.code, a.time, a.method === 'QR' ? 0 : 1]);
  delete d.attendance;
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch (e) { toast('⚠ مساحة التخزين ممتلئة — نزّل التقارير القديمة واحذف محاضراتها', 'bad'); }
}
if (!localStorage.getItem(KEY)) save();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ------------------------------------------------------------ data model */
const STAGE_ORDER = ['الأولى', 'الاولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة'];
function stages() {
  const set = [...new Set(DB.students.map(s => s.stage).filter(Boolean))];
  const rank = s => { const i = STAGE_ORDER.findIndex(o => s.includes(o)); return i < 0 ? 99 : i; };
  return set.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ar'));
}
const byName = (a, b) => a.name.localeCompare(b.name, 'ar');
const studentsOf = st => (st && st !== ALL ? DB.students.filter(s => s.stage === st) : DB.students.slice()).sort(byName);
const student = code => DB.students.find(s => s.code === code);
const findStudent = (name, stage) => DB.students.filter(s => normName(s.name) === normName(name) &&
  (stage === undefined || stage === null || normName(s.stage) === normName(stage)));
const nextCode = () => 'P' + String(++DB.hwm).padStart(5, '0');
const courses = () => [...new Set(DB.sessions.slice().sort((a, b) => b.id - a.id).map(s => s.course))];

function upsertRows(rows) {
  let added = 0, updated = 0;
  const renamed = [], seen = new Map();
  for (const r of rows) {
    let key = normName(r.name) + '|' + normName(r.stage);
    if (seen.has(key)) {
      const n = seen.get(key) + 1;
      seen.set(key, n);
      const nn = `${r.name} (${n})`;
      renamed.push([r.name, nn]);
      r.name = nn;
      key = normName(nn) + '|' + normName(r.stage);
    }
    if (!seen.has(key)) seen.set(key, 1);
    const ex = findStudent(r.name, r.stage)[0];
    if (ex) { ex.name = r.name; ex.department = r.department || ''; ex.grp = r.grp || ''; if (r.joined) ex.joined = r.joined; updated++; continue; }
    DB.students.push({ code: nextCode(), name: r.name.trim(), department: (r.department || '').trim(), stage: (r.stage || '').trim(),
      grp: (r.grp || '').trim(), joined: r.joined || '', added: new Date().toISOString() });
    added++;
  }
  save();
  return { added, updated, renamed };
}
function addStudent(name, stage, department, grp, joined) {
  const ex = findStudent(name, stage)[0];
  if (ex) return [ex, true];
  const st = { code: nextCode(), name: name.trim(), department: (department || '').trim(), stage: stage.trim(),
    grp: (grp || '').trim(), joined: joined || '', added: new Date().toISOString() };
  DB.students.push(st);
  save();
  return [st, false];
}
function deleteStudents(codes) {
  const set = new Set(codes);
  DB.students = DB.students.filter(s => !set.has(s.code));
  save();
}
function openSession(course, date, stage) {
  const ex = DB.sessions.find(s => s.course === course && s.date === date && s.stage === stage);
  if (ex) return [ex.id, true];
  const id = DB.nextSid++;
  DB.sessions.push({ id, course, date, stage, started: nowHMS().slice(0, 5) });
  save();
  return [id, false];
}
const session = id => DB.sessions.find(s => s.id === id);
function mark(sid, code, method) {
  const ex = DB.attendance.find(a => a.session_id === sid && a.code === code);
  if (ex) return ['dup', ex.time];
  const t = nowHMS();
  DB.attendance.push({ session_id: sid, code, time: t, method });
  save();
  return ['ok', t];
}
function unmark(sid, code) {
  DB.attendance = DB.attendance.filter(a => !(a.session_id === sid && a.code === code));
  save();
}
const attendanceOf = sid => DB.attendance.filter(a => a.session_id === sid)
  .map(a => Object.assign({}, a, { name: (student(a.code) || { name: '(غير مسجل)' }).name }))
  .sort((a, b) => b.time.localeCompare(a.time));
const expected = st => studentsOf(st).length;
function deleteSession(id) {
  DB.sessions = DB.sessions.filter(s => s.id !== id);
  DB.attendance = DB.attendance.filter(a => a.session_id !== id);
  if (DB.settings.activeSid === id) DB.settings.activeSid = null;
  save();
}

/* ------------------------------------------------------------ sound / vibration */
let AC = null;
function unlockAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* no audio */ } }
function beep(kind) {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [60, 60, 60]);
    if (!AC) return;
    const tones = kind === 'ok' ? [[880, 0, .12]] : kind === 'dup' ? [[620, 0, .09], [620, .13, .09]] : [[220, 0, .28]];
    for (const [f, start, dur] of tones) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(.25, AC.currentTime + start);
      g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + start + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(AC.currentTime + start); o.stop(AC.currentTime + start + dur + .02);
    }
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------ files: download / share / pick */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function share(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: title || name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  download(blob, name);
  toast('المشاركة غير مدعومة هنا، تم تنزيل الملف بدلاً منها');
}
function pickFile(accept) {
  return new Promise(resolve => {
    const inp = $('#filepick');
    inp.value = '';
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

/* ------------------------------------------------------------ sheet (bottom dialog) */
function openSheet(node) {
  const sh = $('#sheet');
  sh.innerHTML = '<div class="grab"></div><button class="sheetx" aria-label="إغلاق">✕</button>';
  $('.sheetx', sh).onclick = closeSheet;
  sh.appendChild(node);
  $('#backdrop').style.display = 'block';
  requestAnimationFrame(() => sh.classList.add('open'));
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#backdrop').style.display = 'none';
}
$('#backdrop').addEventListener('click', closeSheet);

function askText(title, note, value, options) {
  return new Promise(resolve => {
    const id = 'dl' + Math.random().toString(36).slice(2);
    const node = el(`<div><h3>${esc(title)}</h3><div class="muted">${esc(note || '')}</div>
      <input class="in" style="margin-top:10px" list="${id}" value="${esc(value || '')}">
      <datalist id="${id}">${(options || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>
      <div class="btns" style="margin-top:12px"><button class="btn green">متابعة</button><button class="btn rghost">إلغاء</button></div></div>`);
    const inp = $('input', node);
    $('.green', node).onclick = () => { const v = inp.value.trim(); if (!v) return toast('اكتب قيمة', 'bad'); closeSheet(); resolve(v); };
    $('.rghost', node).onclick = () => { closeSheet(); resolve(null); };
    openSheet(node);
    setTimeout(() => { inp.focus(); inp.select(); }, 250);
  });
}

/* ------------------------------------------------------------ student card (same design as desktop) */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const FONT = 'Tahoma, "Segoe UI", "Noto Kufi Arabic", "Noto Naskh Arabic", "SF Arabic", "Geeza Pro", Arial, sans-serif';
function fitLines(ctx, text, maxW, maxLines, start, bold) {
  const words = String(text).split(/\s+/);
  for (let px = Math.round(start); px >= 10; px--) {
    ctx.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`;
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = (cur + ' ' + w).trim();
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
    if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxW)) return { px, lines };
  }
  return { px: 10, lines: [text] };
}
async function cardCanvas(st, W = 720, H = 960) {
  const payload = await makePayload(st.name, st.stage || '', DB.secret);
  const q = QR.encode(payload);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.direction = 'rtl';
  const rad = W * 0.05, band = H * 0.15;
  ctx.save(); roundRect(ctx, 0, 0, W, H, rad); ctx.clip();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#0891B2'); g.addColorStop(1, '#4338CA');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, band);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(band * 0.36)}px ${FONT}`;
  ctx.fillText('بطاقة حضور الطالب', W / 2, band / 2);
  const quiet = 2, qs = Math.floor(Math.min(W * 0.70, H * 0.52));
  const cell = Math.max(1, Math.floor(qs / (q.size + 2 * quiet))), side = cell * (q.size + 2 * quiet);
  const qx = Math.floor((W - side) / 2), qy = Math.floor(band + H * 0.03);
  ctx.fillStyle = '#fff'; ctx.fillRect(qx, qy, side, side);
  ctx.fillStyle = '#000';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++)
    if (q.modules[y][x]) ctx.fillRect(qx + (x + quiet) * cell, qy + (y + quiet) * cell, cell, cell);
  let y = qy + side + H * 0.025;
  ctx.textBaseline = 'top';
  const nf = fitLines(ctx, st.name, W * 0.88, 2, H * 0.05, true);
  ctx.fillStyle = '#0F172A'; ctx.font = `bold ${nf.px}px ${FONT}`;
  for (const l of nf.lines) { ctx.fillText(l, W / 2, y); y += nf.px * 1.25; }
  y += H * 0.008;
  if (st.stage) {
    const ph = H * 0.065;
    ctx.font = `bold ${Math.round(ph * 0.48)}px ${FONT}`;
    const pw = Math.min(W * 0.85, ctx.measureText(st.stage).width + ph * 1.2);
    ctx.fillStyle = '#EEF2FF'; roundRect(ctx, W / 2 - pw / 2, y, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#3730A3'; ctx.textBaseline = 'middle'; ctx.fillText(st.stage, W / 2, y + ph / 2);
    ctx.textBaseline = 'top';
    y += ph + H * 0.018;
  }
  const info = [st.grp ? `شعبة ${st.grp}` : '', st.department || ''].filter(Boolean).join('  •  ');
  if (info && y < H * 0.95) {
    const inf = fitLines(ctx, info, W * 0.9, 2, H * 0.032, false);
    ctx.fillStyle = '#64748B'; ctx.font = `${inf.px}px ${FONT}`;
    for (const l of inf.lines) { ctx.fillText(l, W / 2, y); y += inf.px * 1.3; }
  }
  ctx.setLineDash([W / 60, W / 60]); ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = Math.max(1, W / 300);
  roundRect(ctx, 1, 1, W - 2, H - 2, rad); ctx.stroke();
  return c;
}
const canvasBlob = c => new Promise(r => c.toBlob(r, 'image/png'));

async function showCard(st) {
  const c = await cardCanvas(st);
  const blob = await canvasBlob(c);
  const node = el(`<div><h3>بطاقة ${esc(st.name)}</h3><img class="cardimg" alt="">
    <div class="btns"><button class="btn green" data-a="share">📤 مشاركة</button><button class="btn ghost" data-a="dl">⬇ تنزيل</button></div>
    <button class="btn rghost block" data-a="del">🗑 حذف الطالب</button></div>`);
  $('img', node).src = c.toDataURL('image/png');
  node.addEventListener('click', async e => {
    const a = e.target.dataset.a;
    if (a === 'share') share(blob, `${safeName(st.name)}.png`, st.name);
    if (a === 'dl') download(blob, `${safeName(st.name)}.png`);
    if (a === 'del' && confirm(`حذف «${st.name}» من التطبيق؟\n(سجلات حضوره السابقة تبقى محفوظة)`)) {
      deleteStudents([st.code]); closeSheet(); render(); toast('تم الحذف');
    }
  });
  openSheet(node);
}

/* ------------------------------------------------------------ scanner */
const SCAN = {
  stream: null, video: null, timer: null, detector: null, busy: false, cv: null,
  facing: localStorage.getItem('qra_facing') || 'environment',
  async start(video) {
    await this.stop();
    this.video = video;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error('المتصفح لا يدعم الكاميرا. افتح الرابط من Chrome أو Safari عبر https');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = this.stream;
    video.setAttribute('playsinline', ''); video.muted = true;
    video.classList.toggle('mirror', this.facing === 'user');
    await video.play();
    if (!this.detector && 'BarcodeDetector' in window) {
      try {
        const f = await BarcodeDetector.getSupportedFormats();
        if (f.includes('qr_code')) this.detector = new BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) { this.detector = null; }
    }
    if (!this.detector) await loadJsQR();
    this.timer = setInterval(() => this.tick(), 130);
  },
  async tick() {
    const v = this.video;
    if (this.busy || !v || v.readyState < 2) return;
    this.busy = true;
    try {
      let text = null;
      if (this.detector) {
        const r = await this.detector.detect(v);
        if (r.length) text = r[0].rawValue;
      } else if (window.jsQR) {
        const vw = v.videoWidth, vh = v.videoHeight, k = Math.min(1, 800 / Math.max(vw, vh));
        const w = Math.round(vw * k), h = Math.round(vh * k);
        this.cv = this.cv || document.createElement('canvas');
        this.cv.width = w; this.cv.height = h;
        const ctx = this.cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, w, h);
        const res = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (res) text = res.binaryData ? new TextDecoder('utf-8').decode(new Uint8Array(res.binaryData)) : res.data;
      }
      if (text) onScan(text);
    } catch (e) { /* frame not ready */ }
    finally { this.busy = false; }
  },
  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  },
};
const JSQR_URLS = ['jsQR.js', 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'];
function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = () => { s.remove(); fail(); };
    document.head.appendChild(s);
  });
}
async function loadJsQR() {
  if (window.jsQR) return;
  for (const u of JSQR_URLS) { try { await loadScript(u); if (window.jsQR) return; } catch (e) { /* next */ } }
  throw new Error('تعذّر تحميل قارئ الرموز. افتح التطبيق مرة واحدة وأنت متصل بالإنترنت.');
}

/* ------------------------------------------------------------ attendance page */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* not supported */ }
}
const cooldown = new Map();
let resetTimer = null;

function renderAttendance(m) {
  const sid = DB.settings.activeSid;
  const s = sid && session(sid);
  if (!s) return renderSetup(m);
  const d = X.parseISO(s.date);
  m.appendChild(el(`<div class="banner">● ${esc(s.course)}  |  ${esc(s.stage)}  |  ${esc(X.arabicDate(d))}</div>`));
  m.appendChild(el(`<div class="cam" id="cam"><div id="camMsg">جارٍ تشغيل الكاميرا…</div><video id="video" playsinline muted></video>
    <div class="frame"><i></i><i></i><i></i><i></i></div>
    <div class="tools"><button id="flip" title="تبديل الكاميرا">🔄</button></div></div>`));
  m.appendChild(el(`<div class="result" id="result"><div class="ic">◎</div><div class="nm">جاهز للمسح</div><div class="ms">قرّب بطاقة الطالب من الكاميرا</div></div>`));
  m.appendChild(el(`<div class="stats"><div class="stat"><b id="sP" style="color:#059669">0</b><span>الحاضرون</span></div>
    <div class="stat"><b id="sT" style="color:#4338CA">0</b><span>عدد الطلبة</span></div>
    <div class="stat"><b id="sR" style="color:#0891B2">0%</b><span>نسبة الحضور</span></div></div>`));
  m.appendChild(el(`<div class="card"><h2>✍ تسجيل يدوي بالاسم</h2><div class="row">
    <input class="in" id="manual" list="mlist" placeholder="اكتب اسم الطالب"><button class="btn" id="manBtn">تسجيل</button></div>
    <datalist id="mlist">${studentsOf(s.stage).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></div>`));
  m.appendChild(el(`<div class="card"><h2>آخر الحاضرين</h2><div class="list" id="recent"></div></div>`));
  const endBtn = el(`<button class="btn red block">■ إنهاء المحاضرة</button>`);
  m.appendChild(endBtn);

  $('#manBtn').onclick = manualMark;
  $('#manual').addEventListener('keydown', e => { if (e.key === 'Enter') manualMark(); });
  endBtn.onclick = endSession;
  $('#flip').onclick = () => {
    SCAN.facing = SCAN.facing === 'user' ? 'environment' : 'user';
    localStorage.setItem('qra_facing', SCAN.facing);
    startCamera();
  };
  updateLive();
  startCamera();
}
async function startCamera() {
  const msg = $('#camMsg'), v = $('#video');
  if (!v) return;
  try {
    msg.textContent = 'جارٍ تشغيل الكاميرا…';
    await SCAN.start(v);
    msg.textContent = '';
    keepAwake(true);
  } catch (e) {
    const MSG = {
      NotAllowedError: 'لم يُسمح باستخدام الكاميرا. اسمح للمتصفح بالوصول للكاميرا (من إعدادات الموبايل أو من رمز القفل بجانب الرابط) ثم اضغط إعادة المحاولة.',
      NotFoundError: 'لم يتم العثور على كاميرا في هذا الجهاز.',
      NotReadableError: 'الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى ثم أعد المحاولة.',
      OverconstrainedError: 'الكاميرا المطلوبة غير متوفرة، جرّب زر 🔄 لتبديل الكاميرا.',
      SecurityError: 'الكاميرا تعمل فقط عبر رابط آمن (https).',
    };
    const tip = (e && MSG[e.name]) || (e && /[\u0600-\u06FF]/.test(e.message || '') ? e.message : 'تعذّر تشغيل الكاميرا');
    msg.innerHTML = `⚠ ${esc(tip)}<br><br><button class="btn">إعادة المحاولة</button><br><br><span class="muted">يمكنك الاستمرار بالتسجيل اليدوي</span>`;
    $('button', msg).onclick = () => { unlockAudio(); startCamera(); };
  }
}
function renderSetup(m) {
  const sts = stages();
  const last = DB.settings;
  m.appendChild(el(`<div class="card"><h2>بدء محاضرة</h2>
    <label class="f">المادة الدراسية</label><input class="in" id="course" list="clist" placeholder="اكتب اسم المادة" value="${esc(last.lastCourse || '')}">
    <datalist id="clist">${courses().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="grid2"><div><label class="f">المرحلة</label><select class="in" id="stage">
      ${[ALL].concat(sts).map(s => `<option ${s === last.lastStage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div><label class="f">تاريخ المحاضرة</label><input class="in" id="date" type="date" value="${todayISO()}"></div></div>
    <button class="btn green block" id="go">▶ بدء المحاضرة وتشغيل الكاميرا</button></div>`));
  if (!DB.students.length) {
    m.appendChild(el(`<div class="card"><h2>👋 أهلاً بك</h2><div class="muted" style="font-size:14px;line-height:1.8">
      لا توجد قوائم طلاب بعد. اذهب إلى صفحة <b>الطلاب</b> واختر:<br>
      • <b>استيراد من برنامج الحاسبة</b> — حتى تعمل نفس البطاقات المطبوعة.<br>
      • أو <b>استيراد ملف إكسل</b> مباشرة من الموبايل.</div></div>`));
  }
  $('#go').onclick = () => {
    unlockAudio();
    const course = $('#course').value.trim(), stage = $('#stage').value, date = $('#date').value;
    if (!course) return toast('اكتب اسم المادة أولاً', 'bad');
    if (!DB.students.length) return toast('لا يوجد طلاب. استورد القائمة من صفحة الطلاب', 'bad');
    if (!date) return toast('اختر التاريخ', 'bad');
    if (stage === ALL && sts.length > 1 &&
      !confirm(`لديك ${sts.length} قوائم: ${sts.join('، ')}\nاخترت «الكل» فستُحسب جميع القوائم في هذه المحاضرة.\n\nمتابعة؟`)) return;
    const [id, resumed] = openSession(course, date, stage);
    DB.settings.activeSid = id; DB.settings.lastCourse = course; DB.settings.lastStage = stage;
    save();
    if (resumed) toast('استكمال محاضرة سابقة بنفس المادة والتاريخ');
    render();
  };
}
function updateLive() {
  const s = session(DB.settings.activeSid);
  if (!s || !$('#recent')) return;
  const rows = attendanceOf(s.id), total = expected(s.stage);
  $('#sP').textContent = rows.length; $('#sT').textContent = total;
  $('#sR').textContent = (total ? Math.round(rows.length / total * 100) : 0) + '%';
  const list = $('#recent');
  list.innerHTML = rows.length ? '' : '<div class="empty">لم يُسجَّل أحد بعد</div>';
  rows.forEach(a => {
    const it = el(`<div class="item"><div class="grow"><div class="t">${esc(a.name)}</div>
      <div class="s">${esc(X.arabicTime(hmsToDate(a.time)))}${a.method !== 'QR' ? ' • يدوي' : ''}</div></div>
      <button class="x" title="حذف">✕</button></div>`);
    $('.x', it).onclick = () => { if (confirm(`حذف حضور «${a.name}» من هذه المحاضرة؟`)) { unmark(s.id, a.code); updateLive(); } };
    list.appendChild(it);
  });
}
function showResult(state, name, msg) {
  const r = $('#result');
  if (!r) return;
  const icons = { idle: '◎', ok: '✓', dup: '!', bad: '✕' };
  r.className = 'result ' + (state === 'idle' ? '' : state);
  r.innerHTML = `<div class="ic">${icons[state]}</div><div class="nm">${esc(name)}</div><div class="ms">${esc(msg)}</div>`;
  const cam = $('#cam');
  if (cam && state !== 'idle') {
    cam.classList.remove('flash-ok', 'flash-bad');
    cam.classList.add(state === 'ok' ? 'flash-ok' : 'flash-bad');
    setTimeout(() => cam.classList.remove('flash-ok', 'flash-bad'), 700);
  }
  clearTimeout(resetTimer);
  if (state !== 'idle') resetTimer = setTimeout(() => showResult('idle', 'جاهز للمسح', 'قرّب بطاقة الطالب من الكاميرا'), 4000);
}
async function onScan(text) {
  const now = Date.now();
  if (now - (cooldown.get(text) || 0) < 3500) return;
  cooldown.set(text, now);
  if (!DB.settings.activeSid) return;
  const p = await parsePayload(text, DB.secret);
  if (p.status === 'old') { beep('bad'); return showResult('bad', 'بطاقة قديمة', 'هذه البطاقة من إصدار سابق، أعد توليد بطاقة الطالب'); }
  if (p.status !== 'ok') {
    beep('bad');
    return showResult('bad', 'رمز غير صالح', DB.secretSource === 'phone'
      ? 'هذا الرمز لم يُولَّد من هذا التطبيق. إذا كانت البطاقات من برنامج الحاسبة: استورد ملف «تصدير إلى الموبايل» من صفحة الطلاب'
      : 'هذا الرمز لم يُولَّد من برنامج الحضور');
  }
  const found = findStudent(p.name, p.stage);
  if (!found.length) { beep('bad'); return showResult('bad', p.name || 'بطاقة غير مسجلة', `هذا الطالب غير موجود في قائمة «${p.stage || 'بدون مرحلة'}» داخل التطبيق`); }
  register(found[0], 'QR', false);
}
function register(st, method, manual) {
  const s = session(DB.settings.activeSid);
  if (s.stage !== ALL && s.stage !== '' && st.stage !== s.stage) {
    const msg = `الطالب ليس ضمن قائمة هذه المحاضرة\nمرحلته: ${st.stage || 'غير محددة'} • المحاضرة: ${s.stage}`;
    if (!manual) { beep('bad'); showResult('dup', st.name, msg + '\n(يمكن تسجيله يدوياً إذا كان ذلك مقصوداً)'); return false; }
    if (!confirm(`${st.name}\n${msg}\n\nهل تريد تسجيل حضوره مع ذلك؟`)) return false;
  }
  const [res, t] = mark(s.id, st.code, method);
  const tt = X.arabicTime(hmsToDate(t));
  if (res === 'dup') { beep('dup'); showResult('dup', st.name, `حضوره مسجل مسبقاً الساعة ${tt}`); return true; }
  beep('ok');
  showResult('ok', st.name, `تم تسجيل الحضور ✓  الساعة ${tt}\n${st.stage || ''}`);
  updateLive();
  return true;
}
async function manualMark() {
  const inp = $('#manual'), text = inp.value.trim();
  if (!text) return;
  const s = session(DB.settings.activeSid);
  const pool = studentsOf(s.stage);
  const n = normName(text);
  let hits = pool.filter(x => normName(x.name) === n);
  if (!hits.length) hits = pool.filter(x => normName(x.name).includes(n));
  if (!hits.length) hits = DB.students.filter(x => normName(x.name).includes(n));
  if (!hits.length) {
    const stg = s.stage !== ALL ? s.stage : '';
    if (confirm(`لا يوجد طالب باسم «${text}».\n\nهل هو طالب جديد أو منقول؟ اضغط «موافق» لإضافته${stg ? ` إلى قائمة «${stg}»` : ''} وتسجيل حضوره.`)) {
      const st = await addStudentDialog(text, stg);
      if (st && register(st, 'يدوي', true)) inp.value = '';
    }
    return;
  }
  if (hits.length > 1) return toast(`يوجد ${hits.length} طلاب يطابقون «${text}»: اكتب الاسم بشكل أكمل`, 'bad');
  if (register(hits[0], 'يدوي', true)) inp.value = '';
}
async function endSession() {
  const s = session(DB.settings.activeSid);
  if (!s) return;
  await SCAN.stop();
  keepAwake(false);
  const present = attendanceOf(s.id).length, total = expected(s.stage);
  DB.settings.activeSid = null;
  save();
  render();
  const node = el(`<div><h3>تم إنهاء المحاضرة ✓</h3>
    <div class="stats"><div class="stat"><b style="color:#059669">${present}</b><span>الحاضرون</span></div>
    <div class="stat"><b style="color:#B91C1C">${Math.max(total - present, 0)}</b><span>الغائبون</span></div>
    <div class="stat"><b style="color:#0891B2">${total ? Math.round(present / total * 100) : 0}%</b><span>النسبة</span></div></div>
    <div class="muted">ملف الإكسل يشمل كل محاضرات «${esc(s.course)}» لقائمة «${esc(s.stage)}».</div>
    <div class="btns" style="margin-top:12px"><button class="btn green" data-a="dl">⬇ تنزيل الإكسل</button><button class="btn" data-a="sh">📤 مشاركة</button></div>
    <button class="btn ghost block" data-a="x">إغلاق</button></div>`);
  node.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'dl') exportReport(s, false);
    if (a === 'sh') exportReport(s, true);
    if (a === 'x') closeSheet();
  });
  openSheet(node);
}

/* ------------------------------------------------------------ reports */
async function reportBlob(s) {
  const sheets = X.courseReportSheets({ course: s.course, stage: s.stage, sessions: DB.sessions, students: DB.students,
    attendance: DB.attendance, copyright: COPYRIGHT });
  return X.writeWorkbook(sheets, window.JSZip);
}
async function exportReport(s, viaShare) {
  try {
    const blob = await reportBlob(s);
    const name = `حضور - ${safeName(s.course)}${s.stage && s.stage !== ALL ? ' - ' + safeName(s.stage) : ''}.xlsx`;
    if (viaShare) await share(blob, name, `حضور ${s.course}`); else { download(blob, name); toast('تم تنزيل ملف الإكسل'); }
  } catch (e) { toast('تعذّر إنشاء ملف الإكسل: ' + e.message, 'bad'); }
}
function renderRecords(m) {
  const list = DB.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const card = el(`<div class="card"><h2>📊 المحاضرات المسجلة (${list.length})</h2><div class="list"></div></div>`);
  const L = $('.list', card);
  if (!list.length) L.innerHTML = '<div class="empty">لا توجد محاضرات بعد</div>';
  list.forEach(s => {
    const d = X.parseISO(s.date), n = DB.attendance.filter(a => a.session_id === s.id).length, tot = expected(s.stage);
    const it = el(`<div class="item tap"><div class="grow"><div class="t">${esc(s.course)} <span class="pill">${esc(s.stage)}</span></div>
      <div class="s">${esc(X.AR_DAYS[X.pyWeekday(d)])} ${esc(s.date)} • البدء ${esc(s.started)}</div></div>
      <div style="text-align:center"><b style="font-size:18px;color:#059669">${n}</b><div class="s">من ${tot}</div></div></div>`);
    it.onclick = () => sessionSheet(s);
    L.appendChild(it);
  });
  m.appendChild(card);
}
function sessionSheet(s) {
  const rows = attendanceOf(s.id).sort((a, b) => a.time.localeCompare(b.time));
  const node = el(`<div><h3>${esc(s.course)} — ${esc(s.stage)}</h3><div class="muted">${esc(X.arabicDate(X.parseISO(s.date)))} • الحاضرون ${rows.length} من ${expected(s.stage)}</div>
    <div class="btns" style="margin:12px 0"><button class="btn green" data-a="dl">⬇ تنزيل تقرير الإكسل</button><button class="btn" data-a="sh">📤 مشاركة</button></div>
    <div class="list">${rows.map(a => `<div class="item"><div class="grow"><div class="t">${esc(a.name)}</div></div>
      <div class="s">${esc(a.time.slice(0, 5))}${a.method !== 'QR' ? ' • يدوي' : ''}</div></div>`).join('') || '<div class="empty">لا يوجد حضور</div>'}</div>
    <div class="btns" style="margin-top:12px">${DB.settings.activeSid === s.id ? '' : '<button class="btn ghost" data-a="go">▶ متابعة التسجيل فيها</button>'}
    <button class="btn rghost" data-a="del">🗑 حذف المحاضرة</button></div></div>`);
  node.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'dl') exportReport(s, false);
    if (a === 'sh') exportReport(s, true);
    if (a === 'go') { DB.settings.activeSid = s.id; save(); closeSheet(); switchTab('att'); }
    if (a === 'del' && confirm(`حذف محاضرة ${s.course} بتاريخ ${s.date} مع سجل حضورها؟`)) {
      deleteSession(s.id); closeSheet(); render(); toast('تم حذف المحاضرة');
    }
  });
  openSheet(node);
}

/* ------------------------------------------------------------ students page */
const stuFilter = { stage: ALL, q: '' };
function renderStudents(m) {
  const sts = stages();
  if (stuFilter.stage !== ALL && !sts.includes(stuFilter.stage)) stuFilter.stage = ALL;
  const top = el(`<div class="card"><div class="btns">
      <button class="btn green" data-a="add">➕ إضافة طالب</button>
      <button class="btn" data-a="desk">💻 استيراد من برنامج الحاسبة</button>
      <button class="btn" data-a="xls">⬆ استيراد ملف إكسل</button></div>
    <div class="btns" style="margin-top:8px">
      <button class="btn ghost" data-a="zip">🗂 تنزيل بطاقات القائمة</button>
      <button class="btn ghost" data-a="list">⬇ تصدير القائمة إكسل</button>
      <button class="btn rghost" data-a="delall">🗑 حذف القائمة</button></div></div>`);
  top.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'add') addStudentDialog('', stuFilter.stage !== ALL ? stuFilter.stage : '').then(st => st && showCard(st));
    if (a === 'desk') importDesktop();
    if (a === 'xls') importExcel();
    if (a === 'zip') zipCards();
    if (a === 'list') exportList();
    if (a === 'delall') deleteShown();
  });
  m.appendChild(top);
  m.appendChild(el(`<div class="card"><div class="grid2">
      <input class="in" id="q" placeholder="🔍 بحث بالاسم" value="${esc(stuFilter.q)}">
      <select class="in" id="fst">${[ALL].concat(sts).map(s => `<option ${s === stuFilter.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="muted" id="cnt" style="margin:10px 2px 4px"></div><div class="list" id="slist"></div>
    <div class="muted" style="margin-top:8px">اضغط على أي طالب لعرض بطاقته ومشاركتها أو حذفه.</div></div>`));
  let t;
  $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { stuFilter.q = e.target.value; fillStudents(); }, 200); });
  $('#fst').addEventListener('change', e => { stuFilter.stage = e.target.value; fillStudents(); });
  fillStudents();
}
const shownStudents = () => studentsOf(stuFilter.stage).filter(s => !stuFilter.q || normName(s.name).includes(normName(stuFilter.q)));
function fillStudents() {
  const L = $('#slist');
  if (!L) return;
  const rows = shownStudents();
  $('#cnt').textContent = `المعروض ${rows.length} من ${DB.students.length} طالب`;
  L.innerHTML = rows.length ? '' : '<div class="empty">لا يوجد طلاب</div>';
  const frag = document.createDocumentFragment();
  rows.forEach(s => {
    const it = el(`<div class="item tap"><div class="grow"><div class="t">${esc(s.name)}</div>
      <div class="s">${esc([s.department, s.grp && 'شعبة ' + s.grp].filter(Boolean).join(' • '))}</div></div><span class="pill">${esc(s.stage || '—')}</span></div>`);
    it.onclick = () => showCard(s);
    frag.appendChild(it);
  });
  L.appendChild(frag);
}
function addStudentDialog(name, stage) {
  return new Promise(resolve => {
    const sts = stages();
    const depts = stage ? DB.students.filter(s => s.stage === stage && s.department).map(s => s.department) : [];
    const count = v => depts.filter(x => x === v).length;
    const dept = depts.length ? depts.slice().sort((a, b) => count(b) - count(a))[0] : '';
    const node = el(`<div><h3>➕ إضافة طالب جديد أو منقول</h3>
      <label class="f">الاسم الكامل *</label><input class="in" id="aName" value="${esc(name || '')}">
      <label class="f">المرحلة *</label><input class="in" id="aStage" list="aSt" value="${esc(stage || (sts.length === 1 ? sts[0] : ''))}">
      <datalist id="aSt">${sts.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <div class="grid2"><div><label class="f">القسم</label><input class="in" id="aDept" value="${esc(dept)}"></div>
      <div><label class="f">الشعبة</label><input class="in" id="aGrp"></div></div>
      <label class="f">تاريخ الالتحاق</label><input class="in" id="aJoin" type="date" value="${todayISO()}">
      <div class="muted">المحاضرات قبل هذا التاريخ لا تُحسب غياباً عليه (امسحه لحسابها)</div>
      <div class="btns" style="margin-top:12px"><button class="btn green" data-a="ok">حفظ وإصدار البطاقة</button><button class="btn rghost" data-a="no">إلغاء</button></div></div>`);
    node.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'no') { closeSheet(); resolve(null); }
      if (a !== 'ok') return;
      const nm = $('#aName').value.trim(), stg = $('#aStage').value.trim();
      if (nm.length < 3) return toast('اكتب اسم الطالب', 'bad');
      if (!stg || stg === ALL) return toast('اكتب المرحلة', 'bad');
      if (!sts.includes(stg) && !confirm(`المرحلة «${stg}» غير موجودة، سيتم إنشاء قائمة جديدة بهذا الاسم. متابعة؟`)) return;
      const [st, existed] = addStudent(nm, stg, $('#aDept').value, $('#aGrp').value, $('#aJoin').value);
      closeSheet();
      toast(existed ? `«${st.name}» موجود مسبقاً في «${st.stage}»` : `✓ تمت إضافة «${st.name}»`);
      fillStudents();
      resolve(st);
    });
    openSheet(node);
    setTimeout(() => $('#aName') && $('#aName').focus(), 250);
  });
}
async function zipCards() {
  const rows = shownStudents();
  if (!rows.length) return toast('لا يوجد طلاب', 'bad');
  if (!confirm(`سيتم تجهيز ${rows.length} بطاقة في ملف مضغوط (ZIP). متابعة؟`)) return;
  const zip = new JSZip();
  for (let i = 0; i < rows.length; i++) {
    if (i % 20 === 0) toast(`جارٍ تجهيز البطاقات ${i + 1} / ${rows.length}`);
    zip.file(`${safeName(rows[i].name)}.png`, await canvasBlob(await cardCanvas(rows[i])));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const label = stuFilter.stage !== ALL ? stuFilter.stage : 'كل الطلاب';
  share(blob, `بطاقات الحضور - ${safeName(label)}.zip`, 'بطاقات الحضور');
}
async function exportList() {
  const blob = await X.writeWorkbook(X.studentListSheets(shownStudents()), window.JSZip);
  share(blob, 'قائمة الطلاب.xlsx', 'قائمة الطلاب');
}
function deleteShown() {
  const rows = shownStudents();
  if (!rows.length) return;
  const label = stuFilter.stage !== ALL ? `قائمة «${stuFilter.stage}»` : 'جميع الطلاب الظاهرين';
  if (!confirm(`حذف ${label} (${rows.length} طالب)؟\n(سجلات الحضور السابقة تبقى محفوظة)`)) return;
  deleteStudents(rows.map(s => s.code));
  render();
  toast('تم الحذف');
}

/* ---- import from the desktop program (students + card key) */
async function importDesktopData(d) {
  if (!d || d.type !== 'qr-attendance-mobile' || !d.secret || !Array.isArray(d.students))
    return toast('هذا ليس ملف «تصدير إلى الموبايل» من برنامج الحاسبة', 'bad');
  if (DB.secret !== d.secret && DB.secretSource === 'phone' && DB.students.length &&
    !confirm('البطاقات التي أصدرتها من الموبايل سابقاً ستتوقف عن العمل، وستعمل بطاقات برنامج الحاسبة بدلاً منها.\n\nمتابعة؟')) return;
  DB.secret = d.secret;
  DB.secretSource = 'desktop';
  const r = upsertRows(d.students.map(s => ({ name: s.name, stage: s.stage || '', department: s.department || '', grp: s.grp || '', joined: s.joined || '' })));
  save();
  render();
  alert(`تم الاستيراد من برنامج الحاسبة ✓\n\n• طلاب جدد: ${r.added}\n• محدَّثون: ${r.updated}\n• القوائم: ${stages().join('، ')}\n\nبطاقات برنامج الحاسبة المطبوعة تعمل الآن على الموبايل.`);
}
async function importDesktop() {
  const f = await pickFile('.json,.qra,application/json');
  if (!f) return;
  let d;
  try { d = JSON.parse(await f.text()); } catch (e) { return toast('الملف غير صالح', 'bad'); }
  importDesktopData(d);
}

/* ---- import an Excel file directly on the phone */
const FIELD_KEYS = {
  code: ['الرقم الجامعي', 'رقم الطالب', 'الرقم الامتحاني', 'الكود', 'كود', 'الرمز', 'الرقم', 'student id', 'id', 'code'],
  name: ['الاسم الرباعي', 'الاسم الثلاثي', 'اسم الطالب', 'الاسم', 'اسم', 'student name', 'full name', 'name'],
  department: ['القسم', 'قسم', 'department', 'dept'],
  stage: ['المرحلة', 'مرحلة', 'الصف', 'stage', 'level', 'year'],
  grp: ['الشعبة', 'شعبة', 'المجموعة', 'group', 'section'],
};
const normH = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
function matchHeader(row) {
  const cells = row.map(normH), map = {}, used = new Set();
  for (const exact of [true, false]) for (const [f, keys] of Object.entries(FIELD_KEYS)) {
    if (f in map) continue;
    for (const k of keys) {
      const i = cells.findIndex((c, idx) => !used.has(idx) && c && (exact ? c === k : c.includes(k)));
      if (i >= 0) { map[f] = i; used.add(i); break; }
    }
  }
  return map;
}
async function readXlsxRows(file) {
  const zip = await JSZip.loadAsync(file);
  const P = new DOMParser();
  const xml = async p => { const f = zip.file(p); return f ? P.parseFromString(await f.async('string'), 'application/xml') : null; };
  const wb = await xml('xl/workbook.xml');
  if (!wb) throw new Error('ليس ملف xlsx');
  const sheet = wb.getElementsByTagName('sheet')[0];
  const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = await xml('xl/_rels/workbook.xml.rels');
  let target = 'worksheets/sheet1.xml';
  for (const r of rels.getElementsByTagName('Relationship')) if (r.getAttribute('Id') === rid) target = r.getAttribute('Target');
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const ssDoc = await xml('xl/sharedStrings.xml');
  const ss = ssDoc ? [...ssDoc.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sh = await xml(path);
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const rows = [];
  for (const row of sh.getElementsByTagName('row')) {
    const arr = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0];
      let v = '';
      if (t === 's') v = vEl ? (ss[+vEl.textContent] || '') : '';
      else if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (vEl) v = vEl.textContent.replace(/\.0+$/, '');
      arr[colIdx(c.getAttribute('r') || 'A1')] = v;
    }
    const clean = Array.from(arr, v => (v == null ? '' : String(v).trim()));
    if (clean.some(Boolean)) rows.push(clean);
  }
  return rows;
}
async function importExcelRows(all, fileName) {
  if (!all.length) return toast('الملف فارغ', 'bad');
  let hi = -1, map = {};
  all.slice(0, 15).forEach((r, i) => { const mm = matchHeader(r); if ('name' in mm && Object.keys(mm).length > Object.keys(map).length) { hi = i; map = mm; } });
  let data = all;
  if (hi < 0) map = /^\d+$/.test(all[0][0] || '') && all[0].length > 1 ? { name: 1 } : { name: 0 };
  else data = all.slice(hi + 1);
  const get = (r, k) => (k in map && map[k] < r.length ? String(r[map[k]] || '').trim() : '');
  const rows = data.map(r => ({ name: get(r, 'name'), department: get(r, 'department'), stage: get(r, 'stage'), grp: get(r, 'grp') }))
    .filter(r => r.name);
  if (!rows.length) return toast('لم يتم العثور على أسماء في الملف', 'bad');
  const fileStages = [...new Set(rows.map(r => r.stage).filter(Boolean))];
  const missing = rows.some(r => !r.stage);
  if (missing || fileStages.length <= 1) {
    const def = fileStages[0] || String(fileName || '').replace(/\.[^.]+$/, '');
    const st = await askText(`استيراد ${rows.length} طالب`, 'لمن هذه القائمة؟ اكتب اسم المرحلة أو الشعبة (كل قائمة باسم مختلف تبقى منفصلة)', def, stages());
    if (!st) return;
    if (st === ALL) return toast('اختر اسماً غير «الكل»', 'bad');
    rows.forEach(r => { if (!r.stage || fileStages.length <= 1) r.stage = st; });
  }
  const res = upsertRows(rows);
  render();
  let msg = `تم استيراد ${rows.length} طالب ✓\n\n• جدد: ${res.added}\n• محدَّثون: ${res.updated}`;
  if (res.renamed.length) msg += `\n• أسماء متطابقة أُضيف لها رقم للتمييز: ${res.renamed.length}`;
  alert(msg);
}
async function importExcel() {
  const f = await pickFile('.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!f) return;
  let all;
  try { all = await readXlsxRows(f); } catch (e) { return toast('تعذّرت قراءة الملف. يجب أن يكون بصيغة xlsx', 'bad'); }
  importExcelRows(all, f.name);
}

/* ------------------------------------------------------------ more page */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function renderMore(m) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const contact = AUTHOR.email
    ? `<a id="mail" style="color:#0891B2;font-weight:800;text-decoration:none">✉ ${esc(AUTHOR.email)}</a>` : '';
  m.appendChild(el(`<div class="card about"><div class="logo">QR</div>
    <h2 style="margin:0">نظام الحضور الذكي</h2><div class="muted">نسخة الموبايل ${APP_VERSION}</div>
    <div class="muted" style="margin-top:12px">تصميم وبرمجة</div><div style="font-size:20px;font-weight:900">${esc(AUTHOR.name)}</div>
    ${contact}
    <div class="copy"><b>${esc(COPYRIGHT)}</b>يُمنع نسخ هذا البرنامج أو توزيعه أو بيعه أو تعديله أو نسبه لغير مؤلفه دون إذن خطي مسبق من المؤلف.</div></div>`));
  if (AUTHOR.email) $('#mail').href = 'mailto:' + AUTHOR.email;
  if (!standalone) {
    const inst = el(`<div class="card"><h2>📲 تثبيت التطبيق على الشاشة الرئيسية</h2><div class="muted" style="font-size:14px;line-height:1.8">
      ${ios ? 'في Safari: اضغط زر المشاركة <b>⬆︎</b> أسفل الشاشة ← <b>إضافة إلى الشاشة الرئيسية</b>.'
        : 'في Chrome: اضغط القائمة <b>⋮</b> ← <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.'}</div>
      ${installEvt ? '<button class="btn green block" id="inst">تثبيت الآن</button>' : ''}</div>`);
    m.appendChild(inst);
    if (installEvt) $('#inst').onclick = () => { installEvt.prompt(); installEvt = null; };
  }
  const data = el(`<div class="card"><h2>💾 البيانات والنسخ الاحتياطي</h2>
    <div class="muted" style="line-height:1.9">الطلاب: <b>${DB.students.length}</b> • القوائم: <b>${stages().length}</b> • المحاضرات: <b>${DB.sessions.length}</b><br>
    مفتاح البطاقات: <b>${DB.secretSource === 'desktop' ? 'من برنامج الحاسبة ✓ (البطاقات المطبوعة تعمل)' : 'خاص بهذا الموبايل'}</b><br>
    البيانات محفوظة داخل متصفح هذا الموبايل فقط. خذ نسخة احتياطية بشكل دوري.</div>
    <div class="btns" style="margin-top:10px"><button class="btn" data-a="bk">⬇ نسخة احتياطية</button><button class="btn ghost" data-a="rs">⬆ استعادة نسخة</button></div>
    <button class="btn rghost block" data-a="wipe">🗑 حذف جميع البيانات</button></div>`);
  data.addEventListener('click', async e => {
    const a = e.target.dataset.a;
    if (a === 'bk') {
      const blob = new Blob([JSON.stringify({ type: 'qr-attendance-mobile-backup', version: 1, date: new Date().toISOString(), db: DB })], { type: 'application/json' });
      share(blob, `نسخة احتياطية - الحضور ${todayISO()}.json`, 'نسخة احتياطية');
    }
    if (a === 'rs') {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (d.type !== 'qr-attendance-mobile-backup' || !d.db) throw new Error();
        if (!confirm('سيتم استبدال كل بيانات التطبيق الحالية بالنسخة الاحتياطية. متابعة؟')) return;
        DB = Object.assign(blank(), d.db); save(); render(); toast('تمت الاستعادة ✓');
      } catch (err) { toast('ملف النسخة الاحتياطية غير صالح', 'bad'); }
    }
    if (a === 'wipe' && confirm('حذف جميع الطلاب والمحاضرات وسجلات الحضور من هذا الموبايل؟') &&
      confirm('تأكيد أخير: لا يمكن التراجع. هل نزّلت نسخة احتياطية؟')) {
      DB = blank(); save(); render(); toast('تم حذف جميع البيانات');
    }
  });
  m.appendChild(data);
  m.appendChild(el(`<div class="card"><h2>❓ طريقة الاستخدام</h2><div class="muted" style="font-size:13.5px;line-height:1.9">
    ١. من برنامج الحاسبة: «الطلاب والأكواد» ← <b>📱 تصدير إلى الموبايل</b>، وأرسل الملف لموبايلك.<br>
    ٢. هنا: «الطلاب» ← <b>استيراد من برنامج الحاسبة</b>.<br>
    ٣. «الحضور» ← اكتب المادة واختر المرحلة ← <b>بدء المحاضرة</b>، والطالب يُظهر بطاقته أمام الكاميرا.<br>
    ٤. بعد المحاضرة: <b>تنزيل الإكسل</b> أو <b>مشاركة</b> لإرساله بالواتساب أو البريد.<br>
    • التطبيق يعمل بدون إنترنت بعد أول فتح.</div></div>`));
}

/* ------------------------------------------------------------ shell */
let TAB = 'att';
function switchTab(t) {
  TAB = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
function render() {
  if (TAB !== 'att' || !DB.settings.activeSid) { SCAN.stop(); keepAwake(false); }
  const m = $('#main');
  m.innerHTML = '';
  ({ att: renderAttendance, stu: renderStudents, rec: renderRecords, more: renderMore })[TAB](m);
}
function tick() {
  const d = new Date();
  $('#hdate').textContent = X.arabicDate(d);
  $('#hclock').textContent = X.arabicTime(d, true);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && TAB === 'att' && DB.settings.activeSid && !SCAN.stream) startCamera();
  if (document.visibilityState === 'hidden') SCAN.stop();
});
tick();
setInterval(tick, 1000);
render();

/* ------------------------------------------------------------ offline / updates */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const t = $('#toast');
          t.innerHTML = 'يتوفر تحديث جديد للتطبيق — <u>اضغط هنا للتحديث</u>';
          t.className = ''; t.style.display = 'block';
          clearTimeout(toastTimer);
          t.onclick = () => { nw.postMessage('skip'); setTimeout(() => location.reload(), 600); };
        }
      });
    });
  }).catch(() => {});
  // reload only when an UPDATE replaced an existing version (never on the very first visit)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || DB.settings.activeSid) return;   // never interrupt a running lecture
    reloaded = true;
    location.reload();
  });
}
// hooks for automated tests only
window.__qra = { onScan, DB: () => DB, cardCanvas, render, switchTab, importDesktopData, importExcelRows, reportBlob, register, findStudent };
