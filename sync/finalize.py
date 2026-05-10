"""Finalize migration: update feed with Drive URLs, copy media map, regen suggestions."""
import os, sys, json, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, 'data')
sys.path.insert(0, HERE)

# Load drive map
drive_map = json.load(open(os.path.join(HERE, '_drive_map.json'), encoding='utf-8'))
print(f'drive map: {len(drive_map)} files')

# Update feed.json
feed_path = os.path.join(DATA, 'feed.json')
feed = json.load(open(feed_path, encoding='utf-8'))
items = feed.get('items', [])
updated = 0
for it in items:
    for a in (it.get('attachments') or []):
        nm = a.get('name', '')
        if nm in drive_map:
            info = drive_map[nm]
            a['url'] = info.get('direct') or f"https://drive.google.com/uc?id={info['id']}"
            a['view_url'] = info.get('view') or f"https://drive.google.com/file/d/{info['id']}/view"
            a['kind'] = info.get('kind', 'other')
            a['drive_id'] = info['id']
            updated += 1
json.dump(feed, open(feed_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'feed.json: updated {updated} attachment URLs')

# Copy drive map to data/media.json (for frontend)
shutil.copy(os.path.join(HERE, '_drive_map.json'), os.path.join(DATA, 'media.json'))
print('media.json: copied')

# Copy voice transcripts
src_t = os.path.join(DATA, 'voice_transcripts.json')
if os.path.exists(src_t):
    print(f'voice_transcripts.json already in data/ ({os.path.getsize(src_t)} bytes)')

# Generate suggestions
import whatsapp_sync as ws
suggestions = ws.generate_suggestions(items)
sg = {'suggestions': suggestions, 'updated': __import__('time').strftime('%Y-%m-%dT%H:%M:%S')}
json.dump(sg, open(os.path.join(DATA, 'suggestions.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print(f'suggestions.json: {len(suggestions)} ideas')
print('FINALIZE OK')
