"""Explicit intranet listeners and same-origin URLs; no wildcard CORS."""
from dataclasses import dataclass
from ipaddress import IPv4Address
import os
from urllib.parse import urlsplit


def origin_url(value):
    value=value.strip()
    parsed=urlsplit(value)
    if (parsed.scheme not in ('http','https') or not parsed.hostname or
        parsed.username is not None or parsed.password is not None or
        parsed.path not in ('','/') or parsed.query or parsed.fragment or
        any(c.isspace() for c in value) or '*' in value or ':' in parsed.hostname):
        raise ValueError('접속 주소는 경로 없는 http(s)://호스트[:포트]로 지정하세요. 와일드카드는 지원하지 않습니다.')
    port=parsed.port
    if port is not None and not 1<=port<=65535:raise ValueError('접속 주소의 포트가 잘못되었습니다.')
    default=80 if parsed.scheme=='http' else 443
    authority=parsed.hostname.lower()+(f':{port}' if port is not None and port!=default else '')
    return f'{parsed.scheme}://{authority}'


@dataclass(frozen=True)
class ServerConfig:
    host: str
    origins: tuple

    @classmethod
    def from_environment(cls, env=None):
        env=os.environ if env is None else env
        host=env.get('POUCH_HOST','127.0.0.1').strip()
        if host=='localhost':host='127.0.0.1'
        try:address=IPv4Address(host)
        except ValueError as exc:raise ValueError('POUCH_HOST는 서버에 할당된 IPv4 주소 또는 127.0.0.1로 지정하세요.') from exc
        origins=tuple(dict.fromkeys(origin_url(x) for x in env.get('POUCH_ALLOWED_ORIGINS','').split(',') if x.strip()))
        if not address.is_loopback and not origins:
            raise ValueError('외부 접속에는 POUCH_ALLOWED_ORIGINS에 사용자가 열 사내 URL을 지정해야 합니다.')
        return cls(str(address),origins)

    def allowed_origins(self, port):
        local={f'http://{host}:{p}' for host in ('127.0.0.1','localhost',self.host) for p in (5174,5175,port)} if IPv4Address(self.host).is_loopback else set()
        return set(self.origins)|local

    def permits(self, host, origin, port):
        allowed=self.allowed_origins(port)
        # Host validation also covers GETs without an Origin header.
        authorities={urlsplit(x).netloc for x in allowed}
        if host.lower() not in authorities:return False
        if not origin:return True  # same-origin GETs and direct CLI/API clients
        try:return origin_url(origin) in allowed
        except ValueError:return False
