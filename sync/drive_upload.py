"""Upload all WhatsApp export media to Drive folder. Transcribe voice notes.
Replace local repo paths with Drive URLs in feed.json so the repo stays small.

Drive structure:
  מעלה-עמוס-עיתון/
    תמונות/    (public share - anyone with link)
    מסמכים/    (public share)
    קוליות/    (public share)
    סרטונים/   (public share)
"""
import os, sys, json, time, subprocess, base64
import urllib.request, urllib.parse, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.join(HERE, '_export')
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, 'data')

CLIENT_ID = os.environ.get('GOAUTH_CLIENT_ID', '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com')
CLIENT_SECRET = os.environ.get('GOAUTH_CLIENT_SECRET')
REFRESH_TOKEN = os.environ.get('GOAUTH_REFRESH_TOKEN')

ROOT_FOLDER_NAME = 'מעלה-עמוס-עיתון'
SUBFOLDERS = {
    'photos': 'תמונות',
    'docs': 'מסמכים',
    'voice': 'קוליות',
    'videos': 'סרטונים',
}
WHISPER_BIN = r'C:\whisper\bin\Release\whisper-cli.exe'
WHISPER_MODEL = r'C:\whisper\ggml-medium.bin'


def get_token():
    data = urllib.parse.urlencode({
        'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
        'refresh_token': REFRESH_TOKEN, 'grant_type': 'refresh_token',
    }).encode()
    with urllib.request.urlopen(
        urllib.request.Request('https://oauth2.googleapis.com/token', data=data),
        timeout=20) as r:
        return json.loads(r.read())['access_token']


def drive_search_folder(token, name, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id: q += f" and '{parent_id}' in parents"
    url = 'https://www.googleapis.com/drive/v3/files?' + urllib.parse.urlencode({
        'q': q, 'fields': 'files(id,name)',
    })
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=15) as r:
        files = json.loads(r.read()).get('files', [])
    return files[0]['id'] if files else None


def drive_create_folder(token, name, parent_id=None):
    body = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id: body['parents'] = [parent_id]
    req = urllib.request.Request(
        'https://www.googleapis.com/drive/v3/files',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())['id']


def drive_share_anyone(token, file_id):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}/permissions',
        data=json.dumps({'role': 'reader', 'type': 'anyone'}).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except Exception: return False


def drive_upload(token, local_path, name, parent_id, mime='application/octet-stream'):
    """Multipart upload to Drive. Returns file id."""
    boundary = '----d' + str(int(time.time() * 1000))
    metadata = json.dumps({'name': name, 'parents': [parent_id]}).encode()
    body = (
        f'--{boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n'
    ).encode() + metadata + (
        f'\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n'
    ).encode() + open(local_path, 'rb').read() + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
        data=body, method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': f'multipart/related; boundary={boundary}',
        },
    )
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            return {'error': e.read().decode('utf-8', 'replace')[:300]}
        except Exception as e:
            last_err = str(e)
            time.sleep(2 * (attempt + 1))
    return {'error': last_err or 'unknown'}


def transcribe_opus(opus_path):
    """whisper.cpp on opus. Returns Hebrew text or empty."""
    try:
        # Convert opus to wav 16khz mono
        wav = opus_path.rsplit('.', 1)[0] + '_tmp.wav'
        subprocess.run(['ffmpeg', '-y', '-i', opus_path, '-ar', '16000', '-ac', '1', wav],
                       capture_output=True, timeout=60)
        if not os.path.exists(wav): return ''
        r = subprocess.run([WHISPER_BIN, '-m', WHISPER_MODEL, '-l', 'he', '-nt', '-f', wav],
                          capture_output=True, text=True, timeout=120, encoding='utf-8', errors='ignore')
        try: os.remove(wav)
        except: pass
        return (r.stdout or '').strip()
    except Exception as e:
        print(f'transcribe err {opus_path}: {e}')
        return ''


def main():
    if not REFRESH_TOKEN:
        print('ERROR: missing GOAUTH_REFRESH_TOKEN env var')
        sys.exit(1)
    token = get_token()
    print('token ok')

    # Create root folder
    root_id = drive_search_folder(token, ROOT_FOLDER_NAME)
    if not root_id:
        root_id = drive_create_folder(token, ROOT_FOLDER_NAME)
        print(f'created root folder: {root_id}')
    else:
        print(f'using existing root: {root_id}')
    # NOT sharing — folder stays private to user only

    # Create subfolders
    sub_ids = {}
    for key, hebrew in SUBFOLDERS.items():
        sid = drive_search_folder(token, hebrew, root_id)
        if not sid:
            sid = drive_create_folder(token, hebrew, root_id)
        sub_ids[key] = sid
    print('subfolders ready:', list(sub_ids.keys()))

    # Build map of attachment name -> local file in _export
    local_map = {}
    for fn in os.listdir(EXPORT):
        local_map[fn] = os.path.join(EXPORT, fn)

    # Existing uploaded map (resume support)
    map_file = os.path.join(HERE, '_drive_map.json')
    drive_map = {}
    if os.path.exists(map_file):
        drive_map = json.load(open(map_file, encoding='utf-8'))

    # Upload originals
    transcripts = {}
    transcripts_file = os.path.join(DATA, 'voice_transcripts.json')
    if os.path.exists(transcripts_file):
        transcripts = json.load(open(transcripts_file, encoding='utf-8'))

    cnt = 0
    for fn, local in local_map.items():
        if fn.endswith('.txt') or fn in drive_map:
            continue
        ext = fn.lower().rsplit('.', 1)[-1] if '.' in fn else ''
        if ext in ('jpg', 'jpeg', 'png', 'webp'): kind, mime = 'photos', 'image/jpeg'
        elif ext == 'pdf': kind, mime = 'docs', 'application/pdf'
        elif ext == 'opus': kind, mime = 'voice', 'audio/opus'
        elif ext in ('mp4', 'mov'): kind, mime = 'videos', 'video/mp4'
        elif ext in ('docx', 'doc', 'xlsx'): kind, mime = 'docs', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else: continue

        result = drive_upload(token, local, fn, sub_ids[kind], mime)
        if 'id' in result:
            drive_map[fn] = {
                'id': result['id'],
                'kind': kind,
                'view': f"https://drive.google.com/file/d/{result['id']}/view",
                'direct': f"https://drive.google.com/uc?id={result['id']}",
            }
            cnt += 1
            print(f'  [{cnt}] {kind}: {fn}')
        else:
            print(f'  ERR {fn}: {result.get("error","?")[:100]}')

        # Transcribe voice notes inline
        if kind == 'voice' and fn not in transcripts:
            t = transcribe_opus(local)
            transcripts[fn] = t
            print(f'    transcribed: {t[:60]}')

        # Save progress every 10 files
        if cnt % 10 == 0:
            json.dump(drive_map, open(map_file, 'w', encoding='utf-8'),
                     ensure_ascii=False, indent=2)
            json.dump(transcripts, open(transcripts_file, 'w', encoding='utf-8'),
                     ensure_ascii=False, indent=2)
            try: token = get_token()  # refresh token periodically
            except: pass

    json.dump(drive_map, open(map_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    json.dump(transcripts, open(transcripts_file, 'w', encoding='utf-8'),
             ensure_ascii=False, indent=2)
    print(f'done. {len(drive_map)} files on Drive, {len(transcripts)} transcripts.')


if __name__ == '__main__':
    main()
