"""Real loopback sockets exercise collision, OS allocation and startup ownership."""
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler
import importlib.util
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cad'))
from local_host import bind_local, publish_bound_port
spec=importlib.util.spec_from_file_location('launcher',ROOT/'scripts/windows/launcher.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)


class Ports(unittest.TestCase):
    def test_automatic_collision_and_two_instances(self):
        with ExitStack() as stack:
            try:stack.enter_context(bind_local(BaseHTTPRequestHandler,8765))
            except OSError:pass
            occupied=stack.enter_context(bind_local(BaseHTTPRequestHandler,8765,True))
            first=stack.enter_context(bind_local(BaseHTTPRequestHandler,occupied.server_port,True))
            second=stack.enter_context(bind_local(BaseHTTPRequestHandler,first.server_port,True))
            self.assertEqual(first.server_address[0],'127.0.0.1')
            self.assertEqual(len({8765,occupied.server_port,first.server_port,second.server_port}),4)

    def test_explicit_collision_is_rejected(self):
        with bind_local(BaseHTTPRequestHandler,8765,True) as occupied:
            with self.assertRaises(OSError):bind_local(BaseHTTPRequestHandler,occupied.server_port)

    def test_preferred_port_reused(self):
        with bind_local(BaseHTTPRequestHandler,8765,True) as first:port=first.server_port
        with bind_local(BaseHTTPRequestHandler,port,True) as again:
            self.assertEqual(again.server_port,port)

    def test_readiness_matches_bound_port_and_process(self):
        with TemporaryDirectory() as folder, bind_local(BaseHTTPRequestHandler,8765,True) as server:
            path=Path(folder)/'bound.json'
            publish_bound_port(server,path)
            self.assertEqual(json.loads(path.read_text()),{'pid':os.getpid(),'port':server.server_port})

    def test_settings_restore_and_invalid_values(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'launcher.json'
            self.assertEqual(launcher.preferred_port(path),8765)
            launcher.remember_port(path,18765)
            self.assertEqual(launcher.preferred_port(path),18765)
            for text in ['{','[]','null','{"lastPort":true}','{"lastPort":0}','{"lastPort":65536}','{"lastPort":"8766"}']:
                path.write_text(text)
                self.assertEqual(launcher.preferred_port(path),8765,text)

    def test_invalid_port_rejected(self):
        for port in [-1,0,1023,65536]:
            with self.assertRaises(ValueError):bind_local(BaseHTTPRequestHandler,port,True)


if __name__=='__main__':unittest.main()
