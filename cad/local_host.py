"""Bind the loopback listener before publishing its actual port to the launcher."""
import errno
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket


class LocalHTTPServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can let two processes bind the same address/port.
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def bind_local(handler, preferred=8765, automatic=False):
    if not 1024 <= preferred <= 65535:
        raise ValueError('포트는 1024~65535 사이여야 합니다.')
    # The OS chooses AND reserves the final free port. No probe/release race.
    candidates = list(dict.fromkeys([preferred, 8765, 0] if automatic else [preferred]))
    for i, port in enumerate(candidates):
        try:
            return LocalHTTPServer(('127.0.0.1', port), handler)
        except OSError as exc:
            occupied = exc.errno in (errno.EADDRINUSE, errno.EACCES) or getattr(exc, 'winerror', None) in (10048, 10013)
            if not occupied or i == len(candidates) - 1:
                raise


def publish_bound_port(server, path):
    if not path:
        return
    dest = Path(path)
    temp = dest.with_suffix('.tmp')
    temp.write_text(json.dumps({'pid': os.getpid(), 'port': server.server_port}), encoding='utf-8')
    temp.replace(dest)
