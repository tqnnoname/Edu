import { MicroCourse } from '../types/exam';

/**
 * Pure TypeScript SCORM 1.2 ZIP package builder (STORE method 0 + CRC32).
 * Generates a valid SCORM 1.2 compliant .zip containing `imsmanifest.xml`
 * and an interactive standalone SCO player (`index.html`).
 */

const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBlob(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // Compression method 0 = STORE
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x5421, true); // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Compression method 0
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x5421, true); // Mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk start
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const allParts = [...localParts, ...centralParts, endRecord];
  const totalBytes = allParts.reduce((s, p) => s + p.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let cursor = 0;
  allParts.forEach((p) => {
    combined.set(p, cursor);
    cursor += p.byteLength;
  });

  return new Blob([combined.buffer], {
    type: 'application/zip',
  });
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildImsManifestXml(course: MicroCourse): string {
  const safeId = course.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const titleXml = escapeXml(course.title);
  const descXml = escapeXml(course.description || course.title);

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST_${safeId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsproject.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_${safeId}">
    <organization identifier="ORG_${safeId}">
      <title>${titleXml}</title>
      <item identifier="ITEM_${safeId}" identifierref="RES_${safeId}" isvisible="true">
        <title>${titleXml}</title>
        <adlcp:masteryscore>50</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_${safeId}" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
  <!-- Description: ${descXml} -->
</manifest>`;
}

function buildScormScoHtml(course: MicroCourse): string {
  const normalizedCourse: MicroCourse = {
    ...course,
    chapters:
      course.chapters && course.chapters.length > 0
        ? course.chapters
        : [
            {
              id: 'chap_default',
              title: 'Chương 1: Nội dung khóa học',
              order: 1,
              lessons: course.lessons || [],
            },
          ],
  };

  const courseJson = JSON.stringify(normalizedCourse).replace(/<\//g, '<\\/');
  const baseOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const baseOriginJson = JSON.stringify(baseOrigin);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(course.title)} - SCORM 1.2</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
    .topbar { background: #0f172a; color: #fff; padding: 14px 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #10b981; color: #fff; }
    .layout { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 64px); }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
    .sidebar { background: #fff; border-right: 1px solid #e2e8f0; padding: 16px; }
    .main { padding: 24px; max-width: 900px; width: 100%; margin: 0 auto; }
    .lesson-btn { width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 6px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; cursor: pointer; font-size: 13px; }
    .lesson-btn.active { background: #0f172a; color: #fff; border-color: #0f172a; font-weight: 700; }
    .lesson-btn.done { border-color: #34d399; background: #ecfdf5; color: #065f46; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .progress-wrap { background: rgba(255,255,255,0.2); height: 8px; border-radius: 999px; overflow: hidden; width: 200px; }
    .progress-fill { background: #34d399; height: 100%; transition: width 0.3s ease; }
    .btn { padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-weight: 600; font-size: 12px; cursor: pointer; }
    .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    .btn-done { background: #10b981; color: #fff; border-color: #10b981; }
    .img-wrap img { max-width: 100%; border-radius: 10px; border: 1px solid #e2e8f0; }
    .opt-btn { display: block; width: 100%; text-align: left; padding: 10px 12px; margin: 6px 0; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer; font-size: 13px; }
    .opt-btn.selected { border-color: #2563eb; background: #eff6ff; font-weight: 700; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <span class="badge">SCORM 1.2 SCO</span>
      <strong style="margin-left:8px;font-size:15px;">${escapeXml(course.title)}</strong>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="progress-wrap"><div id="bar" class="progress-fill" style="width:0%"></div></div>
      <span id="pctLabel" style="font-size:13px;font-weight:700;">0%</span>
    </div>
  </div>
  <div class="layout">
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main" id="main"></main>
  </div>
  <script>
    var COURSE = ${courseJson};
    var BASE_ORIGIN = ${baseOriginJson};
    function resolveMediaUrl(u) {
      if (!u || typeof u !== 'string') return '';
      if (u.indexOf('/api/files/') === 0 && BASE_ORIGIN) return BASE_ORIGIN + u;
      return u;
    }
    var completedBlocks = {};
    var answers = {};
    var activeLessonId = null;

    function findScormApi(win) {
      var tries = 0;
      while (win && !win.API && tries < 15) {
        if (win.parent === win) break;
        win = win.parent;
        tries++;
      }
      return (win && win.API) || null;
    }
    var SCORM_API = findScormApi(window);
    if (SCORM_API) { try { SCORM_API.LMSInitialize(""); } catch (e) {} }

    function allLessons() {
      var list = [];
      (COURSE.chapters || []).forEach(function(ch) {
        (ch.lessons || []).forEach(function(l) { list.push({ chapter: ch.title, lesson: l }); });
      });
      return list;
    }
    var flatLessons = allLessons();
    if (flatLessons.length > 0) activeLessonId = flatLessons[0].lesson.id;

    function allUnitsCount() {
      var count = 0;
      flatLessons.forEach(function(it) {
        var b = it.lesson.blocks || [];
        count += b.length > 0 ? b.length : 1;
      });
      return count;
    }

    function updateScormProgress() {
      var total = allUnitsCount();
      var doneCount = Object.keys(completedBlocks).filter(function(k) { return completedBlocks[k]; }).length;
      var pct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;
      document.getElementById('bar').style.width = pct + '%';
      document.getElementById('pctLabel').textContent = pct + '% (' + doneCount + '/' + total + ')';
      if (SCORM_API) {
        try {
          SCORM_API.LMSSetValue('cmi.core.lesson_status', pct >= 100 ? 'completed' : (pct > 0 ? 'incomplete' : 'not attempted'));
          SCORM_API.LMSSetValue('cmi.core.score.raw', String(pct));
          if (activeLessonId) SCORM_API.LMSSetValue('cmi.core.lesson_location', activeLessonId);
          SCORM_API.LMSCommit('');
        } catch (e) {}
      }
    }

    function renderText(txt, inlineMap) {
      var escaped = (txt || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      escaped = escaped.replace(/\[\[img:([a-zA-Z0-9_-]+)(?:\|([^\]]*))?\]\]/g, function(_, id, title) {
        var src = resolveMediaUrl((inlineMap && inlineMap[id]) || '');
        if (!src || /^javascript:/i.test(src)) {
          return '<div style="margin:8px 0;padding:8px 10px;border:1px dashed #cbd5e1;border-radius:8px;font-size:12px;color:#64748b;">[Ảnh: ' + (title || id) + ']</div>';
        }
        var safeAlt = (title || 'image').replace(/"/g, '&quot;');
        var cap = title ? '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + title + '</div>' : '';
        return '<div class="img-wrap" style="margin:12px 0;text-align:center;"><img src="' + src.replace(/"/g, '&quot;') + '" alt="' + safeAlt + '" />' + cap + '</div>';
      });
      escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, rawSrc) {
        var src = resolveMediaUrl(rawSrc || '');
        if (/^javascript:/i.test(src)) return alt || '';
        return '<div class="img-wrap" style="margin:12px 0;text-align:center;"><img src="' + src.replace(/"/g, '&quot;') + '" alt="' + (alt || 'image').replace(/"/g, '&quot;') + '" /></div>';
      });
      return escaped.replace(/\\n/g,'<br/>');
    }

    function getOrderedSections(sections) {
      var list = Array.isArray(sections) ? sections.slice() : [];
      var byParent = {};
      var byId = {};
      list.forEach(function(s) { byId[s.id] = s; });
      list.forEach(function(s) {
        var p = (s.parentSectionId && byId[s.parentSectionId] && s.parentSectionId !== s.id) ? s.parentSectionId : '__root__';
        if (!byParent[p]) byParent[p] = [];
        byParent[p].push(s);
      });
      Object.keys(byParent).forEach(function(k) {
        byParent[k].sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
      });
      var ordered = [];
      var visited = {};
      function walk(parentKey, depth) {
        (byParent[parentKey] || []).forEach(function(sec) {
          if (visited[sec.id]) return;
          visited[sec.id] = true;
          ordered.push({ section: sec, depth: depth });
          walk(sec.id, depth + 1);
        });
      }
      walk('__root__', 0);
      list.forEach(function(s) { if (!visited[s.id]) ordered.push({ section: s, depth: 0 }); });
      return ordered;
    }

    function getSectionBreadcrumb(sections, sectionId) {
      if (!sectionId || !Array.isArray(sections)) return [];
      var byId = {};
      sections.forEach(function(s) { byId[s.id] = s; });
      var chain = [];
      var seen = {};
      var cur = byId[sectionId];
      while (cur && !seen[cur.id]) {
        seen[cur.id] = true;
        chain.unshift(cur);
        cur = cur.parentSectionId ? byId[cur.parentSectionId] : null;
      }
      return chain;
    }

    function render() {
      var sb = document.getElementById('sidebar');
      sb.innerHTML = '';
      (COURSE.chapters || []).forEach(function(ch) {
        var h = document.createElement('div');
        h.style.cssText = 'font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:12px 0 6px;';
        h.textContent = ch.title;
        sb.appendChild(h);
        (ch.lessons || []).forEach(function(l) {
          var btn = document.createElement('button');
          var blocks = l.blocks || [];
          var isDone = blocks.length > 0
            ? blocks.every(function(b) { return !!completedBlocks[b.id]; })
            : !!completedBlocks['lesson_unit_' + l.id];
          btn.className = 'lesson-btn' + (l.id === activeLessonId ? ' active' : (isDone ? ' done' : ''));
          btn.textContent = (isDone ? '✓ ' : '') + l.title;
          btn.onclick = function() { activeLessonId = l.id; render(); };
          sb.appendChild(btn);
        });
      });

      var main = document.getElementById('main');
      main.innerHTML = '';
      var currentObj = flatLessons.find(function(it) { return it.lesson.id === activeLessonId; });
      if (!currentObj) { main.innerHTML = '<div class="card">Chưa có bài học.</div>'; return; }
      var lesson = currentObj.lesson;
      var header = document.createElement('div');
      header.className = 'card';
      header.innerHTML = '<div style="font-size:12px;color:#2563eb;font-weight:700;">' + escapeHtml(currentObj.chapter) + '</div><h2 style="margin:6px 0 0;">' + escapeHtml(lesson.title) + '</h2>' +
        (lesson.summary ? '<p style="margin:8px 0 0;font-size:13px;color:#475569;">' + escapeHtml(lesson.summary) + '</p>' : '');
      main.appendChild(header);

      var orderedSections = getOrderedSections(lesson.sections || []);
      if (orderedSections.length > 0) {
        var outline = document.createElement('div');
        outline.className = 'card';
        outline.style.cssText = 'padding:14px 18px;background:#f8fafc;';
        var outlineItems = orderedSections.map(function(node) {
          var indent = node.depth * 14;
          return '<div style="padding:3px 0 3px ' + indent + 'px;font-size:12px;color:#334155;">• <strong>' + escapeHtml(node.section.title) + '</strong>' +
            (node.section.summary ? ' <span style="color:#64748b;">— ' + escapeHtml(node.section.summary) + '</span>' : '') + '</div>';
        }).join('');
        outline.innerHTML = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Cấu trúc phân mục trong bài</div>' + outlineItems;
        main.appendChild(outline);
      }

      var courseInline = COURSE.inlineImages || {};
      var lastRenderedSectionId = null;

      (lesson.blocks || []).forEach(function(blk, idx) {
        var secChain = getSectionBreadcrumb(lesson.sections || [], blk.sectionId);
        if (blk.sectionId && blk.sectionId !== lastRenderedSectionId && secChain.length > 0) {
          lastRenderedSectionId = blk.sectionId;
          var secBanner = document.createElement('div');
          secBanner.style.cssText = 'margin:14px 0 8px;padding:8px 12px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;font-size:12px;font-weight:700;';
          secBanner.textContent = secChain.map(function(s) { return s.title; }).join(' › ');
          main.appendChild(secBanner);
        }

        var blkInline = Object.assign({}, courseInline, blk.inlineImages || {}, (blk.question && blk.question.inlineImages) || {});
        var card = document.createElement('div');
        card.className = 'card';
        var crumbHtml = secChain.length > 0
          ? '<div style="font-size:11px;font-weight:600;color:#4f46e5;margin-bottom:6px;">' + secChain.map(function(s) { return escapeHtml(s.title); }).join(' › ') + '</div>'
          : '';
        if (blk.type === 'theory' || blk.type === 'callout') {
          var theoryBody = blk.contentMarkdown || blk.content || '';
          var blkImg = resolveMediaUrl(blk.imageUrl || '');
          card.innerHTML = crumbHtml +
            (blk.title ? '<h3 style="margin-top:0;">' + escapeHtml(blk.title) + '</h3>' : '') +
            '<div style="line-height:1.7;font-size:14px;">' + renderText(theoryBody, blkInline) + '</div>' +
            (blkImg ? '<div class="img-wrap" style="margin-top:12px;"><img src="' + blkImg.replace(/"/g, '&quot;') + '" alt="image" /></div>' : '');
        } else if (blk.type === 'image') {
          var imgUrl = resolveMediaUrl(blk.imageUrl || '');
          card.innerHTML = crumbHtml +
            (blk.title ? '<h3 style="margin-top:0;">' + escapeHtml(blk.title) + '</h3>' : '') +
            (imgUrl ? '<div class="img-wrap"><img src="' + imgUrl.replace(/"/g, '&quot;') + '" alt="image" /></div>' : '') +
            (blk.caption ? '<p style="font-size:12px;color:#475569;margin-top:8px;">' + escapeHtml(blk.caption) + '</p>' : '');
        } else if (blk.type === 'file') {
          var filesHtml = (blk.attachments || []).map(function(att) {
            var href = resolveMediaUrl(att.url || att.dataUrl || '#');
            var dl = att.dataUrl ? ' download="' + escapeHtml(att.name) + '"' : ' target="_blank" rel="noopener noreferrer"';
            return '<div style="margin:6px 0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;display:flex;justify-content:space-between;align-items:center;"><span>' + escapeHtml(att.name) + '</span><a class="btn btn-primary" href="' + href + '"' + dl + '>Tải / Mở tệp</a></div>';
          }).join('');
          card.innerHTML = crumbHtml +
            (blk.title ? '<h3 style="margin-top:0;">' + escapeHtml(blk.title) + '</h3>' : '') +
            (blk.contentMarkdown ? '<div style="line-height:1.6;font-size:13px;margin-bottom:8px;">' + renderText(blk.contentMarkdown, blkInline) + '</div>' : '') +
            filesHtml;
        } else if (blk.type === 'question' && blk.question) {
          var q = blk.question;
          var html = crumbHtml +
            '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;">CÂU HỎI TƯƠNG TÁC #' + (idx + 1) + '</div>' +
            '<div style="font-weight:600;margin-bottom:10px;">' + renderText(q.question, blkInline) + '</div>';
          card.innerHTML = html;
          if (q.options && q.options.length > 0 && q.type !== 'essay') {
            q.options.forEach(function(opt, oi) {
              var ob = document.createElement('button');
              ob.className = 'opt-btn' + (answers[blk.id] === oi ? ' selected' : '');
              ob.textContent = String.fromCharCode(65 + oi) + '. ' + opt;
              ob.onclick = function() {
                answers[blk.id] = oi;
                completedBlocks[blk.id] = true;
                updateScormProgress();
                render();
              };
              card.appendChild(ob);
            });
          } else if (q.type === 'essay') {
            var ta = document.createElement('textarea');
            ta.rows = 4;
            ta.placeholder = 'Nhập bài làm tự luận...';
            ta.style.cssText = 'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:inherit;font-size:13px;';
            ta.value = typeof answers[blk.id] === 'string' ? answers[blk.id] : '';
            ta.oninput = function(ev) {
              answers[blk.id] = ev.target.value;
              if (ev.target.value.trim()) {
                completedBlocks[blk.id] = true;
                updateScormProgress();
              }
            };
            card.appendChild(ta);
          }
        }
        var foot = document.createElement('div');
        foot.style.cssText = 'margin-top:14px;display:flex;justify-content:space-between;font-size:11px;color:#64748b;';
        var isBlkDone = !!completedBlocks[blk.id];
        foot.innerHTML = '<span>Phần #' + (idx + 1) + '</span><span>' + (isBlkDone ? '✓ Đã hoàn thành' : '') + '</span>';
        card.appendChild(foot);
        main.appendChild(card);
      });
      var sentinel = document.createElement('div');
      sentinel.id = 'lesson-bottom-sentinel';
      sentinel.style.cssText = 'height:8px;width:100%;';
      main.appendChild(sentinel);
      updateScormProgress();

      function checkBottomComplete() {
        var el = document.getElementById('lesson-bottom-sentinel');
        if (!el || el.getAttribute('data-lesson-id') !== activeLessonId) return;
        var rect = el.getBoundingClientRect();
        if (rect.top <= window.innerHeight + 32) {
          var changed = false;
          (lesson.blocks || []).forEach(function(b) {
            if (!completedBlocks[b.id]) { completedBlocks[b.id] = true; changed = true; }
          });
          if (changed) { updateScormProgress(); render(); }
        }
      }
      sentinel.setAttribute('data-lesson-id', activeLessonId);
      window.onscroll = checkBottomComplete;
      setTimeout(checkBottomComplete, 600);
    }

    function escapeHtml(s) {
      return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    window.addEventListener('beforeunload', function() {
      if (SCORM_API) { try { SCORM_API.LMSFinish(''); } catch (e) {} }
    });
    render();
  </script>
</body>
</html>`;
}

export function downloadCourseAsScorm12Zip(course: MicroCourse): void {
  const manifestXml = buildImsManifestXml(course);
  const indexHtml = buildScormScoHtml(course);
  const blob = createZipBlob([
    { name: 'imsmanifest.xml', content: manifestXml },
    { name: 'index.html', content: indexHtml },
  ]);

  const slug = (course.title || 'scorm-course')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug || 'khoa-hoc'}_SCORM_1.2.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
