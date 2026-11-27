"""Small console EXE. CAD runs under the bundled, isolated CPython runtime."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import urllib.request
import webbrowser


def preferred_port(settings):
    try:
        value=json.loads(settings.read_text(encoding='utf-8')).get('lastPort')
        if type(value) is int and 1024<=value<=65535:return value
    except (OSError,ValueError,AttributeError):pass
    return 8765


def remember_port(settings, port):
    try:
        temp=settings.with_suffix(f'.{os.getpid()}.tmp')
        temp.write_text(json.dumps({'lastPort':port}),encoding='utf-8')
        temp.replace(settings)
    except OSError:
        print('포트 설정을 저장하지 못했습니다. 다음 실행은 기본 포트부터 확인합니다.',flush=True)


def job_for(child):
    """Windows closes the entire CAD process tree even when the console is closed."""
    if os.name != 'nt':
        return None
    from ctypes import wintypes
    class BASIC(ctypes.Structure):
        _fields_ = [('processTime',ctypes.c_int64),('jobTime',ctypes.c_int64),('flags',wintypes.DWORD),('min',ctypes.c_size_t),('max',ctypes.c_size_t),('active',wintypes.DWORD),('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
    class IO(ctypes.Structure):
        _fields_ = [(k,ctypes.c_uint64) for k in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
    class EXTENDED(ctypes.Structure):
        _fields_ = [('basic',BASIC),('io',IO),('processMemory',ctypes.c_size_t),('jobMemory',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.CreateJobObjectW.restype=wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
    kernel.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
    handle=kernel.CreateJobObjectW(None,None)
    info=EXTENDED();info.basic.flags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not handle or not kernel.SetInformationJobObject(handle,9,ctypes.byref(info),ctypes.sizeof(info)) or not kernel.AssignProcessToJobObject(handle,int(child._handle)):
        raise ctypes.WinError(ctypes.get_last_error())
    return handle


def run():
    for stream in (sys.stdout,sys.stderr):
        if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='replace')
    parser=argparse.ArgumentParser(description='CellStudio 로컬 CAD 실행')
    parser.add_argument('--port',type=int,default=None,help='고정 포트 지정. 생략하거나 0이면 마지막 포트/8765/빈 포트 순으로 자동 선택')
    parser.add_argument('--no-browser',action='store_true',help='자동 브라우저 열기 생략')
    parser.add_argument('--ready-file',type=Path,help='검수용 준비 상태 JSON 출력')
    args=parser.parse_args()
    automatic=args.port in (None,0)
    if not automatic and not 1024<=args.port<=65535:raise ValueError('포트는 1024~65535 사이여야 합니다. 자동 선택은 --port 0입니다.')
    base=Path(sys.executable).parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent
    runtime=base/'runtime'/'python.exe';app=base/'app'
    if not runtime.is_file() or not (app/'dist/index.html').is_file():
        raise RuntimeError('전체 ZIP을 새 폴더에 압축 해제하세요. EXE만 복사하면 실행할 수 없습니다.')
    version=json.loads((base/'VERSION.json').read_text(encoding='utf-8'))
    settings=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'CellStudio'/'launcher.json'
    previous=preferred_port(settings)
    port=previous if automatic else args.port
    if not automatic:
        with socket.socket() as probe:
            if os.name=='nt':probe.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            try:probe.bind(('127.0.0.1',port))
            except OSError as exc:raise RuntimeError(f'포트 {port} 사용 중이거나 사용할 권한이 없습니다. --port 없이 실행하면 빈 포트를 자동 선택합니다. 고정하려면 CellStudio.exe --port 8766으로 실행하세요. 포트를 바꾸면 브라우저 보관함은 별개입니다.') from exc
    logs=settings.parent/'logs'
    logs.mkdir(parents=True,exist_ok=True)
    log=logs/f"cad-{version['sourceCommit'][:12]}-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}.log"
    env={k:v for k,v in os.environ.items() if not k.startswith(('PYTHON','CONDA','VIRTUAL_ENV'))}
    env['POUCH_PORT']=str(port)
    env['POUCH_AUTO_PORT']='1' if automatic else '0'
    env['PATH']=os.pathsep.join([str(runtime.parent),str(Path(os.environ.get('SystemRoot','C:/Windows'))/'System32')])
    url=None
    child=None;job=None
    try:
        with TemporaryDirectory(prefix='startup-',dir=logs) as startup, log.open('w',encoding='utf-8') as output:
            bound_file=Path(startup)/'bound.json'
            env['POUCH_LAUNCH_READY']=str(bound_file)
            child=subprocess.Popen([str(runtime),'-I','-X','utf8','-u',str(app/'cad/server.py')],cwd=app,env=env,stdout=output,stderr=subprocess.STDOUT)
            job=job_for(child)
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            start=time.monotonic()
            while time.monotonic()-start<120:
                if child.poll() is not None:raise RuntimeError('CAD 시작 실패. 로그: '+str(log))
                try:
                    if url is None:
                        bound=json.loads(bound_file.read_text(encoding='utf-8'))
                        actual=bound['port']
                        if bound.get('pid')!=child.pid or type(actual) is not int or not 1024<=actual<=65535:
                            raise RuntimeError('CAD 준비 정보 불일치. 로그: '+str(log))
                        if not automatic and actual!=port:raise RuntimeError('CAD 고정 포트 불일치')
                        url=f'http://127.0.0.1:{actual}'
                    with opener.open(url+'/api/health',timeout=1) as r:health=json.load(r)
                    if health.get('mode')=='live-cad' and health.get('status')=='ready':break
                except (OSError,ValueError):pass
                time.sleep(.25)
            else:raise RuntimeError('CAD 준비 시간 초과. 로그: '+str(log))
            if child.poll() is not None:raise RuntimeError('CAD 시작 실패. 로그: '+str(log))
            remember_port(settings,actual)
            ready={'url':url,'sourceCommit':version['sourceCommit'],'health':health,'pid':child.pid,'runtime':str(runtime),'log':str(log),'automaticPort':automatic,'preferredPort':port,'actualPort':actual}
            print('CellStudio '+version['sourceCommit'][:12],flush=True)
            print('실제 로컬 CAD 준비 완료: '+url,flush=True)
            if automatic and actual!=port:print(f'포트 {port} 대신 빈 포트 {actual}을 자동 선택했습니다.',flush=True)
            if actual!=previous:print('포트가 변경되어 브라우저 보관함은 별개입니다. 저장한 셀 JSON은 불러오기로 열 수 있습니다.',flush=True)
            print('브라우저를 닫아도 CAD는 실행 중입니다. 이 창에서 Ctrl+C 또는 창 닫기로 종료하세요.',flush=True)
            print('셀 JSON은 프로그램 폴더 밖에 저장하세요. 로그: '+str(log),flush=True)
            if not args.no_browser:
                ready['defaultBrowserOpenRequested']=webbrowser.open(url)
                if not ready['defaultBrowserOpenRequested']:print('브라우저를 열지 못했습니다. 위 주소를 기본 브라우저에 입력하세요.',flush=True)
            if args.ready_file:
                args.ready_file.parent.mkdir(parents=True,exist_ok=True);args.ready_file.write_text(json.dumps(ready,ensure_ascii=False,indent=2),encoding='utf-8')
            while child.poll() is None:time.sleep(.3)
            if child.returncode:raise RuntimeError('CAD가 종료되었습니다. 로그: '+str(log))
    except KeyboardInterrupt:
        print('CellStudio 종료 중…',flush=True)
    finally:
        if child and child.poll() is None:
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait()
        if job:
            ctypes.windll.kernel32.CloseHandle.argtypes=[ctypes.c_void_p]
            ctypes.windll.kernel32.CloseHandle(job)
        if args.ready_file:args.ready_file.unlink(missing_ok=True)


if __name__=='__main__':
    try:run()
    except Exception as exc:
        message='CellStudio 실행 오류\n'+str(exc)
        print(message,file=sys.stderr,flush=True)
        if os.name=='nt' and '--no-browser' not in sys.argv:ctypes.windll.user32.MessageBoxW(None,message,'CellStudio',0x10)
        sys.exit(1)
