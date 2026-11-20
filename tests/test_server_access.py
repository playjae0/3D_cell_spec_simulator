import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cad'))
from server_config import ServerConfig, origin_url


class Access(unittest.TestCase):
    def test_defaults_preserve_local_and_vite(self):
        c=ServerConfig.from_environment({})
        self.assertEqual(c.host,'127.0.0.1')
        self.assertTrue(c.permits('127.0.0.1:8765','',8765))
        self.assertTrue(c.permits('localhost:5174','http://localhost:5174',8765))
        self.assertFalse(c.permits('attacker.example:8765','',8765))
        self.assertFalse(c.permits('127.0.0.1:8765','http://attacker.example',8765))

    def test_lan_requires_explicit_urls(self):
        for host in ('0.0.0.0','10.20.30.40'):
            with self.assertRaises(ValueError):ServerConfig.from_environment({'POUCH_HOST':host})

    def test_lan_allowed_host_and_origin(self):
        c=ServerConfig.from_environment({'POUCH_HOST':'10.20.30.40','POUCH_ALLOWED_ORIGINS':'http://10.20.30.40:8765, https://cell.example.com/'})
        self.assertTrue(c.permits('10.20.30.40:8765','http://10.20.30.40:8765',8765))
        self.assertTrue(c.permits('cell.example.com','https://cell.example.com',8765))
        self.assertTrue(c.permits('cell.example.com','',8765))
        self.assertFalse(c.permits('wrong.example','https://cell.example.com',8765))
        self.assertFalse(c.permits('cell.example.com','null',8765))

    def test_reverse_proxy_keeps_local_health(self):
        c=ServerConfig.from_environment({'POUCH_ALLOWED_ORIGINS':'https://cell.example.com'})
        self.assertTrue(c.permits('127.0.0.1:8765','',8765))
        self.assertTrue(c.permits('cell.example.com','https://cell.example.com',8765))
        self.assertFalse(c.permits('cell.example.com','https://other.example.com',8765))

    def test_origin_validation(self):
        self.assertEqual(origin_url(' https://CELL.EXAMPLE:443/ '),'https://cell.example')
        for x in ('*','null','ftp://cell.example','http://*.example','https://user:pass@cell.example','http://cell.example/path','http://cell.example?x=1','http://cell.example#x','http://cell.example:99999'):
            with self.assertRaises(ValueError):origin_url(x)

    def test_invalid_listener(self):
        for host in ('','http://127.0.0.1','::1','999.1.1.1'):
            with self.assertRaises(ValueError):ServerConfig.from_environment({'POUCH_HOST':host})


if __name__=='__main__':unittest.main()
