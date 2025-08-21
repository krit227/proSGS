// content.js — SGS Helper (v2.4 + fixes)
// - แยกโหมดกรอก: กลางภาค / ปลายภาค / ทุกช่อง
// - ปุ่มล้าง: ล้างเฉพาะกลางภาค / เฉพาะปลายภาค / ทุกช่อง
// - Parser ทนหัวตารางหลายแถว + สำรองเดาจาก KPAC และ "30"
// - แพตช์: สลับอินเด็กซ์เทอม1/เทอม2 ถ้าหัวกลับด้าน
// - ตัดปุ่มใหญ่ลอยออกตามคำขอ

(() => {
  'use strict';

  // guard กันฉีดซ้ำ
  if (window.__SGS_HELPER_INJECTED__) return;
  window.__SGS_HELPER_INJECTED__ = true;

  // polyfill CSS.escape (กันเคสเบราว์เซอร์ที่ไม่มี)
  if (typeof window.CSS === 'undefined') window.CSS = {};
  if (!CSS.escape) {
    CSS.escape = s => String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  }

  // ===== CONFIG =====
  const WEB_ID_COL_INDEX = 3; // index คอลัมน์ "เลขประจำตัว" บนหน้า (เริ่มจาก 0)
  const FIELD_SUFFIX = {
    keepTerm1: '$S1',      // รวมคะแนนเก็บเทอม 1 (max 30)
    midterm:   '$Midterm', // กลางภาค (max 20)
    keepTerm2: '$S10',     // รวมคะแนนเก็บเทอม 2 (max 30)
    final:     '$Final'    // ปลายภาค (max 20)
  };

  // รูปรหัสนักเรียน
  const REMOVE_LEADING_ZEROES = true;
  const PAD_ID_TO_LEN = 0; // ถ้าต้องเติมศูนย์นำหน้าให้ครบความยาว ให้ใส่เลขที่ต้องการ (เช่น 5) ไม่ใช้ให้เป็น 0

  // เพดานคะแนน (กันเว็บเตือน)
  const CLAMP_MAX = { keep1:30, mid:20, keep2:30, fin:20 };

  // ข้ามค่าแบบไหนตอน "กรอก"
  const SKIP_BLANK = true; // ค่าว่างให้ข้าม
  const SKIP_ZERO  = true; // ค่า 0 ให้ข้าม

  // parser
  const ALLOW_HEADERLESS = true; // รองรับกรณีคัดลอกมาไม่มีหัวตาราง

  // สีไฮไลต์
  const HIGHLIGHT = { matched: true, missing: true, cleared: true };

  // ===== ตัวอย่างบน Google Sheets =====
  const SAMPLE_SHEET_ID = '1CO_n0RjqG2nB5TvxvxsDgOKSiHdTV7a6JU0RCCBEye8';
  const SHEET_VIEW_URL  = `https://docs.google.com/spreadsheets/d/${SAMPLE_SHEET_ID}/edit?usp=sharing`;
  const SHEET_XLSX_URL  = `https://docs.google.com/spreadsheets/d/${SAMPLE_SHEET_ID}/export?format=xlsx`; // เพิ่ม &gid=... ถ้าต้องการ


  // ===== Helpers (id / score) =====
  function normalizeId(id) {
    let s = (id ?? '').toString().trim().replace(/\s|-/g, '');
    if (REMOVE_LEADING_ZEROES) s = s.replace(/^0+/, '');
    if (/^\d+$/.test(s) && PAD_ID_TO_LEN > 0) s = s.padStart(PAD_ID_TO_LEN, '0');
    return s;
  }
  function clampScore(v, max) {
    if (v === '' || v == null) return '';
    const n = Number(String(v).replace(',', '.'));
    if (isNaN(n)) return '';
    const c = Math.max(0, Math.min(n, max));
    if (SKIP_ZERO && c === 0) return '';
    return c;
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
          คัดลอกพร้อมหัวตาราง: <b>เลขประจำตัว</b>, <b>รวม(เทอม1)</b>, <b>กลางภาค (เต็ม/แก้ตัว)</b>, <b>รวม(เทอม2)</b>, <b>ปลายภาค</b><br>
          เลือกโหมด: <b>กลางภาคเท่านั้น</b>, <b>ปลายภาคเท่านั้น</b>, หรือ <b>ทุกช่อง</b> • ค่าว่าง/0 จะถูกข้ามตอนกรอก
        </div>
        <textarea id="__sgs_text" rows="7" style="width:100%;box-sizing:border-box;font-size:12px;"></textarea>

        <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
          <!-- แถวบน: ปุ่มยาวเต็มกว้าง -->
          <button id="__sgs_read"
                  style="width:100%;padding:10px;cursor:pointer;">
            วางจากคลิปบอร์ด
          </button>

          <!-- แถวล่าง: 2 ปุ่มแบ่งครึ่ง -->
          <div style="display:flex;gap:8px;">
            <button id="__sgs_mid"
                    style="flex:1;padding:10px;cursor:pointer;background:#2d7;color:#fff;border:none;">
              กรอกเฉพาะกลางภาค
            </button>
            <button id="__sgs_final"
                    style="flex:1;padding:10px;cursor:pointer;background:#f39c12;color:#fff;border:none;">
              กรอกเฉพาะปลายภาค
            </button>
            <button id="__sgs_all"   style="flex:1 1 140px;padding:10px;cursor:pointer;background:#1363df;color:#fff;border:none;">กรอกทุกช่อง</button>
          </div>
        </div>


        <div style="margin-top:10px;border-top:1px dashed #eee;padding-top:10px;">
          <div style="font-size:13px;margin-bottom:6px;"><b>🧹 โซนล้างข้อมูล (ทุกแถวในหน้านี้)</b></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="__sgs_clear_mid"   style="flex:1 1 140px;padding:10px;cursor:pointer;background:#e74c3c;color:#fff;border:none;">ล้างเฉพาะกลางภาค</button>
            <button id="__sgs_clear_final" style="flex:1 1 140px;padding:10px;cursor:pointer;background:#d35400;color:#fff;border:none;">ล้างเฉพาะปลายภาค</button>
            <button id="__sgs_clear_all"   style="flex:1 1 140px;padding:10px;cursor:pointer;background:#b00020;color:#fff;border:none;">ล้างทุกช่อง (ทั้งหมด)</button>
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

    const styleHide = document.createElement('style');
    styleHide.textContent = `
      #__sgs_all, #__sgs_clear_all { display: none !important; }
    `;
    document.head.appendChild(styleHide);

    textarea  = document.getElementById('__sgs_text');
    statusBox = document.getElementById('__sgs_status');

    const exBox = panel.querySelector('#__sgs_examples');
      if (exBox){
        exBox.innerHTML = `
          <a href="${SHEET_VIEW_URL}" target="_blank" rel="noopener" style="color:#1363df;">🔗 เปิดดูตัวอย่าง (Google Sheets)</a>
          <a href="${SHEET_XLSX_URL}" target="_blank" rel="noopener" style="color:#1363df;">⬇️ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)</a>
          <div style="color:#666;font-size:12px;">
            * ให้คัดลอกพร้อมหัวตาราง: <b>เลขประจำตัว</b>, <b>รวม(เทอม1)</b>, <b>กลางภาค (เต็ม/แก้ตัว)</b>, <b>รวม(เทอม2)</b>, <b>ปลายภาค</b>
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
    document.getElementById('__sgs_all').addEventListener('click',   ()=>handleFill('all'));

    // ปุ่มล้าง
    document.getElementById('__sgs_clear_mid').addEventListener('click',   ()=>handleClear('mid'));
    document.getElementById('__sgs_clear_final').addEventListener('click', ()=>handleClear('final'));
    document.getElementById('__sgs_clear_all').addEventListener('click',   ()=>handleClear('all'));

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
        s1:  (mode==='mid'   || mode==='all'),
        mid: (mode==='mid'   || mode==='all'),
        s10: (mode==='final' || mode==='all'),
        fin: (mode==='final' || mode==='all')
      };
      try{ if (need.s1  && typeof window.check==='function') window.check(true, 'S1'); }catch(e){}
      try{ if (need.mid && typeof window.check==='function') window.check(true, 'Midterm'); }catch(e){}
      try{ if (need.s10 && typeof window.check==='function') window.check(true, 'S10'); }catch(e){}
      try{ if (need.fin && typeof window.check==='function') window.check(true, 'Final'); }catch(e){}

      const ids = [];
      if (need.s1)  ids.push('ctl00_PageContent_Check1');
      if (need.mid) ids.push('ctl00_PageContent_CheckM');
      if (need.s10) ids.push('ctl00_PageContent_Check10');
      if (need.fin) ids.push('ctl00_PageContent_CheckF');
      ids.forEach(id=>{
        const cb = document.getElementById(id);
        if (cb && !cb.checked && !cb.disabled){ try{ cb.click(); }catch(e){} }
      });
    }, 300);
  }

  // Paste ทั้งหน้า (สะดวก)
  document.addEventListener('paste', (ev)=>{
    const t = ev.target;
    if (t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA') && t.id!=='__sgs_text') return;
    const txt = ev.clipboardData?.getData('text') || '';
    if (txt && txt.includes('\t')){
      ensureUI();
      textarea.value = txt;
      panel.querySelector('div:nth-child(2)').style.display='';
      flash('วางข้อมูลแล้ว • เลือกโหมด “กลางภาค/ปลายภาค/ทุกช่อง”', 'ok');
      ev.preventDefault();
    }
  }, true);

  // ===== Parser (หัวหลายแถว + เดา) =====
  function normText(s){
    return (s??'').toString().trim().replace(/\s+/g,'').replace(/[(){}\[\]\-_/]/g,'').toLowerCase();
  }
  function looksLikeDataRow(row){
    const a = (row?.[0] ?? '').toString().trim();
    const digits = a.replace(/\D/g,'');
    return digits.length >= 4;
  }
  function colHasExactNumber(headerRows, colIdx, numberStr){
    return headerRows.some(r => (r[colIdx]||'').toString().trim() === String(numberStr));
  }
  function hasKPACCluster(headerRows, colIdx){
    const want = new Set(['k','p','a','c']);
    for (let j = Math.max(0, colIdx-6); j < colIdx; j++){
      const cellTokens = headerRows.map(r => normText(r[j]||''));
      if (cellTokens.some(t => want.has(t))){
        cellTokens.forEach(t => want.delete(t));
        if (want.size === 0) return true;
      }
    }
    return false;
  }

  function parseClipboardTable(raw){
    const lines = raw.split(/\r?\n/).filter(l=>l.trim()!=='');
    const rows  = lines.map(l=> l.split('\t').map(s=>(s??'').toString().trim()));
    if (rows.length < 1) throw new Error('ไม่มีข้อมูล');

    // หาแถวเริ่มข้อมูลจริง
    let dataStart = 0;
    for (let i=0; i<Math.min(rows.length, 6); i++){
      if (looksLikeDataRow(rows[i])) { dataStart = i; break; }
    }

    // โหมดไม่มีหัวตาราง
    if (dataStart === 0 && ALLOW_HEADERLESS){
      const n = rows[0].length;
      if (n === 6){
        return { rows: rows, index: { idIdx:0, keep1Idx:2, midFullIdx:3, midMakeupIdx:-1, keep2Idx:4, finalIdx:5 } };
      } else if (n === 5){
        return { rows: rows, index: { idIdx:0, keep1Idx:1, midFullIdx:2, midMakeupIdx:-1, keep2Idx:3, finalIdx:4 } };
      } else {
        throw new Error(`โหมดไม่มีหัวตาราง: จำนวนคอลัมน์ (${n}) ไม่ใช่ 5 หรือ 6`);
      }
    }

    // รวมหัวตารางหลายแถว
    const headerRows = rows.slice(0, dataStart);
    const maxCols = Math.max(...headerRows.map(r => r.length));
    const headerCombined = [];
    for (let c=0; c<maxCols; c++){
      const joined = headerRows.map(r => r[c] || '').join('_');
      headerCombined.push(normText(joined));
    }

    // 1) เลขประจำตัว
    const idIdx = headerCombined.findIndex(h => /เลขประจำตัว|studentid/.test(h));
    if (idIdx < 0) throw new Error("หา 'เลขประจำตัว' ไม่พบในหัวตาราง");

    // 2) รวม(เทอม1/2)
    let sumCandidates = [];
    for (let i=0; i<headerCombined.length; i++){
      const h = headerCombined[i];
      if ((/(^|_)รวม($|_)/.test(h)) && !/รวมคะแนน/.test(h)) {
        sumCandidates.push(i);
      }
    }
    if (sumCandidates.length < 2){
      for (let i=0; i<maxCols; i++){
        if (colHasExactNumber(headerRows, i, '30') && hasKPACCluster(headerRows, i)) {
          if (!sumCandidates.includes(i)) sumCandidates.push(i);
        }
      }
      sumCandidates = sumCandidates.sort((a,b)=>a-b).slice(0,2);
    }
    if (sumCandidates.length < 2) throw new Error("หา 'รวม' ของเทอม 1/2 ไม่ครบ");

    let keep1Idx, keep2Idx;
    const left = sumCandidates[0], right = sumCandidates[1];
    const leftH  = headerCombined[left],  rightH = headerCombined[right];

    const leftIsT1  = /(1.*รวม|เทอม1|ภาคเรียน1|t1)/.test(leftH);
    const leftIsT2  = /(2.*รวม|เทอม2|ภาคเรียน2|t2)/.test(leftH);
    const rightIsT1 = /(1.*รวม|เทอม1|ภาคเรียน1|t1)/.test(rightH);
    const rightIsT2 = /(2.*รวม|เทอม2|ภาคเรียน2|t2)/.test(rightH);

    // ดีฟอลต์: ซ้าย=เทอม1 ขวา=เทอม2
    keep1Idx = left;
    keep2Idx = right;
    // ถ้าหัวกลับด้านชัดเจน (ซ้ายเขียนเหมือนเทอม2 และขวาเหมือนเทอม1) → สลับ
    if (leftIsT2 && rightIsT1) {
      keep1Idx = right;
      keep2Idx = left;
    }

    // 3) กลางภาค (เต็ม/แก้ตัว)
    const midFullIdx   = headerCombined.findIndex(h => /กลางภาค.*เต็ม|เต็ม.*กลางภาค|midterm.*full|full.*midterm/.test(h));
    const midMakeupIdx = headerCombined.findIndex(h => /กลางภาค.*แก้ตัว|แก้ตัว.*กลางภาค|midterm.*makeup|makeup.*midterm|ซ่อม/.test(h));

    // 4) ปลายภาค
    const finalIdx = headerCombined.findIndex(h => /ปลายภาค|final/.test(h));
    if (finalIdx < 0) throw new Error("หา 'ปลายภาค' ไม่พบ");

    return {
      rows: rows.slice(dataStart),
      index: { idIdx, keep1Idx, midFullIdx, midMakeupIdx, keep2Idx, finalIdx }
    };
  }

  function buildMapById(parsed){
    const { rows, index } = parsed;
    const map = new Map();
    for (const r of rows){
      const id  = normalizeId(r[index.idIdx]);
      if (!id) continue;
      const keep1 = clampScore(r[index.keep1Idx], CLAMP_MAX.keep1);
      const midF  = (index.midFullIdx   >= 0) ? clampScore(r[index.midFullIdx],   CLAMP_MAX.mid) : '';
      const midM  = (index.midMakeupIdx >= 0) ? clampScore(r[index.midMakeupIdx], CLAMP_MAX.mid) : '';
      const keep2 = clampScore(r[index.keep2Idx], CLAMP_MAX.keep2);
      const fin   = clampScore(r[index.finalIdx], CLAMP_MAX.fin);

      const mid   = (midF !== '' ? midF : midM); // ใช้ "เต็ม" ถ้ามี ไม่งั้นใช้ "แก้ตัว"
      map.set(id, { keep1, mid, keep2, fin });
    }
    if (map.size===0) throw new Error('ไม่พบแถวข้อมูลที่ใช้ได้');
    return map;
  }

  // ===== กรอกตามโหมด =====
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

      const doKeep1 = (mode==='mid'   || mode==='all');
      const doMid   = (mode==='mid'   || mode==='all');
      const doKeep2 = (mode==='final' || mode==='all');
      const doFinal = (mode==='final' || mode==='all');

      if (doKeep1) filled += setInputBySuffix(tr, FIELD_SUFFIX.keepTerm1, data.keep1);
      if (doMid)   filled += setInputBySuffix(tr, FIELD_SUFFIX.midterm,   data.mid);
      if (doKeep2) filled += setInputBySuffix(tr, FIELD_SUFFIX.keepTerm2, data.keep2);
      if (doFinal) filled += setInputBySuffix(tr, FIELD_SUFFIX.final,     data.fin);

      markRow(tr,'matched');
      matched++;
    }
    return { matched, missing, filled, totalRows: rows.length };
  }

  function setInputBySuffix(row, suffix, value){
    if ((value==='' || value==null) && SKIP_BLANK) return 0; // ข้ามค่าว่างถ้าตั้งค่าไว้
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

  // ===== ล้างข้อมูล =====
  function handleClear(mode){
    const label = mode==='mid' ? 'กลางภาค (S1 + กลางภาค)'
                 : mode==='final' ? 'ปลายภาค (S10 + ปลายภาค)'
                 : 'ทุกช่อง (S1 + กลางภาค + S10 + ปลายภาค)';
    if (!confirm(`ยืนยันล้างข้อมูล ${label} สำหรับทุกแถวในหน้านี้?`)) return;
    if (mode==='all' && !confirm('ยืนยันอีกครั้ง: ล้าง “ทุกช่อง” ทั้งหน้า — แน่ใจนะครับ?')) return;

    enableColumns(mode);

    const rows = Array.from(document.querySelectorAll('tr'))
      .filter(tr => tr.querySelector("input[name*='TblTranscriptsTableControlRepeater']"));

    let cleared = 0;
    for (const tr of rows){
      const doKeep1 = (mode==='mid'   || mode==='all');
      const doMid   = (mode==='mid'   || mode==='all');
      const doKeep2 = (mode==='final' || mode==='all');
      const doFinal = (mode==='final' || mode==='all');

      if (doKeep1) cleared += clearInputBySuffix(tr, FIELD_SUFFIX.keepTerm1);
      if (doMid)   cleared += clearInputBySuffix(tr, FIELD_SUFFIX.midterm);
      if (doKeep2) cleared += clearInputBySuffix(tr, FIELD_SUFFIX.keepTerm2);
      if (doFinal) cleared += clearInputBySuffix(tr, FIELD_SUFFIX.final);

      if (HIGHLIGHT.cleared) markRow(tr,'cleared');
    }
    flash(`ล้างช่องทั้งหมดแล้ว • ช่องที่ถูกล้าง: ${cleared} | แถวบนหน้า: ${rows.length}`, 'ok');
  }

  function clearInputBySuffix(row, suffix){
    const input = row.querySelector(`input[name$='${CSS.escape(suffix)}']`);
    if (!input) return 0;
    if (input.disabled) input.disabled = false;

    const prev = input.value;
    input.focus();
    input.value = ''; // ล้าง
    input.dispatchEvent(new Event('input',  { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.blur();
    return prev && String(prev).trim() !== '' ? 1 : 0;
  }

  // ===== ไฮไลต์/สรุป =====
  function markRow(tr,state){
    tr.style.transition='background .25s ease';
    if (state==='matched' && HIGHLIGHT.matched) tr.style.background='rgba(46,204,113,.12)';
    if (state==='missing' && HIGHLIGHT.missing) tr.style.background='rgba(241,196,15,.15)';
    if (state==='cleared' && HIGHLIGHT.cleared) tr.style.background='rgba(127,140,141,.12)'; // เทาอ่อน
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
