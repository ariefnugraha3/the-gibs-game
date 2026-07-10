#!/usr/bin/env python3
# server.py — server pengembangan "Gibran vs Zombie 3D" (lihat
# IMPROVEMENT-MULTIPLAYER-PLAN.md Fase 0):
#   1) HTTP statis di :8000  — pengganti `python -m http.server 8000`
#   2) Relay WebSocket co-op LAN di :8001 (room BERNAMA, host-authoritative)
#
# Stdlib MURNI — tanpa pip, tanpa dependency. Jalankan:
#   python server.py [http_port] [ws_port]
#
# Relay ini BODOH terhadap aturan game: ia hanya mem-parse pesan kontrol lobby
# (`create` / `join` / `lock`) untuk mengelola registry room bernama; semua
# pesan lain diteruskan di DALAM room: client -> host (ditambah `from`),
# host -> satu client (`to`) / broadcast semua client room (tanpa `to`).

import base64
import hashlib
import json
import os
import socket
import socketserver
import struct
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
HTTP_PORT = 8000
WS_PORT = 8001
MAX_PLAYERS = 4

# Port & maxPlayers ikut config/gameplay.json seksi "net" bila ada (satu
# sumber kebenaran dgn game); argv menimpa (dipakai skrip uji).
try:
    with open(os.path.join(ROOT, 'config', 'gameplay.json'), 'r', encoding='utf-8') as _f:
        _net = json.load(_f).get('net', {})
        WS_PORT = int(_net.get('port', WS_PORT))
        MAX_PLAYERS = int(_net.get('maxPlayers', MAX_PLAYERS))
except Exception:
    pass
if len(sys.argv) > 1:
    HTTP_PORT = int(sys.argv[1])
if len(sys.argv) > 2:
    WS_PORT = int(sys.argv[2])

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_FRAME = 1_000_000          # batas ukuran satu pesan (anti-abuse LAN)

# ---------------------------------------------------------------- Room ----
# rooms: nama (sudah trim+lowercase) -> Room. Semua mutasi registry & anggota
# dilindungi ROOMS_LOCK (satu lock global — trafik LAN kecil, kesederhanaan
# menang atas granularitas).
ROOMS = {}
ROOMS_LOCK = threading.Lock()


class Room:
    def __init__(self, name, host):
        self.name = name
        self.host = host          # WSHandler si pembuat room
        self.clients = {}         # id (int) -> WSHandler
        self.next_id = 1          # host = 0; client mulai 1
        self.locked = False       # True setelah host kirim `lock` (game mulai)
        self.dead = False         # True saat room dibubarkan (host putus)


def norm_room(name):
    # Normalisasi nama room: trim + lowercase (Fase 0 rencana MP)
    return str(name or '').strip().lower()


