"""One-time import: parse WhatsApp export _chat.txt + upload all media."""
import os, re, json, shutil, hashlib, time
from PIL import Image
import io

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.join(HERE, '_export')
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, 'data')
PHOTOS = os.path.join(DATA, 'photos')
DOCS = os.path.join(DATA, 'docs')
VOICE = os.path.join(DATA, 'voice')
VIDEOS = os.path.join(DATA, 'videos')
for d in [PHOTOS, DOCS, VOICE, VIDEOS]: os.makedirs(d, exist_ok=True)


def find_chat_file():
    for f in os.listdir(EXPORT):
        if f.endswith('.txt'):
            return os.path.join(EXPORT, f)
    raise FileNotFoundError('no chat .txt')


# Format: DD.MM.YYYY, HH:MM - SENDER: MESSAGE
MSG_RE = re.compile(r'^(\d{1,2}\.\d{1,2}\.\d{4}), (\d{1,2}:\d{2}) - (?:‏)?([^:]+?): (.*)$')
SYS_RE = re.compile(r'^(\d{1,2}\.\d{1,2}\.\d{4}), (\d{1,2}:\d{2}) - (?:‏)?(.+)$')
ATTACH_RE = re.compile(r'(?:‏)?([^\n<>]+?\.(?:jpg|jpeg|png|webp|pdf|opus|mp3|mp4|mov|m4a|docx?|xlsx?))\s*\(קובץ מצורף\)|<attached: ([^>]+)>')


def parse_chat(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    lines = text.split('\n')
    messages = []
    current = None
    for line in lines:
        m = MSG_RE.match(line)
        if m:
            if current: messages.append(current)
            d, t, sender, body = m.groups()
            current = {'date': d, 'time': t, 'sender': sender.strip(), 'body': body, 'attachments': []}
        else:
            sm = SYS_RE.match(line)
            if sm and current is None:
                # System message
                d, t, body = sm.groups()
                messages.append({'date': d, 'time': t, 'sender': '__system__', 'body': body, 'attachments': []})
            elif current:
                current['body'] += '\n' + line
    if current: messages.append(current)
    # Detect attachments + clean body
    for m in messages:
        for am in ATTACH_RE.finditer(m['body']):
            attach = am.group(1) or am.group(2)
            m['attachments'].append(attach.strip())
        m['body'] = ATTACH_RE.sub('', m['body']).strip()
    return messages


def to_iso(date_str, time_str):
    d = date_str.split('.')
    return f"{d[2]}-{int(d[1]):02d}-{int(d[0]):02d}T{time_str}:00"


def process_media(messages):
    """Copy/resize media into repo data dirs, build manifest."""
    seen = set()
    media_map = {}  # original name -> repo path
    for m in messages:
        for fn in m['attachments']:
            if fn in seen: continue
            seen.add(fn)
            src = os.path.join(EXPORT, fn)
            if not os.path.exists(src): continue
            ext = fn.lower().rsplit('.', 1)[-1] if '.' in fn else ''
            if ext in ('jpg', 'jpeg', 'png', 'webp'):
                # Resize to max 1400px
                try:
                    img = Image.open(src)
                    img.thumbnail((1400, 1400), Image.LANCZOS)
                    out = os.path.join(PHOTOS, fn.rsplit('.',1)[0] + '.jpg')
                    if img.mode != 'RGB': img = img.convert('RGB')
                    img.save(out, 'JPEG', quality=85, optimize=True)
                    media_map[fn] = 'data/photos/' + os.path.basename(out)
                except Exception as e:
                    print(f'photo err {fn}: {e}')
            elif ext == 'pdf':
                shutil.copy(src, os.path.join(DOCS, fn))
                media_map[fn] = 'data/docs/' + fn
            elif ext == 'opus':
                shutil.copy(src, os.path.join(VOICE, fn))
                media_map[fn] = 'data/voice/' + fn
            elif ext in ('mp4', 'mov'):
                size = os.path.getsize(src)
                if size < 95 * 1024 * 1024:
                    shutil.copy(src, os.path.join(VIDEOS, fn))
                    media_map[fn] = 'data/videos/' + fn
                else:
                    print(f'  skipping large video {fn} ({size/1024/1024:.1f}MB)')
            elif ext in ('docx', 'doc'):
                shutil.copy(src, os.path.join(DOCS, fn))
                media_map[fn] = 'data/docs/' + fn
    return media_map


def build_feed(messages, media_map):
    items = []
    for m in messages:
        if m['sender'] == '__system__':
            continue
        ts = to_iso(m['date'], m['time'])
        body = m['body']
        atts = []
        for fn in m['attachments']:
            if fn in media_map:
                atts.append({'name': fn, 'url': media_map[fn]})
        # Stable id
        mid = hashlib.md5(f"{ts}|{m['sender']}|{body[:80]}|{','.join(m['attachments'])}".encode('utf-8')).hexdigest()[:16]
        items.append({
            'id': mid,
            'time_iso': ts,
            'time': int(time.mktime(time.strptime(ts, '%Y-%m-%dT%H:%M:%S'))),
            'sender': m['sender'],
            'text': body[:2000],
            'attachments': atts,
            'tags': [], 'category': '', 'summary': '',
        })
    items.sort(key=lambda x: x['time'], reverse=True)
    return items


def main():
    chat = find_chat_file()
    print(f'parsing {chat}...')
    messages = parse_chat(chat)
    print(f'  {len(messages)} messages')
    print('processing media...')
    media_map = process_media(messages)
    print(f'  {len(media_map)} media files imported')
    feed = build_feed(messages, media_map)
    print(f'  {len(feed)} feed items')
    json.dump({'items': feed, 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')},
              open(os.path.join(DATA, 'feed.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    # Save all-known message IDs to sync state so live sync doesn't re-add
    state_path = os.path.join(HERE, '_sync_state.json')
    json.dump({'seen_ids': [it['id'] for it in feed]},
              open(state_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'feed.json + state written')
    print(f'total media in repo:')
    print(f'  photos: {len(os.listdir(PHOTOS))}')
    print(f'  docs:   {len(os.listdir(DOCS))}')
    print(f'  voice:  {len(os.listdir(VOICE))}')
    print(f'  videos: {len(os.listdir(VIDEOS))}')


if __name__ == '__main__':
    main()
