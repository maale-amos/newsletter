"""One-time: re-tag existing feed items using gemini-2.0-flash + regen suggestions."""
import os, sys, json, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import whatsapp_sync as ws

DATA_DIR = os.path.join(os.path.dirname(HERE), 'data')
feed_path = os.path.join(DATA_DIR, 'feed.json')
data = json.load(open(feed_path, encoding='utf-8'))
items = data.get('items', [])
print(f'retagging {len(items)} items...')
for i, it in enumerate(items):
    if it.get('tags'):
        continue
    text = it.get('text') or it.get('summary') or ''
    if not text or len(text.strip()) < 8: continue
    ai = ws.gemini_classify(text)
    it['summary'] = ai.get('summary', text[:200])
    it['tags'] = ai.get('tags', [])
    it['category'] = ai.get('category', it.get('category', 'אחר'))
    print(f'  [{i+1}/{len(items)}] {it["category"]}: {it["summary"][:60]}')
    time.sleep(0.5)  # rate limit safety

json.dump({'items': items, 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')},
          open(feed_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('feed.json updated')

print('generating suggestions...')
suggestions = ws.generate_suggestions(items)
sg_path = os.path.join(DATA_DIR, 'suggestions.json')
json.dump({'suggestions': suggestions, 'updated': time.strftime('%Y-%m-%dT%H:%M:%S')},
          open(sg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'suggestions: {len(suggestions)}')

import subprocess
REPO = os.path.dirname(HERE)
subprocess.run(['git', '-C', REPO, 'add', 'data/feed.json', 'data/suggestions.json'])
subprocess.run(['git', '-C', REPO, 'commit', '-m', 'retag: AI-classified feed + 5 suggestions'])
subprocess.run(['git', '-C', REPO, 'push'])
print('pushed')
