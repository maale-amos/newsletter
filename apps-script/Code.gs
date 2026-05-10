/**
 * Maale Newsletter — Apps Script backend
 * Handles: Drive storage, Gemini AI, Audio TTS, PDF export
 *
 * Deploy: Apps Script editor → Deploy → New deployment → Web App
 *   Execute as: Me / Access: Anyone with link
 *   Copy /exec URL into the frontend's NEWSLETTER_API localStorage.
 */
const CFG = {
  TOKEN: 'BHT_NEWSLETTER_2026',
  ROOT_FOLDER: 'מעלה-עמוס-עיתון',
  ARTICLES_SUBFOLDER: 'כתבות',
  PHOTOS_SUBFOLDER: 'תמונות',
  PDF_SUBFOLDER: 'PDF',
  AUDIO_SUBFOLDER: 'אודיו',
  YEMOT_LINE_API: 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec',
  YEMOT_TOKEN: 'BHT_AGENT_2026',
  GEMINI_API_KEY: 'AIzaSyB4slohbaWuVF1Fb4hUEKxR3Kxu2ItonWY',
  GEMINI_MODEL: 'gemini-2.0-flash-exp',
};

function doGet(e) { return route(e, 'GET'); }
function doPost(e) { return route(e, 'POST'); }

function route(e, method) {
  const params = e.parameter || {};
  if (params.token !== CFG.TOKEN) return _json({ ok: false, error: 'unauthorized' });
  let body = {};
  if (method === 'POST' && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (err) {}
  }
  const action = params.action || '';
  try {
    switch (action) {
      case 'ping':         return _json({ ok: true, time: new Date().toISOString() });
      case 'listArticles': return _json({ ok: true, articles: listArticles_() });
      case 'getArticle':   return _json({ ok: true, article: getArticle_(params.id) });
      case 'saveArticle':  return _json(saveArticle_(body));
      case 'aiAssist':     return _json(aiAssist_(body));
      case 'exportPdf':    return _json(exportPdf_(body));
      case 'listPhotos':   return _json({ ok: true, photos: listPhotos_() });
      case 'uploadPhoto':  return _json(uploadPhoto_(body));
      default:             return _json({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _root() {
  const folders = DriveApp.getFoldersByName(CFG.ROOT_FOLDER);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CFG.ROOT_FOLDER);
}

function _sub(name) {
  const root = _root();
  const it = root.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return root.createFolder(name);
}

// ===== ARTICLES =====
function listArticles_() {
  const folder = _sub(CFG.ARTICLES_SUBFOLDER);
  const docs = folder.getFiles();
  const out = [];
  while (docs.hasNext()) {
    const f = docs.next();
    if (f.getMimeType() === MimeType.GOOGLE_DOCS) {
      const meta = _parseMeta(f.getDescription() || '');
      out.push({
        id: f.getId(),
        title: meta.title || f.getName(),
        category: meta.category || '',
        author: meta.author || '',
        preview: meta.preview || '',
        modified: f.getLastUpdated().toLocaleDateString('he-IL'),
      });
    }
  }
  return out.sort((a, b) => (b.modified > a.modified ? 1 : -1));
}

function getArticle_(id) {
  const f = DriveApp.getFileById(id);
  const doc = DocumentApp.openById(id);
  const body = doc.getBody().getText();
  const meta = _parseMeta(f.getDescription() || '');
  return { id, title: meta.title || f.getName(), category: meta.category, body };
}

function saveArticle_(data) {
  const folder = _sub(CFG.ARTICLES_SUBFOLDER);
  let doc;
  if (data.id) {
    doc = DocumentApp.openById(data.id);
    doc.getBody().clear();
  } else {
    const name = data.title || `כתבה ${new Date().toLocaleDateString('he-IL')}`;
    doc = DocumentApp.create(name);
    DriveApp.getFileById(doc.getId()).moveTo(folder);
  }
  doc.getBody().appendParagraph(data.title || '').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  // Strip HTML to plain text for now (TODO: render rich)
  const plain = (data.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  doc.getBody().appendParagraph(plain);
  doc.saveAndClose();
  const f = DriveApp.getFileById(doc.getId());
  f.setDescription(JSON.stringify({
    title: data.title, category: data.category,
    author: Session.getActiveUser().getEmail(),
    preview: plain.substring(0, 200),
  }));
  return { ok: true, id: doc.getId() };
}

function _parseMeta(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

// ===== AI =====
function aiAssist_(body) {
  const prompts = {
    proofread: 'הגה את הטקסט הבא בעברית מדוקדקת. תקן שגיאות כתיב/דקדוק/פיסוק. השאר את התוכן זהה. החזר רק את הטקסט המתוקן:\n\n',
    shorten:   'קצר את הטקסט הבא לכ-50% מאורכו, שמור על המסר העיקרי. סגנון תורני־קהילתי. החזר רק את הטקסט:\n\n',
    expand:    'הרחב את הטקסט הבא והוסף פרטים, רקע, ציטוטים אפשריים. סגנון תורני־קהילתי לעיתון יישוב. החזר רק את הטקסט:\n\n',
    suggest_photos: 'הצע 5 רעיונות לאילוסטרציה/תמונה לכתבה הבאה. לכל הצעה תאר ב-2 משפטים מה היא מראה ולמה היא מתאימה. הצג רשימה ממוספרת:\n\n',
    catchy_title: 'הצע 5 כותרות קליטות לכתבה הבאה. סגנון עיתון קהילתי-יישובי, ענייני אך מושך. החזר רק את הכותרות, אחת בשורה:\n\n',
    to_audio: 'כתוב סקריפט פודקאסט עברי קצר (3-4 דקות, 400-500 מילים) המבוסס על הכתבה. רציף, ללא בולטים. החזר רק את הטקסט:\n\n',
  };
  const p = prompts[body.kind] || prompts.proofread;
  const text = (body.text || '').substring(0, 8000);
  const fullPrompt = p + text;
  const result = _gemini(fullPrompt);
  if (body.kind === 'to_audio' && result) {
    const audio_url = _generateAudio(result, body.title || 'podcast');
    return { ok: true, result, audio_url };
  }
  return { ok: true, result };
}

function _gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${CFG.GEMINI_API_KEY}`;
  const r = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(r.getContentText());
  return (data.candidates && data.candidates[0].content.parts[0].text) || '';
}

// ===== AUDIO (TTS via Gemini→Drive→Yemot upload) =====
function _generateAudio(text, title) {
  // Save the script as a text file in Audio folder; the listener on Yosef's PC
  // can poll this folder and convert via edge-tts (already integrated).
  const folder = _sub(CFG.AUDIO_SUBFOLDER);
  const stamp = Utilities.formatDate(new Date(), 'GMT+3', 'yyyyMMdd_HHmmss');
  const file = folder.createFile(`script_${stamp}.txt`, text, MimeType.PLAIN_TEXT);
  file.setDescription(JSON.stringify({ title, status: 'pending_tts' }));
  return file.getUrl();
}

// ===== PHOTOS =====
function listPhotos_() {
  const folder = _sub(CFG.PHOTOS_SUBFOLDER);
  const it = folder.getFiles();
  const out = [];
  while (it.hasNext()) {
    const f = it.next();
    const meta = _parseMeta(f.getDescription() || '');
    out.push({
      id: f.getId(),
      url: 'https://drive.google.com/uc?id=' + f.getId(),
      thumb: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400',
      caption: meta.caption || '',
      tags: meta.tags || [],
      created: f.getDateCreated().getTime(),
    });
  }
  return out.sort((a, b) => b.created - a.created);
}

function uploadPhoto_(body) {
  const folder = _sub(CFG.PHOTOS_SUBFOLDER);
  const blob = Utilities.newBlob(Utilities.base64Decode(body.data_b64), body.type || 'image/jpeg', body.name);
  const file = folder.createFile(blob);
  // Tag with Gemini Vision
  const tags = _autoTagPhoto(file);
  file.setDescription(JSON.stringify({ tags, caption: '' }));
  return { ok: true, id: file.getId() };
}

function _autoTagPhoto(file) {
  try {
    const b64 = Utilities.base64Encode(file.getBlob().getBytes());
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${CFG.GEMINI_API_KEY}`;
    const r = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{
          parts: [
            { text: 'תייג את התמונה הבאה ב-3-6 תגים בעברית, מתאימים לעיתון קהילה דתי. החזר רק רשימה מופרדת בפסיקים, ללא הסבר.' },
            { inline_data: { mime_type: file.getMimeType(), data: b64 } },
          ],
        }],
      }),
      muteHttpExceptions: true,
    });
    const data = JSON.parse(r.getContentText());
    const text = (data.candidates && data.candidates[0].content.parts[0].text) || '';
    return text.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
  } catch (e) {
    return [];
  }
}

// ===== PDF EXPORT =====
function exportPdf_(body) {
  const folder = _sub(CFG.PDF_SUBFOLDER);
  const doc = DocumentApp.create(body.title || 'כתבה');
  const docBody = doc.getBody();
  if (body.title) docBody.appendParagraph(body.title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  const plain = (body.body || '').replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  docBody.appendParagraph(plain);
  doc.saveAndClose();
  const docFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = docFile.getAs('application/pdf');
  const pdf = folder.createFile(pdfBlob);
  pdf.setName((body.title || 'כתבה') + '.pdf');
  docFile.setTrashed(true);
  return { ok: true, url: pdf.getUrl() };
}
