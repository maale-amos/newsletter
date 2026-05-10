"""Local AI server on :47831 — proxies to local Claude Code CLI.
The maale-newsletter website calls this instead of Gemini.
Browsers treat http://localhost as secure context, so https github.io
pages can fetch from here without mixed-content blocking.
"""
import asyncio, os, sys, json, subprocess, time
from aiohttp import web

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, '_local_ai.log')
PORT = 47831
CLAUDE_BIN = r'C:\openclaw-app\claude.cmd'
TIMEOUT = 90

PROMPTS = {
    'proofread':      'הגה את הטקסט הבא בעברית מדוקדקת. תקן שגיאות כתיב/דקדוק/פיסוק. השאר את התוכן זהה. החזר רק את הטקסט המתוקן (ללא הערות):',
    'shorten':        'קצר את הטקסט הבא לכ-50% מאורכו, שמור על המסר העיקרי. סגנון תורני-קהילתי. החזר רק את הטקסט:',
    'expand':         'הרחב את הטקסט הבא והוסף פרטים, רקע, ציטוטים אפשריים. סגנון תורני-קהילתי לעיתון יישוב. החזר רק את הטקסט:',
    'suggest_photos': 'הצע 5 רעיונות לאילוסטרציה/תמונה לכתבה הבאה. לכל הצעה תאר ב-2 משפטים. רשימה ממוספרת:',
    'catchy_title':   'הצע 5 כותרות קליטות לכתבה הבאה. סגנון עיתון קהילתי, ענייני אך מושך. רק הכותרות, אחת בשורה:',
    'classify':       'תייג ותסכם את ההודעה הבאה בעברית. החזר JSON תקין עם summary (משפט אחד), tags (מערך של 3-6 תגים), category (כתבה/תמונות/מסמך/שאלה/תיאום/אחר). JSON בלבד:',
    'generate_suggestions': 'הצע 5 כתבות מעניינות לעיתון הקהילתי של מעלה עמוס בהתבסס על הסיכום הזה של פעילות הקבוצה. החזר JSON עם מפתח suggestions שמכיל מערך של 5 הצעות, לכל אחת: title, angle, category (ביטחון/תשתיות/אירועים/חינוך/תורה/פרסומים/אחר), outline (HTML), based_on. JSON בלבד:',
}


def log(msg):
    line = f'[{time.strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception: pass


def claude_call(prompt, timeout=TIMEOUT):
    """Call claude.cmd with the prompt, return text answer."""
    cmd = [CLAUDE_BIN, '-p', '--permission-mode', 'bypassPermissions',
           '--model', 'claude-haiku-4-5', '--output-format', 'text', prompt]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=timeout, encoding='utf-8', errors='ignore')
        return (r.stdout or '').strip()
    except subprocess.TimeoutExpired:
        log(f'timeout after {timeout}s')
        return ''
    except Exception as e:
        log(f'claude err: {e}')
        return ''


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}


async def cors_options(request):
    return web.Response(headers=CORS)


async def health(request):
    return web.json_response({'ok': True, 'service': 'local_ai_server', 'time': time.time()},
                            headers=CORS)


async def assist(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({'ok': False, 'error': 'invalid json'}, status=400, headers=CORS)
    kind = body.get('kind', 'proofread')
    text = body.get('text', '')
    if not text:
        return web.json_response({'ok': False, 'error': 'missing text'}, status=400, headers=CORS)
    prompt_template = PROMPTS.get(kind, PROMPTS['proofread'])
    full_prompt = prompt_template + '\n\n' + text[:6000]
    log(f'assist {kind} ({len(text)} chars)')
    answer = claude_call(full_prompt)
    if not answer:
        return web.json_response({'ok': False, 'error': 'empty response'}, status=502, headers=CORS)
    return web.json_response({'ok': True, 'kind': kind, 'result': answer}, headers=CORS)


async def main():
    app = web.Application()
    app.router.add_get('/health', health)
    app.router.add_post('/assist', assist)
    app.router.add_route('OPTIONS', '/{path:.*}', cors_options)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', PORT)
    await site.start()
    log(f'local AI server listening on http://127.0.0.1:{PORT}')
    log(f'  GET  /health')
    log(f'  POST /assist {{kind, text}}')
    while True: await asyncio.sleep(60)


if __name__ == '__main__':
    asyncio.run(main())
