/* Styled .xlsx writer (needs JSZip) + attendance report identical to the desktop program. */
(function (root) {
  'use strict';
  const ALL = 'الكل';
  const AR_DAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول',
    'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const pyWeekday = d => (d.getDay() + 6) % 7;                       // Monday = 0 like Python
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const arabicDate = d => `${AR_DAYS[pyWeekday(d)]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const arabicTime = (d, sec) => {
    const h = d.getHours() % 12 || 12, mm = String(d.getMinutes()).padStart(2, '0');
    const ss = sec ? ':' + String(d.getSeconds()).padStart(2, '0') : '';
    return `${h}:${mm}${ss} ${d.getHours() < 12 ? 'ص' : 'م'}`;
  };

  // style ids (see STYLES below)
  const S = { header: 1, ok: 2, no: 3, title: 4, sub: 5, cell: 6, cellText: 7, pct: 8, pctRed: 9, pctPlain: 10 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF065F46"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF991B1B"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF312E81"/><name val="Calibri"/></font>
<font><i/><sz val="11"/><color rgb="FF64748B"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4338CA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="9" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function col(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function sheetXml(sh) {
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    out.push('<sheetViews><sheetView rightToLeft="1" workbookViewId="0">');
    if (sh.freeze) {
      const [c, r] = sh.freeze;       // first unfrozen column / row (1-based)
      const attrs = [];
      if (c > 1) attrs.push(`xSplit="${c - 1}"`);
      if (r > 1) attrs.push(`ySplit="${r - 1}"`);
      const pane = c > 1 && r > 1 ? 'bottomRight' : (r > 1 ? 'bottomLeft' : 'topRight');
      out.push(`<pane ${attrs.join(' ')} topLeftCell="${col(c)}${r}" activePane="${pane}" state="frozen"/>`);
    }
    out.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
    if (sh.cols && sh.cols.length) {
      out.push('<cols>');
      sh.cols.forEach((w, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
      out.push('</cols>');
    }
    out.push('<sheetData>');
    sh.rows.forEach((row, ri) => {
      const r = ri + 1;
      const ht = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      out.push(`<row r="${r}"${ht}>`);
      row.cells.forEach((c, ci) => {
        if (c == null) return;
        const cell = typeof c === 'object' ? c : { v: c };
        const ref = col(ci + 1) + r, st = cell.s ? ` s="${cell.s}"` : '';
        if (cell.v === null || cell.v === undefined || cell.v === '') { if (cell.s) out.push(`<c r="${ref}"${st}/>`); }
        else if (typeof cell.v === 'number') out.push(`<c r="${ref}"${st}><v>${cell.v}</v></c>`);
        else out.push(`<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`);
      });
      out.push('</row>');
    });
    out.push('</sheetData>');
    if (sh.merges && sh.merges.length) {
      out.push(`<mergeCells count="${sh.merges.length}">`);
      sh.merges.forEach(m => out.push(`<mergeCell ref="${m}"/>`));
      out.push('</mergeCells>');
    }
    out.push('</worksheet>');
    return out.join('');
  }

  async function writeWorkbook(sheets, JSZipLib) {
    const Z = JSZipLib || root.JSZip;
    const zip = new Z();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', STYLES);
    sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
    return zip.generateAsync({ type: root.Blob && typeof window !== 'undefined' ? 'blob' : 'uint8array',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  /* data = { course, stage, sessions:[{id,date,started,stage}], students:[{code,name,department,stage,joined}],
              attendance:[{session_id, code, time, method}], copyright } */
  function courseReportSheets(data) {
    const stage = data.stage || ALL;
    const sess = data.sessions.filter(s => s.course === data.course && ((s.stage || ALL) === stage))
      .sort((a, b) => (a.date + String(a.id).padStart(9, '0')).localeCompare(b.date + String(b.id).padStart(9, '0')));
    const sids = new Set(sess.map(s => s.id));
    const att = new Map();
    data.attendance.filter(a => sids.has(a.session_id)).forEach(a => att.set(a.session_id + '|' + a.code, a));
    const byName = (a, b) => (a.stage || '').localeCompare(b.stage || '', 'ar') || a.name.localeCompare(b.name, 'ar');
    let students = stage === ALL ? data.students.slice() : data.students.filter(s => s.stage === stage);
    students.sort(byName);
    const known = new Set(students.map(s => s.code));
    for (const k of att.keys()) {
      const code = k.split('|').slice(1).join('|');
      if (!known.has(code)) {
        students.push(data.students.find(s => s.code === code) || { code, name: '(غير مسجل)', department: '', stage: '' });
        known.add(code);
      }
    }
    const now = new Date();
    const n = sess.length;
    const rows = [];
    rows.push({ height: 30, cells: [{ v: `سجل حضور مادة: ${data.course}` + (stage === ALL ? '' : `   —   ${stage}`), s: S.title }] });
    rows.push({ cells: [{ v: `تاريخ التصدير: ${arabicDate(now)} - ${arabicTime(now)}   |   نظام الحضور الذكي  ${data.copyright || ''}`, s: S.sub }] });
    const sameDay = {};
    sess.forEach(s => { sameDay[s.date] = (sameDay[s.date] || 0) + 1; });
    const heads = ['ت', 'الاسم', 'القسم', 'المرحلة'].concat(sess.map(s => {
      let l = s.date;
      if (sameDay[s.date] > 1) l += `\n(${s.started})`;
      if (s.stage && s.stage !== ALL) l += `\n${s.stage}`;
      return l;
    }), ['عدد الحضور', 'عدد الغياب', 'نسبة الحضور']);
    rows.push({ height: 48, cells: heads.map(h => ({ v: h, s: S.header })) });
    students.forEach((st, i) => {
      const cells = [{ v: i + 1, s: S.cell }, { v: st.name, s: S.cellText }, { v: st.department || '', s: S.cellText },
        { v: st.stage || '', s: S.cell }];
      let present = 0, total = 0;
      sess.forEach(s => {
        const a = att.get(s.id + '|' + st.code);
        let applies = (s.stage === '' || s.stage === ALL) || s.stage === st.stage || !!a;
        if (st.joined && s.date < st.joined && !a) applies = false;
        if (!applies) cells.push({ v: '—', s: S.cell });
        else if (a) { cells.push({ v: `✓ ${a.time.slice(0, 5)}`, s: S.ok }); present++; total++; }
        else { cells.push({ v: '✗ غائب', s: S.no }); total++; }
      });
      const pct = total ? present / total : 0;
      cells.push({ v: present, s: S.cell }, { v: total - present, s: S.cell },
        { v: pct, s: total && pct < 0.75 ? S.pctRed : S.pct });
      rows.push({ cells });
    });
    const matrix = {
      name: 'مصفوفة الحضور', rows, freeze: [5, 4],
      cols: [6, 32, 24, 12].concat(sess.map(() => 13), [11, 11, 12]),
      merges: [`A1:${col(Math.min(8, 4 + n + 3))}1`],
    };

    const lrows = [{ cells: ['التاريخ', 'اليوم', 'المادة', 'المرحلة', 'الاسم', 'وقت الحضور', 'الطريقة'].map(h => ({ v: h, s: S.header })), height: 34 }];
    const nameOf = code => (data.students.find(s => s.code === code) || { name: '(غير مسجل)' }).name;
    sess.forEach(s => {
      const d = parseISO(s.date);
      data.attendance.filter(a => a.session_id === s.id).sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
        lrows.push({ cells: [s.date, AR_DAYS[pyWeekday(d)], data.course, s.stage, nameOf(a.code), a.time,
          a.method !== 'QR' ? 'يدوي' : 'QR'] });
      });
    });
    const log = { name: 'السجل التفصيلي', rows: lrows, freeze: [1, 2], cols: [13, 11, 22, 12, 34, 12, 9] };

    const expected = st => st && st !== ALL ? data.students.filter(x => x.stage === st).length : data.students.length;
    const srows = [{ cells: ['التاريخ', 'اليوم', 'وقت البدء', 'المرحلة', 'الحاضرون', 'المتوقع', 'النسبة'].map(h => ({ v: h, s: S.header })), height: 34 }];
    sess.forEach(s => {
      const d = parseISO(s.date);
      const present = data.attendance.filter(a => a.session_id === s.id).length, exp = expected(s.stage);
      srows.push({ cells: [s.date, AR_DAYS[pyWeekday(d)], s.started, s.stage || ALL, present, exp,
        { v: exp ? present / exp : 0, s: S.pctPlain }] });
    });
    const summary = { name: 'ملخص المحاضرات', rows: srows, cols: [13, 11, 11, 14, 11, 11, 10] };
    return [matrix, log, summary];
  }

  function studentListSheets(students) {
    const rows = [{ height: 34, cells: ['ت', 'الاسم', 'القسم', 'المرحلة', 'الشعبة'].map(h => ({ v: h, s: S.header })) }];
    students.forEach((s, i) => rows.push({ cells: [i + 1, s.name, s.department || '', s.stage || '', s.grp || ''] }));
    return [{ name: 'الطلاب', rows, freeze: [1, 2], cols: [6, 34, 30, 14, 10] }];
  }

  const api = { writeWorkbook, courseReportSheets, studentListSheets, arabicDate, arabicTime, AR_DAYS, AR_MONTHS, ALL, pyWeekday, parseISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XLSX_AR = api;
})(typeof window !== 'undefined' ? window : globalThis);
