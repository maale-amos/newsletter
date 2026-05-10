"""Live sync: WhatsApp group "מעלה 2026" -> GitHub repo data files.

Polls localhost:47830 (whatsapp-web.js bridge) every 5 minutes.
For new messages: classify with Gemini, save photos as files, commit JSON.

The frontend GitHub Pages site reads data/feed.json + photos/ + drafts.json
and displays a live mirror of the group with AI-tagged search.
"""
import os, sys, json, time, base64, hashlib
import urllib.request, urllib.parse, urllib.error
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(HERE)
DATA_DIR = os.path.join(REPO_DIR, 'data')
PHOTOS_DIR = os.path.join(DATA_DIR, 'photos')
STATE_FILE = os.path.join(HERE, '_sync_state.json')
LOG_FILE = os.path.join(HERE, '_sync.log')

CHAT_NAME = 'מעלה 2026'
WA_API = 'http://localhost:47830'
GEMINI_KEY = 'AIzaSyBCnR51JT8mp2_f9j8-OBq5jth-xbXydyI'
GEMINI_MODEL = 'gemini-2.0-flash'
POLL_SECS = 300

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PHOTOS_DIR, exist_ok=True)


def log(msg):
    line = f'[{time.strftime("%Y-%m-%d %H:%M:%S")}] {msg}'
    print(line, flush=True)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass


def load_state():
    if os.path.exists(STATE_FILE):
        try: return json.load(open(STATE_FILE, encoding='utf-8'))
        except Exception: pass
    return {'seen_ids': []}


def save_state(s):
    s['seen_ids'] = sorted(set(s['seen_ids']))[-2000:]
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(s, f, ensure_ascii=False, indent=2)


def fetch_messages():
    q = urllib.parse.quote(CHAT_NAME)
    url = f'{WA_API}/messages?chat={q}&limit=200'
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read()).get('messages', [])
    except Exception as e:
        log(f'fetch err: {e}')
        return []


def gemini_classify(text):
    """Return tags + summary (Hebrew). One sentence summary, 3-6 tags."""
    if not text or len(text.strip()) < 5:
        return {'summary': text[:200], 'tags': []}
    prompt = (
        'תייג ותסכם את ההודעה הבאה בעברית. החזר JSON תקין בלבד עם:\n'
        '  summary: משפט אחד מתאר את ההודעה\n'
        '  tags: 3-6 תגים בעברית (אירועים, נושאים, אנשים, מקומות)\n'
        '  category: אחד מ: כתבה, תמונות, מסמך, שאלה, תיאום, אחר\n\n'
        f'ההודעה:\n{text[:1000]}\n\nJSON בלבד:'
    )
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}'
    try:
        data = json.dumps({'contents': [{'parts': [{'text': prompt}]}]}).encode()
        req = urllib.request.Request(url, data=data, method='POST',
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read())
        out = j['candidates'][0]['content']['parts'][0]['text']
        # Extract JSON from response (may be wrapped in ```json...```)
        out = out.strip()
        if out.startswith('```'):
            out = out.split('```')[1]
            if out.startswith('json'): out = out[4:]
        return json.loads(out.strip())
    except Exception as e:
        log(f'gemini err: {e}')
        return {'summary': text[:200], 'tags': [], 'category': 'אחר'}


def detect_links(text):
    """Find Google Docs, PDFs, YouTube, etc."""
    import re
    links = []
    for m in re.finditer(r'https?://[^\s]+', text):
        url = m.group(0).rstrip('.,);')
        kind = 'link'
        if 'docs.google.com/document' in url: kind = 'gdoc'
        elif 'docs.google.com/spreadsheets' in url: kind = 'gsheet'
        elif 'drive.google.com' in url: kind = 'gdrive'
        elif url.endswith('.pdf'): kind = 'pdf'
        elif 'youtube.com' in url or 'youtu.be' in url: kind = 'video'
        links.append({'url': url, 'kind': kind})
    return links


