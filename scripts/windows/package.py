"""Windows-only allowlist packaging. No checkout-wide copying or private data."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'build/windows'
PYTHON='3.12.10'
def call(*args):subprocess.run(list(map(str,args)),cwd=ROOT,check=True)
def archive(folder):
    path=folder.with_suffix('.zip')
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for f in sorted(folder.rglob('*')):
            if f.is_file():z.write(f,f.relative_to(folder.parent).as_posix())
    return path
def main():
    if sys.platform!='win32' or sys.maxsize<2**32:raise RuntimeError('Windows x64 빌드 전용')
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=ROOT,text=True).strip():raise RuntimeError('커밋되지 않은 소스 변경. 실제 SHA로 빌드하려면 먼저 커밋하세요.')
    name='CellStudio-win-x64-'+sha[:12];dest=OUT/name
    if dest.exists():raise RuntimeError('기존 산출물 폴더가 있습니다. 새 빌드 디렉터리를 사용하세요: '+str(dest))
    dest.mkdir(parents=True);runtime=dest/'runtime';runtime.mkdir()
    embed=OUT/f'python-{PYTHON}-embed-amd64.zip'
    url=f'https://www.python.org/ftp/python/{PYTHON}/{embed.name}'
    urllib.request.urlretrieve(url,embed)
    with zipfile.ZipFile(embed) as z:z.extractall(runtime)
    (runtime/'python312._pth').write_text('python312.zip\n.\nLib/site-packages\n../app/cad\nimport site\n',encoding='utf-8')
    site=runtime/'Lib/site-packages'
    call(sys.executable,'-m','pip','install','--disable-pip-version-check','--only-binary=:all:','--no-compile','--target',site,'-r','cad/requirements.lock.txt')
    # App-local MSVC CRT: a clean workstation must not depend on the runner's
    # globally installed Visual C++ redistributable for OCP/numerical wheels.
    vs=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Microsoft Visual Studio/2022'
    crt_dirs=list(vs.glob('*/VC/Redist/MSVC/*/x64/Microsoft.VC143.CRT'))
    if not crt_dirs:raise RuntimeError('재배포 가능한 MSVC x64 CRT 디렉터리를 찾지 못했습니다.')
    crt=sorted(crt_dirs,key=lambda p:tuple(int(x) for x in p.parents[1].name.split('.')))[-1]
    for dll in crt.glob('*.dll'):shutil.copy2(dll,runtime/dll.name)
    # One-directory launcher avoids a temporary-extraction parent process and
    # keeps EXE termination tied to the Windows Job Object that owns CAD.
    call(sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onedir','--console','--name','CellStudio','--distpath',OUT/'launcher','--workpath',OUT/'pyinstaller-work','--specpath',OUT,'scripts/windows/launcher.py')
    shutil.copytree(OUT/'launcher/CellStudio',dest,dirs_exist_ok=True)
    app=dest/'app';(app/'cad').mkdir(parents=True);(app/'src/data').mkdir(parents=True)
    # Explicit app resources only. No repository docs, examples, snapshots or caches.
    for file in sorted((ROOT/'cad').glob('*.py')):shutil.copy2(file,app/'cad'/file.name)
    shutil.copy2(ROOT/'src/data/stages.json',app/'src/data/stages.json')
    (app/'src/prismatic').mkdir()
    shutil.copy2(ROOT/'src/prismatic/hardware.json',app/'src/prismatic/hardware.json')
    shutil.copytree(ROOT/'dist',app/'dist')
    if any(p.suffix=='.map' or 'preview-data' in p.parts for p in (app/'dist').rglob('*')):raise RuntimeError('개발/프리뷰 자산이 일반 빌드에 포함됨')
    version={'sourceCommit':sha,'platform':'win-x64','python':PYTHON,'cadquery':'2.7.0','msvcRuntime':crt.parents[1].name,'runtimeSource':url,'runtimeArchiveSha256':hashlib.sha256(embed.read_bytes()).hexdigest(),'buildRun':os.environ.get('GITHUB_SERVER_URL','')+'/'+os.environ.get('GITHUB_REPOSITORY','')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID','local')}
    text=json.dumps(version,ensure_ascii=False,indent=2)+'\n'
    (dest/'VERSION.json').write_text(text,encoding='utf-8');(app/'dist/trial-version.json').write_text(text,encoding='utf-8')
    shutil.copy2(ROOT/'docs/windows/user-guide.txt',dest/'시작 안내.txt')
    notices=dest/'notices';notices.mkdir()
    shutil.copy2(runtime/'LICENSE.txt',notices/'CPython-LICENSE.txt')
    shutil.copy2(ROOT/'cad/requirements.lock.txt',notices/'cad-requirements.lock.txt')
    (notices/'Microsoft-CRT.txt').write_text('Microsoft Visual C++ Redistributable — app-local x64 CRT\nVersion: '+crt.parents[1].name+'\nCopyright Microsoft Corporation. All rights reserved.\nRedistributable list: https://learn.microsoft.com/visualstudio/releases/2022/redistribution\nRedistributed under the Visual Studio license terms: https://visualstudio.microsoft.com/license-terms/\nOnly the redistributable Microsoft.VC143.CRT DLLs are included; no SDK or build tools.\n',encoding='utf-8')
    for name in ['LICENSE','LICENSE.md','LICENSE.txt']:
        if (ROOT/name).is_file():shutil.copy2(ROOT/name,notices/name)
    inventory=[]
    # Preserve every wheel's original dist-info, license, native libs in runtime.
    for d in importlib.metadata.distributions(path=[str(site)]):
        inventory.append({'name':d.metadata['Name'],'version':d.version,'license':d.metadata.get('License-Expression') or d.metadata.get('License'),'metadata':str(Path(d._path).relative_to(dest))})
    (notices/'dependencies.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
    for pkg in ['three','ajv','@noble/hashes','fast-deep-equal','fast-uri','json-schema-traverse','require-from-string']:
        root=ROOT/'node_modules'/pkg
        target=notices/'web'/pkg.replace('/','_');target.mkdir(parents=True,exist_ok=True)
        for f in root.iterdir():
            if f.is_file() and (f.name.lower().startswith(('license','copying','notice')) or f.name=='package.json'):shutil.copy2(f,target/f.name)
    dist=importlib.metadata.distribution('pyinstaller')
    for f in dist.files or []:
        if any(x.lower().startswith(('license','copying','notice')) for x in f.parts):
            origin=dist.locate_file(f)
            if origin.is_file():shutil.copy2(origin,notices/('PyInstaller-'+origin.name))
    call('npm.cmd','run','build:intake-kit','--',OUT/('CellStudio-IntakeKit-'+sha[:12]))
    kit=OUT/('CellStudio-IntakeKit-'+sha[:12]);kit_zip=archive(kit)
    files=[{'path':p.relative_to(dest).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(dest.rglob('*')) if p.is_file()]
    (dest/'FILE-MANIFEST.json').write_text(json.dumps(files,ensure_ascii=False,indent=2),encoding='utf-8')
    app_zip=archive(dest)
    report={'sourceCommit':sha,'app':{'zip':app_zip.name,'zipBytes':app_zip.stat().st_size,'unpackedBytes':sum(p.stat().st_size for p in dest.rglob('*') if p.is_file()),'fileCount':sum(1 for p in dest.rglob('*') if p.is_file())},'intakeKit':{'zip':kit_zip.name,'zipBytes':kit_zip.stat().st_size,'unpackedBytes':sum(p.stat().st_size for p in kit.rglob('*') if p.is_file())},'largestFiles':sorted(files,key=lambda f:f['bytes'],reverse=True)[:20],'largeComponentsReasons':{'runtime/Lib/site-packages/OCP':'OpenCascade 정확 형상/불리언/STEP 커널','runtime/Lib/site-packages/vtkmodules':'CadQuery/OCP 시각화·메시 의존 라이브러리','runtime/Lib/site-packages/casadi':'CadQuery 수치 계산 의존성','CellStudio.exe':'표준 라이브러리 포함 독립 런처; CAD 라이브러리는 runtime에서만 로드'}}
    (OUT/'size-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