# ------------------------------------------------------- WebSocket relay ----
class WSHandler(socketserver.BaseRequestHandler):
    # Satu thread per koneksi (ThreadingTCPServer). State per koneksi:
    #   role: None | 'host' | 'client';  id: int;  room: Room | None

    # --- lapisan frame RFC 6455 ---
    def _recv_exact(self, n):
        buf = b''
        while len(buf) < n:
            chunk = self.request.recv(n - len(buf))
            if not chunk:
                raise ConnectionError('socket closed')
            buf += chunk
        return buf

    def _recv_frame(self):
        b0, b1 = self._recv_exact(2)
        fin = bool(b0 & 0x80)
        opcode = b0 & 0x0F
        masked = bool(b1 & 0x80)
        ln = b1 & 0x7F
        if ln == 126:
            ln = struct.unpack('>H', self._recv_exact(2))[0]
        elif ln == 127:
            ln = struct.unpack('>Q', self._recv_exact(8))[0]
        if ln > MAX_FRAME:
            raise ConnectionError('frame too big')
        key = self._recv_exact(4) if masked else None
        data = self._recv_exact(ln)
        if key:
            data = bytes(c ^ key[i & 3] for i, c in enumerate(data))
        return fin, opcode, data

    def _recv_message(self):
        # Gabungkan fragmen sampai FIN. Balas ping. None = close/EOF.
        buf = b''
        have_start = False
        while True:
            fin, op, data = self._recv_frame()
            if op == 8:                        # close
                try:
                    self._send_raw(0x88, b'')  # balas close (best effort)
                except Exception:
                    pass
                return None
            if op == 9:                        # ping -> pong payload sama
                self._send_raw(0x8A, data)
                continue
            if op == 10:                       # pong tak diminta — abaikan
                continue
            if op in (1, 2):                   # text/binary — frame awal
                buf = data
                have_start = True
            elif op == 0 and have_start:       # continuation
                buf += data
                if len(buf) > MAX_FRAME:
                    raise ConnectionError('message too big')
            else:
                continue
            if fin:
                return buf.decode('utf-8', 'replace')

    def _send_raw(self, b0, payload):
        ln = len(payload)
        if ln < 126:
            head = struct.pack('>BB', b0, ln)
        elif ln < 65536:
            head = struct.pack('>BBH', b0, 126, ln)
        else:
            head = struct.pack('>BBQ', b0, 127, ln)
        with self.send_lock:
            self.request.sendall(head + payload)

    def send_json(self, obj):
        self.send_text(json.dumps(obj, separators=(',', ':')))

    def send_text(self, s):
        # Kirim best-effort: kegagalan kirim ke satu peer tidak boleh
        # merobohkan thread pengirim (peer itu akan dibersihkan oleh
        # thread-nya sendiri saat recv-nya gagal).
        try:
            self._send_raw(0x81, s.encode('utf-8'))
        except Exception:
            pass

    # --- handshake HTTP -> WS ---
    def _handshake(self):
        self.request.settimeout(10)
        raw = b''
        while b'\r\n\r\n' not in raw:
            chunk = self.request.recv(4096)
            if not chunk or len(raw) > 16384:
                return False
            raw += chunk
        headers = {}
        for line in raw.split(b'\r\n')[1:]:
            if b':' in line:
                k, v = line.split(b':', 1)
                headers[k.strip().lower()] = v.strip()
        key = headers.get(b'sec-websocket-key')
        if not key:
            return False
        accept = base64.b64encode(
            hashlib.sha1(key + WS_GUID.encode()).digest()).decode()
        self.request.sendall((
            'HTTP/1.1 101 Switching Protocols\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Accept: {accept}\r\n\r\n').encode())
        self.request.settimeout(None)
        return True

    # --- lifecycle koneksi ---
    def handle(self):
        self.send_lock = threading.Lock()
        self.role = None
        self.id = None
        self.room = None
        try:
            if not self._handshake():
                return
            while True:
                msg = self._recv_message()
                if msg is None:
                    break
                self._on_message(msg)
        except Exception:
            pass                       # koneksi putus/rusak -> cleanup
        finally:
            self._cleanup()

    def _on_message(self, text):
        try:
            obj = json.loads(text)
        except Exception:
            return                     # bukan JSON — abaikan diam-diam
        if not isinstance(obj, dict):
            return
        t = obj.get('t')

        # Pesan PERTAMA wajib kontrol lobby: create / join
        if self.role is None:
            if t == 'create':
                self._do_create(obj)
            elif t == 'join':
                self._do_join(obj)
            return

        if self.role == 'host':
            if t == 'lock':            # kontrol: kunci room dari join baru
                with ROOMS_LOCK:
                    if self.room:
                        self.room.locked = True
                return
            # Routing host -> client: `to` = satu client; tanpa `to` = semua
            to = obj.pop('to', None)
            payload = json.dumps(obj, separators=(',', ':'))
            with ROOMS_LOCK:
                targets = ([self.room.clients[to]]
                           if to is not None and to in self.room.clients
                           else list(self.room.clients.values())
                           if to is None else [])
            for c in targets:
                c.send_text(payload)
        else:
            # Routing client -> host, ditambah `from`
            obj['from'] = self.id
            with ROOMS_LOCK:
                host = self.room.host if (self.room and not self.room.dead) else None
            if host:
                host.send_text(json.dumps(obj, separators=(',', ':')))

    def _do_create(self, obj):
        name = norm_room(obj.get('room'))
        if not name:
            self.send_json({'t': 'noroom'})
            return
        with ROOMS_LOCK:
            if name in ROOMS:
                self.send_json({'t': 'taken'})
                return
            room = Room(name, self)
            ROOMS[name] = room
            self.role, self.id, self.room = 'host', 0, room
        self.send_json({'t': 'role', 'role': 'host', 'id': 0, 'room': name})

    def _do_join(self, obj):
        name = norm_room(obj.get('room'))
        with ROOMS_LOCK:
            room = ROOMS.get(name)
            if room is None or room.dead:
                self.send_json({'t': 'noroom'})
                return
            if room.locked:
                self.send_json({'t': 'locked'})
                return
            if 1 + len(room.clients) >= MAX_PLAYERS:
                self.send_json({'t': 'full'})
                return
            cid = room.next_id
            room.next_id += 1
            room.clients[cid] = self
            self.role, self.id, self.room = 'client', cid, room
            host = room.host
        self.send_json({'t': 'role', 'role': 'client', 'id': cid, 'room': name})
        # Beri tahu host client baru (nama pemain menumpang di join)
        host.send_json({'t': 'joined', 'id': cid,
                        'name': str(obj.get('name', ''))[:24]})

    def _cleanup(self):
        with ROOMS_LOCK:
            room = self.room
            if room is None or room.dead:
                return
            if self.role == 'host':
                # Host putus -> bubarkan room: kabari semua client, hapus
                # dari registry (nama bisa langsung dipakai lagi).
                room.dead = True
                ROOMS.pop(room.name, None)
                members = list(room.clients.values())
                room.clients.clear()
            else:
                room.clients.pop(self.id, None)
                members = []
                host = room.host
        if self.role == 'host':
            for c in members:
                c.send_json({'t': 'hostleft'})
                try:
                    c.request.shutdown(2)   # bangunkan thread recv client
                except Exception:
                    pass
        else:
            host.send_json({'t': 'leave', 'id': self.id})


class WSServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


# IP LAN mesin ini (trik socket UDP — tanpa paket keluar sungguhan). Dipakai
# endpoint /lanip agar lobby host bisa menampilkan alamat share yang benar
# (browser JS tidak bisa tahu IP LAN sendiri).
def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


# ------------------------------------------------------------ HTTP statis ----
class DevHTTPHandler(SimpleHTTPRequestHandler):
    # no-store: iterasi pengembangan tanpa modul basi di cache browser
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        # /lanip -> IP LAN host (teks polos) — dipakai lobby co-op utk hint
        # "bagikan alamat ini ke teman" (lihat menu.js showRoom)
        if self.path == '/lanip':
            body = lan_ip().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass                            # senyap — log HTTP tidak menarik


def main():
    ws = WSServer(('0.0.0.0', WS_PORT), WSHandler)
    threading.Thread(target=ws.serve_forever, daemon=True).start()
    httpd = ThreadingHTTPServer(
        ('0.0.0.0', HTTP_PORT), partial(DevHTTPHandler, directory=ROOT))
    ip = lan_ip()
    print(f'Gibran vs Zombie 3D — dev server')
    print(f'  game  : http://localhost:{HTTP_PORT}')
    print(f'  co-op : share http://{ip}:{HTTP_PORT} with friends'
          f'  (or Server Address ws://{ip}:{WS_PORT} in the lobby)')
    print(f'  relay : ws://0.0.0.0:{WS_PORT}  (max {MAX_PLAYERS} players/room)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