def sync_once():
    state = load_state()
    seen = set(state.get('seen_ids', []))
    msgs = fetch_messages()
    if not msgs:
        return 0
    feed_path = os.path.join(DATA_DIR, 'feed.json')
    feed = []
    if os.path.exists(feed_path):
        try: feed = json.load(open(feed_path, encoding='utf-8')).get('items', [])
        except Exception: pass
    new_count = 0
    for m in msgs:
        # Stable id from timestamp + body hash (since bridge id format varies)
        body = (m.get('body') or '')
        ts = m.get('timestamp', 0)
        mid = hashlib.md5(f'{ts}|{body[:80]}'.encode('utf-8')).hexdigest()[:16]
        if mid in seen: continue
        item = {
            'id': mid,
            'time': ts,
            'time_iso': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(ts)) if ts else '',
            'from_me': bool(m.get('fromMe')),
            'text': body[:1500],
            'links': detect_links(body),
            'has_media': False,  # bridge's plain /messages doesn't return media; future enhancement
        }
        # AI tagging (best-effort, skip if fails)
        ai = gemini_classify(body) if body and len(body.strip()) > 8 else {}
        item['summary'] = ai.get('summary', body[:200])
        item['tags'] = ai.get('tags', [])
        item['category'] = ai.get('category', 'אחר')
        feed.append(item)
        seen.add(mid)
        new_count += 1
        log(f"+ {item['category']} | {item['summary'][:60]} | tags={item['tags']}")
    if new_count == 0:
        return 0
    # Sort by time descending (newest first)
    feed.sort(key=lambda x: x.get('time', 0), reverse=True)
    feed = feed[:500]  # cap
    json.dump({'items': feed, 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')},
              open(feed_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    state['seen_ids'] = list(seen)
    save_state(state)
    log(f'feed.json updated with {new_count} new items (total {len(feed)})')

    # Generate article suggestions based on recent activity
    try:
        suggestions = generate_suggestions(feed)
        sg_path = os.path.join(DATA_DIR, 'suggestions.json')
        json.dump({'suggestions': suggestions, 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')},
                  open(sg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        log(f'suggestions.json updated with {len(suggestions)} ideas')
    except Exception as e:
        log(f'suggestions err: {e}')

    # Commit to git
    try:
        subprocess.run(['git', '-C', REPO_DIR, 'add', 'data/feed.json', 'data/suggestions.json'],
                       capture_output=True, timeout=20)
        r = subprocess.run(['git', '-C', REPO_DIR, 'commit', '-m', f'sync: +{new_count} items'],
                           capture_output=True, text=True, timeout=20)
        if 'nothing to commit' not in (r.stdout + r.stderr).lower():
            subprocess.run(['git', '-C', REPO_DIR, 'push'], capture_output=True, timeout=60)
            log('pushed to repo')
    except Exception as e:
        log(f'git err: {e}')
    return new_count


def generate_suggestions(feed):
    """Use Gemini to suggest articles based on recent group activity."""
    recent = feed[:30]
    digest = '\n'.join([
        f"[{it.get('category','אחר')}] {it.get('summary', it.get('text',''))[:200]}"
        for it in recent if it.get('summary') or it.get('text')
    ])
    if not digest:
        return []
    prompt = (
        'הנה תקציר פעילות אחרונה בקבוצת ועד התקשורת של היישוב מעלה עמוס:\n\n'
        f'{digest[:4000]}\n\n'
        'הצע 5 כתבות מעניינות לעיתון הקהילתי, בהתבסס על השיחות. '
        'לכל הצעה החזר JSON עם: title (כותרת קצרה), angle (זווית הכתבה, משפט אחד), '
        'category (אחד מ: ביטחון, תשתיות, אירועים, חינוך, תורה, פרסומים, אחר), '
        'outline (תוכן עניינים HTML עם <ul><li>... 4-6 פסקות), '
        'based_on (משפט מסביר על איזו שיחה זה מבוסס).\n\n'
        'החזר JSON תקין בלבד עם מפתח "suggestions" ובו רשימה של 5 הצעות:'
    )
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}'
    try:
        data = json.dumps({'contents': [{'parts': [{'text': prompt}]}],
                           'generationConfig': {'response_mime_type': 'application/json'}}).encode()
        req = urllib.request.Request(url, data=data, method='POST',
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.loads(r.read())
        out = j['candidates'][0]['content']['parts'][0]['text'].strip()
        if out.startswith('```'):
            out = out.split('```')[1]
            if out.startswith('json'): out = out[4:]
        parsed = json.loads(out.strip())
        return parsed.get('suggestions', [])[:8] if isinstance(parsed, dict) else parsed[:8]
    except Exception as e:
        log(f'gemini suggestions err: {e}')
        return []


def main():
    log(f'whatsapp_sync starting — chat: {CHAT_NAME}, poll {POLL_SECS}s')
    while True:
        try:
            sync_once()
        except Exception as e:
            log(f'tick err: {e}')
        time.sleep(POLL_SECS)


if __name__ == '__main__':
    main()
