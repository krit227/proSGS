// content.js — SGS Helper (v2.5)
// - กรอกตามคอลัมน์: 1→S1, 2→S2, 3→S3, สอบกลาง→Midterm, 10→S10, 11→S11, 12→S12, สอบปลาย→Final
// - ปุ่มบนยาว: วางจากคลิปบอร์ด / แถวล่าง 2 ปุ่ม: กรอกเฉพาะกลางภาค, กรอกเฉพาะปลายภาค
// - โซนล้าง: ล้างเฉพาะกลางภาค / ล้างเฉพาะปลายภาค (ตัดปุ่มทุกช่อง)
// - Parser รองรับหัวตารางหลายแถว (ตรวจคำว่า “กลางภาค/ปลายภาค/สอบ/1/2/3/10/11/12”)
// - ข้ามค่าว่างและ 0 ตามตั้งค่า

(() => {
  'use strict';
  if (window.__SGS_HELPER_INJECTED__) return;
  window.__SGS_HELPER_INJECTED__ = true;

  if (typeof window.CSS === 'undefined') window.CSS = {};
  if (!CSS.escape) CSS.escape = s => String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');

  // ===== CONFIG =====
  const WEB_ID_COL_INDEX = 3;
  const FIELD_SUFFIX = {
    s1:'$S1',  s2:'$S2',  s3:'$S3',
    midterm:'$Midterm',
    s10:'$S10', s11:'$S11', s12:'$S12',
    final:'$Final'
  };

  const REMOVE_LEADING_ZEROES = true;
  const PAD_ID_TO_LEN = 0;

  // เพดานคะแนน (จะพยายามอ่านจากหัวตารางด้วย หากไม่พบใช้ค่านี้)
  const CLAMP_MAX = { s1:30, s2:30, s3:30, mid:20, s10:30, s11:30, s12:30, fin:20 };

  const SKIP_BLANK = true;
  const SKIP_ZERO  = true;

  const ALLOW_HEADERLESS = true;

  const HIGHLIGHT = { matched: true, missing: true, cleared: true };

  // ===== ตัวอย่าง Google Sheets =====
  const SAMPLE_SHEET_ID = '1WJnLQyTDVsTCFbC5URTww-S4TSj5_hI0khqomKyyQQ8';
  const SHEET_VIEW_URL  = `https://docs.google.com/spreadsheets/d/${SAMPLE_SHEET_ID}/edit?usp=sharing`;
  const SHEET_XLSX_URL  = `https://docs.google.com/spreadsheets/d/${SAMPLE_SHEET_ID}/export?format=xlsx`;

  // ===== Helpers =====
  function normalizeId(id) {
    let s = (id ?? '').toString().trim().replace(/\s|-/g, '');
    if (REMOVE_LEADING_ZEROES) s = s.replace(/^0+/, '');
    if (/^\d+$/.test(s) && PAD_ID_TO_LEN > 0) s = s.padStart(PAD_ID_TO_LEN, '0');
    return s;
  }
  function normText(s){
    return (s??'').toString().trim().replace(/\s+/g,'').replace(/[(){}\[\]\-_/]/g,'').toLowerCase();
  }
  function looksLikeDataRow(row){
    const a = (row?.[0] ?? '').toString().trim();
    const digits = a.replace(/\D/g,'');
    return digits.length >= 4;
  }

  // ===== UI =====
  let panel, textarea, statusBox;
  function ensureUI(){
    if (document.getElementById('__sgs_helper_panel')) return;

    panel = document.createElement('div');
    panel.id = '__sgs_helper_panel';
    panel.style.cssText = `
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 440px; background: #fff; border: 1px solid #ddd; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.18); font-family: system-ui, sans-serif; color:#333;
    `;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eee;">
        <div style="font-weight:700;">📋 วางคะแนนจาก Excel → กรอกอัตโนมัติ</div>
        <button id="__sgs_toggle" style="padding:4px 8px;cursor:pointer;">ซ่อน</button>
      </div>
      <div style="padding:10px 12px;">
        <div style="font-size:13px;line-height:1.4;margin-bottom:6px;">
          คัดลอกพร้อมหัวตารางรูปแบบใหม่: <b>เลขประจำตัว</b>, บล็อก <b>กลางภาค (1/2/3/สอบ)</b>, บล็อก <b>ปลายภาค (10/11/12/สอบ)</b>
        </div>
        <textarea id="__sgs_text" rows="7" style="width:100%;box-sizing:border-box;font-size:12px;"></textarea>

        <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
          <button id="__sgs_read" style="width:100%;padding:10px;cursor:pointer;">วางจากคลิปบอร์ด</button>
          <div style="display:flex;gap:8px;">
            <button id="__sgs_mid"   style="flex:1;padding:10px;cursor:pointer;background:#2d7;color:#fff;border:none;">กรอกเฉพาะกลางภาค</button>
            <button id="__sgs_final" style="flex:1;padding:10px;cursor:pointer;background:#f39c12;color:#fff;border:none;">กรอกเฉพาะปลายภาค</button>
          </div>
        </div>

        <div style="margin-top:10px;border-top:1px dashed #eee;padding-top:10px;">
          <div style="font-size:13px;margin-bottom:6px;"><b>🧹 โซนล้างข้อมูล (ทุกแถวในหน้านี้)</b></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="__sgs_clear_mid"   style="flex:1 1 140px;padding:10px;cursor:pointer;background:#e74c3c;color:#fff;border:none;">ล้างเฉพาะกลางภาค</button>
            <button id="__sgs_clear_final" style="flex:1 1 140px;padding:10px;cursor:pointer;background:#d35400;color:#fff;border:none;">ล้างเฉพาะปลายภาค</button>
          </div>
          <div style="font-size:12px;color:#777;margin-top:4px;">* ล้างแล้วจะบันทึกอัตโนมัติทันที แนะนำตรวจสอบก่อนกด</div>
        </div>

        <div style="margin-top:10px;border-top:1px dashed #eee;padding-top:10px;">
          <div style="font-size:13px;margin-bottom:6px;"><b>📎 ตัวอย่างสำหรับคัดลอก</b></div>
          <div id="__sgs_examples" style="display:flex;flex-direction:column;gap:6px;font-size:13px;"></div>
        </div>

        <div id="__sgs_status" style="margin-top:10px;font-size:12px;color:#555;"></div>
      </div>
    `;
    document.body.appendChild(panel);

    textarea  = document.getElementById('__sgs_text');
    statusBox = document.getElementById('__sgs_status');

    const exBox = panel.querySelector('#__sgs_examples');
    if (exBox){
      exBox.innerHTML = `
        <a href="${SHEET_VIEW_URL}" target="_blank" rel="noopener" style="color:#1363df;">🔗 เปิดดูตัวอย่าง (Google Sheets)</a>
        <a href="${SHEET_XLSX_URL}" target="_blank" rel="noopener" style="color:#1363df;">⬇️ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)</a>
        <div style="color:#666;font-size:12px;">
          * คัดลอกพร้อมหัวตาราง: <b>เลขประจำตัว</b> + บล็อก <b>กลางภาค (1/2/3/สอบ)</b> และ <b>ปลายภาค (10/11/12/สอบ)</b>
        </div>
      `;
    }

    document.getElementById('__sgs_read').addEventListener('click', async ()=>{
      try{
        if (navigator.clipboard?.readText) {
          textarea.value = await navigator.clipboard.readText();
          flash('วางข้อมูลแล้ว • เลือกโหมด “กลางภาค/ปลายภาค”', 'ok');
        } else {
          flash('อ่านคลิปบอร์ดไม่ได้ ให้คลิกที่ช่องแล้วกด Ctrl+V', 'warn');
        }
      }catch{
        flash('อ่านคลิปบอร์ดไม่ได้ ให้คลิกที่ช่องแล้วกด Ctrl+V', 'warn');
      }
    });
    document.getElementById('__sgs_mid').addEventListener('click',   ()=>handleFill('mid'));
    document.getElementById('__sgs_final').addEventListener('click', ()=>handleFill('final'));

    // ปุ่มล้าง
    document.getElementById('__sgs_clear_mid').addEventListener('click',   ()=>handleClear('mid'));
    document.getElementById('__sgs_clear_final').addEventListener('click', ()=>handleClear('final'));

    document.getElementById('__sgs_toggle').addEventListener('click', (e)=>{
      const box = panel.querySelector('div:nth-child(2)');
      if (box.style.display === 'none'){ box.style.display = ''; e.target.textContent='ซ่อน'; }
      else { box.style.display = 'none'; e.target.textContent='แสดง'; }
    });
  }

  function flash(msg, type='info'){
    if (!statusBox) return;
    statusBox.textContent = msg;
    statusBox.style.color = (type==='ok') ? '#0a0' : (type==='warn') ? '#B36B00' : (type==='error') ? '#C00' : '#333';
  }

  // เปิดคอลัมน์ตามโหมด
  function enableColumns(mode){
    setTimeout(()=>{
      const need = {
        s1: (mode==='mid'), s2: (mode==='mid'), s3: (mode==='mid'), mid:(mode==='mid'),
        s10:(mode==='final'), s11:(mode==='final'), s12:(mode==='final'), fin:(mode==='final')
      };
      try{ if (need.s1  && typeof window.check==='function') window.check(true, 'S1'); }catch(e){}
      try{ if (need.s2  && typeof window.check==='function') window.check(true, 'S2'); }catch(e){}
      try{ if (need.s3  && typeof window.check==='function') window.check(true, 'S3'); }catch(e){}
      try{ if (need.mid && typeof window.check==='function') window.check(true, 'Midterm'); }catch(e){}
      try{ if (need.s10 && typeof window.check==='function') window.check(true, 'S10'); }catch(e){}
      try{ if (need.s11 && typeof window.check==='function') window.check(true, 'S11'); }catch(e){}
      try{ if (need.s12 && typeof window.check==='function') window.check(true, 'S12'); }catch(e){}
      try{ if (need.fin && typeof window.check==='function') window.check(true, 'Final'); }catch(e){}

      const ids = [];
      if (need.s1)  ids.push('ctl00_PageContent_Check1');
      if (need.s2)  ids.push('ctl00_PageContent_Check2');
      if (need.s3)  ids.push('ctl00_PageContent_Check3');
      if (need.mid) ids.push('ctl00_PageContent_CheckM');
      if (need.s10) ids.push('ctl00_PageContent_Check10');
      if (need.s11) ids.push('ctl00_PageContent_Check11');
      if (need.s12) ids.push('ctl00_PageContent_Check12');
      if (need.fin) ids.push('ctl00_PageContent_CheckF');
      ids.forEach(id=>{
        const cb = document.getElementById(id);
        if (cb && !cb.checked && !cb.disabled){ try{ cb.click(); }catch(e){} }
      });
    }, 400);
  }

  // ===== Paste ทั้งหน้า =====
  document.addEventListener('paste', (ev)=>{
    const t = ev.target;
    if (t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA') && t.id!=='__sgs_text') return;
    const txt = ev.clipboardData?.getData('text') || '';
    if (txt && txt.includes('\t')){
      ensureUI();
      textarea.value = txt;
      panel.querySelector('div:nth-child(2)').style.display='';
      flash('วางข้อมูลแล้ว • เลือกโหมด “กลางภาค/ปลายภาค”', 'ok');
      ev.preventDefault();
    }
  }, true);

  // ===== Parser: จับหัวตารางใหม่ =====
  function parseClipboardTable(raw){
    const lines = raw.split(/\r?\n/).filter(l=>l.trim()!=='');
    const rows  = lines.map(l=> l.split('\t').map(s=>(s??'').toString().trim()));
    if (rows.length < 1) throw new Error('ไม่มีข้อมูล');

    let dataStart = 0;
    for (let i=0;i<Math.min(rows.length,8);i++){
      if (looksLikeDataRow(rows[i])) { dataStart = i; break; }
    }
    const headerRows = rows.slice(0, dataStart);
    const dataRows   = rows.slice(dataStart);
    const maxCols = Math.max(...headerRows.map(r => r.length), 0);

    //const colHas = (c, re) => headerRows.some(r => re.test((r[c]||'').toString().trim()));
    const colHas = (c, re) => headerRows.some(r => {
      const txt = (r[c] ?? '').toString()
        .replace(/["'“”‘’]/g, '')   // ตัดเครื่องหมายคำพูดทุกแบบ
        .replace(/\s+/g, ' ')       // บีบช่องว่าง
        .trim();
      return re.test(txt);
    });
    const numFromHeader = (c, def) => {
      let best = null;
      headerRows.forEach(r=>{
        const m = (r[c]||'').toString().match(/\d+(\.\d+)?/g);
        if (m) m.forEach(x=>{
          const n = Number(x);
          if (!isNaN(n)) best = (best==null)?n:Math.max(best,n);
        });
      });
      return (best==null)?def:best;
    };

    // หา "เลขประจำตัว"
    let idIdx = -1;
    for (let c=0;c<maxCols;c++){
      const joined = headerRows.map(r => (r[c]||'').toString().replace(/\s/g,'')).join('_').toLowerCase();
      if (/เลขประจำตัว|studentid/.test(joined)) { idIdx = c; break; }
    }
    if (idIdx < 0) idIdx = 0;

    // จับคอลัมน์ตามกลุ่ม "กลางภาค" และ "ปลายภาค"
    let s1=-1,s2=-1,s3=-1, midExam=-1, s10=-1,s11=-1,s12=-1, finalExam=-1;
    for (let c=0;c<maxCols;c++){
      const isMid = colHas(c, /กลางภาค/);
      const isFin = colHas(c, /ปลายภาค/);
      if (!isMid && !isFin) continue;
      if (isMid){
        if (colHas(c, /^\s*1\s*$/)) s1 = c;
        else if (colHas(c, /^\s*2\s*$/)) s2 = c;
        else if (colHas(c, /^\s*3\s*$/)) s3 = c;
        else if (colHas(c, /(สอบกลางภาค|สอบ|กลางภาค)/)) midExam = c;   // ← เพิ่มคำหลายแบบ
      }
      if (isFin){
        if (colHas(c, /^\s*10\s*$/)) s10 = c;
        else if (colHas(c, /^\s*11\s*$/)) s11 = c;
        else if (colHas(c, /^\s*12\s*$/)) s12 = c;
        else if (colHas(c, /(สอบปลายภาค|สอบ|ปลายภาค)/)) finalExam = c; // ← เพิ่มคำหลายแบบ
      }
    }

    const anyMid = (s1>=0 || s2>=0 || s3>=0 || midExam>=0);
    const anyFin = (s10>=0 || s11>=0 || s12>=0 || finalExam>=0);
    if (anyMid || anyFin){
      const max = {
        s1:  numFromHeader(s1,  CLAMP_MAX.s1),
        s2:  numFromHeader(s2,  CLAMP_MAX.s2),
        s3:  numFromHeader(s3,  CLAMP_MAX.s3),
        mid: numFromHeader(midExam, CLAMP_MAX.mid),
        s10: numFromHeader(s10, CLAMP_MAX.s10),
        s11: numFromHeader(s11, CLAMP_MAX.s11),
        s12: numFromHeader(s12, CLAMP_MAX.s12),
        fin: numFromHeader(finalExam, CLAMP_MAX.fin),
        idIdx
      };
      return { mode:'bynumber', rows:dataRows, cols:{s1,s2,s3,midExam,s10,s11,s12,finalExam}, max };
    }

    throw new Error('ไม่พบหัวคอลัมน์ 1/2/3/สอบ หรือ 10/11/12/สอบ ใต้ กลางภาค/ปลายภาค');
  }

  function buildMapById(parsed){
    const map = new Map();
    const toNum = v => {
      const n = Number(String(v ?? '').replace(',', '.'));
      return isNaN(n) ? '' : n;
    };

    if (parsed.mode === 'bynumber'){
      const { rows, cols, max } = parsed;
      for (const r of rows){
        const id = normalizeId(r[max.idIdx]);
        if (!id) continue;

        const val = (idx, cap) => {
          const raw = (idx>=0) ? toNum(r[idx]) : '';
          if (raw === '') return '';
          const clipped = Math.max(0, Math.min(raw, cap));
          if (SKIP_ZERO && Number(clipped) === 0) return '';
          return clipped;
        };

        map.set(id, {
          s1:  val(cols.s1,  max.s1),
          s2:  val(cols.s2,  max.s2),
          s3:  val(cols.s3,  max.s3),
          mid: val(cols.midExam, max.mid),
          s10: val(cols.s10, max.s10),
          s11: val(cols.s11, max.s11),
          s12: val(cols.s12, max.s12),
          fin: val(cols.finalExam, max.fin)
        });
      }
      if (map.size===0) throw new Error('ไม่พบแถวข้อมูลที่ใช้ได้');
      return map;
    }

    throw new Error('parsed.mode ไม่รองรับ');
  }

  // ===== กรอก/ล้าง =====
  function handleFill(mode){
    const raw = (textarea?.value || '').trim();
    if (!raw){ flash('ยังไม่มีข้อมูลในช่องวาง', 'warn'); return; }
    try{
      const parsed = parseClipboardTable(raw);
      const mapById = buildMapById(parsed);
      enableColumns(mode);
      const res = fillIntoWebTable(mapById, mode);
      showSummary(res);
    }catch(e){
      console.error(e);
      flash('รูปแบบข้อมูลไม่ถูกต้อง: '+e.message, 'error');
    }
  }

  function fillIntoWebTable(mapById, mode){
    const rows = Array.from(document.querySelectorAll('tr'))
      .filter(tr => tr.querySelector("input[name*='TblTranscriptsTableControlRepeater']"));

    let matched=0, missing=0, filled=0;

    for (const tr of rows){
      const tds = tr.querySelectorAll('td');
      if (!tds || tds.length===0) continue;

      const idCell = tds[WEB_ID_COL_INDEX];
      const pageId = normalizeId((idCell?.innerText || idCell?.textContent || '').trim());
      if (!pageId) continue;

      const data = mapById.get(pageId);
      if (!data){ markRow(tr,'missing'); missing++; continue; }

      if (mode==='mid'){
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s1, data.s1);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s2, data.s2);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s3, data.s3);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.midterm, data.mid);
      } else if (mode==='final'){
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s10, data.s10);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s11, data.s11);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.s12, data.s12);
        filled += setInputBySuffix(tr, FIELD_SUFFIX.final, data.fin);
      }

      markRow(tr,'matched');
      matched++;
    }
    return { matched, missing, filled, totalRows: rows.length };
  }

  function setInputBySuffix(row, suffix, value){
    if ((value==='' || value==null) && SKIP_BLANK) return 0;
    if (SKIP_ZERO && Number(value) === 0) return 0;

    const input = row.querySelector(`input[name$='${CSS.escape(suffix)}']`);
    if (!input) return 0;
    if (input.disabled) input.disabled = false;

    input.focus();
    input.value = (value==='' || value==null) ? '' : value;
    input.dispatchEvent(new Event('input',  { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Tab'}));
    input.blur();
    return 1;
  }

  function handleClear(mode){
    const label = mode==='mid' ? 'กลางภาค (S1/S2/S3 + Midterm)'
                 : 'ปลายภาค (S10/S11/S12 + Final)';
    if (!confirm(`ยืนยันล้างข้อมูล ${label} สำหรับทุกแถวในหน้านี้?`)) return;

    enableColumns(mode);

    const rows = Array.from(document.querySelectorAll('tr'))
      .filter(tr => tr.querySelector("input[name*='TblTranscriptsTableControlRepeater']"));

    let cleared = 0;
    for (const tr of rows){
      if (mode==='mid'){
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s1);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s2);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s3);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.midterm);
      } else if (mode==='final'){
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s10);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s11);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.s12);
        cleared += clearInputBySuffix(tr, FIELD_SUFFIX.final);
      }
      if (HIGHLIGHT.cleared) markRow(tr,'cleared');
    }
    flash(`ล้างข้อมูลเสร็จ • ช่องที่ถูกล้าง: ${cleared} | แถวบนหน้า: ${rows.length}`, 'ok');
  }

  function clearInputBySuffix(row, suffix){
    const input = row.querySelector(`input[name$='${CSS.escape(suffix)}']`);
    if (!input) return 0;
    if (input.disabled) input.disabled = false;

    const prev = input.value;
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input',  { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.blur();
    return prev && String(prev).trim() !== '' ? 1 : 0;
  }

  function markRow(tr,state){
    tr.style.transition='background .25s ease';
    if (state==='matched' && HIGHLIGHT.matched) tr.style.background='rgba(46,204,113,.12)';
    if (state==='missing' && HIGHLIGHT.missing) tr.style.background='rgba(241,196,15,.15)';
    if (state==='cleared' && HIGHLIGHT.cleared) tr.style.background='rgba(127,140,141,.12)';
  }
  function showSummary({ matched, missing, filled, totalRows }){
    flash(`แถวบนหน้า: ${totalRows} | จับคู่สำเร็จ: ${matched} | ไม่พบในข้อมูลวาง: ${missing} | ช่องที่กรอก: ${filled}`,'ok');
  }

  // ===== Boot =====
  function boot(){ ensureUI(); }
  boot();
  const mo = new MutationObserver(()=>boot());
  mo.observe(document.documentElement, { childList:true, subtree:true });
})();
