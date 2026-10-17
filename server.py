"""Classroom server. Python 3.10+, standard library only."""
import csv, hashlib, hmac, io, json, os, secrets, sqlite3, time
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('DATA_DIR', str(ROOT / 'data')))
DATA.mkdir(parents=True, exist_ok=True)
PASSWORD = os.environ.get('TEACHER_PASSWORD') or secrets.token_urlsafe(12)
SESSIONS = {}
def db():
    c = sqlite3.connect(DATA / 'classroom.sqlite', timeout=20)
    c.row_factory = sqlite3.Row
    return c
with db() as c:
    c.executescript('''
    CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,title TEXT,active INTEGER,created REAL);
    CREATE TABLE IF NOT EXISTS groups(room TEXT,num INTEGER,token TEXT,state TEXT,seen REAL,PRIMARY KEY(room,num));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,room TEXT,num INTEGER,time REAL,state TEXT);
    ''')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send(self, status, body, kind='application/json; charset=utf-8'):
        if not isinstance(body, bytes): body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)
    def teacher(self):
        token = self.headers.get('Authorization', '').removeprefix('Bearer ')
        return SESSIONS.get(token, 0) > time.time()
    def do_GET(self):
        path = self.path.split('?')[0]
        files = {'/':'index.html','/teacher':'teacher.html','/student':'student.html','/sync.js':'sync.js','/teacher-chart.js':'teacher-chart.js','/style.css':'style.css'}
        if path in files:
            p = ROOT / 'public' / files[path]
            kind = 'text/javascript' if p.suffix == '.js' else 'text/css' if p.suffix == '.css' else 'text/html'
            return self.send(200, p.read_bytes(), kind + '; charset=utf-8')
        if path.startswith('/api/rooms/'):
            if not self.teacher(): return self.send(401, {'error':'교사 로그인이 필요합니다.'})
            parts = path.split('/')
            code = parts[3]
            with db() as c:
                room = c.execute('SELECT * FROM rooms WHERE code=?',(code,)).fetchone()
                if not room: return self.send(404, {'error':'수업을 찾을 수 없습니다.'})
                groups = [dict(r) for r in c.execute('SELECT num,state,seen FROM groups WHERE room=? ORDER BY num',(code,))]
                for g in groups: g['state'] = json.loads(g['state'])
                if len(parts)>4 and parts[4]=='export':
                    records = [dict(r) for r in c.execute('SELECT num,time,state FROM events WHERE room=? ORDER BY id',(code,))]
                    for r in records: r['state']=json.loads(r['state'])
                    return self.send(200, {'room':dict(room),'groups':groups,'history':records})
                return self.send(200, {'room':dict(room),'groups':groups,'now':time.time()})
        self.send(404, {'error':'주소를 확인하세요.'})
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 100000: return self.send(413, {'error':'요청 크기 초과'})
            x = json.loads(self.rfile.read(length))
            if not isinstance(x,dict): raise ValueError()
            self.post(x)
        except (ValueError, KeyError, TypeError): self.send(400, {'error':'입력값을 확인하세요.'})
        except sqlite3.Error: self.send(503, {'error':'저장 중 오류가 발생했습니다. 다시 시도하세요.'})
    def post(self,x):
        path = self.path
        now = time.time()
        if path=='/api/login':
            if not hmac.compare_digest(str(x.get('password','')).encode(),PASSWORD.encode()):
                time.sleep(0.5)
                return self.send(403, {'error':'교사 비밀번호가 다릅니다.'})
            token=secrets.token_urlsafe(32); SESSIONS[token]=now+43200
            return self.send(200, {'token':token})
        if path in ('/api/create','/api/close'):
            if not self.teacher(): return self.send(401, {'error':'다시 로그인하세요.'})
            with db() as c:
                if path=='/api/create':
                    while True:
                        code=str(secrets.randbelow(900000)+100000)
                        if not c.execute('SELECT 1 FROM rooms WHERE code=?',(code,)).fetchone(): break
                    c.execute('INSERT INTO rooms VALUES(?,?,1,?)',(code,str(x.get('title','전압과 전류 실험'))[:80],now))
                else:
                    code=str(x['code']); c.execute('UPDATE rooms SET active=0 WHERE code=?',(code,))
            return self.send(200, {'code':code})
        code=str(x['code']); num=int(x['group'])
        if num not in range(1,7): raise ValueError()
        with db() as c:
            # Serialize group claims and updates to avoid duplicate ownership.
            c.execute('BEGIN IMMEDIATE')
            room=c.execute('SELECT active FROM rooms WHERE code=?',(code,)).fetchone()
            if not room or not room['active']: return self.send(409, {'error':'참여 코드를 확인하세요. 종료된 수업에는 참여할 수 없습니다.'})
            g=c.execute('SELECT * FROM groups WHERE room=? AND num=?',(code,num)).fetchone()
            token=str(x.get('token',''))
            if path=='/api/join':
                if g and not hmac.compare_digest(g['token'],token): return self.send(409, {'error':'이미 다른 기기에서 사용 중인 조입니다. 다른 조를 선택하세요.'})
                if not g:
                    token=secrets.token_urlsafe(32)
                    c.execute('INSERT INTO groups VALUES(?,?,?,?,?)',(code,num,token,'{}',now))
                return self.send(200, {'token':token,'state':json.loads(g['state']) if g else {}})
            if path!='/api/update': return self.send(404, {'error':'알 수 없는 요청'})
            if not g or not hmac.compare_digest(g['token'],token): return self.send(403, {'error':'모둠 참여를 다시 확인하세요.'})
            s=x['state']
            if not isinstance(s,dict): raise ValueError()
            clean={k:str(s.get(k,''))[:2000] for k in ('voltage','current','status','answer1','answer2')}
            clean['step']=max(0,min(6,int(s.get('step',0))))
            clean['connected']=bool(s.get('connected'))
            points=s.get('points',[])
            if not isinstance(points,list): raise ValueError()
            clean['points']=[{'x':float(p['x']),'y':float(p['y'])} for p in points[:1000]]
            if any(not (-1e6 < p[a] < 1e6) for p in clean['points'] for a in ('x','y')): raise ValueError()
            encoded=json.dumps(clean,ensure_ascii=False,allow_nan=False)
            c.execute('UPDATE groups SET state=?,seen=? WHERE room=? AND num=?',(encoded,now,code,num))
            # Keep changes to records, calibration/status and answers, rather than every sensor tick.
            prev=json.loads(g['state'])
            keys=('step','points','answer1','answer2','status')
            if any(prev.get(k)!=clean.get(k) for k in keys):
                c.execute('INSERT INTO events(room,num,time,state) VALUES(?,?,?,?)',(code,num,now,encoded))
        self.send(200, {'ok':True})

if __name__=='__main__':
    port=int(os.environ.get('PORT','8000'))
    print(f'교사용: http://localhost:{port}/teacher',flush=True)
    print(f'교사 비밀번호: {PASSWORD}',flush=True)
    print('학생 센서 연결에는 HTTPS 주소가 필요합니다. 사용안내.md를 확인하세요.',flush=True)
    ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
