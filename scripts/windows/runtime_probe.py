"""Run using the extracted embedded Python, never the test runner's Python."""
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import sys
import cadquery
import OCP

kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.GetCurrentProcess.restype=wintypes.HANDLE
kernel.K32EnumProcessModules.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.HMODULE),wintypes.DWORD,ctypes.POINTER(wintypes.DWORD)]
kernel.K32GetModuleFileNameExW.argtypes=[wintypes.HANDLE,wintypes.HMODULE,wintypes.LPWSTR,wintypes.DWORD]
process=kernel.GetCurrentProcess();modules=(wintypes.HMODULE*4096)();size=wintypes.DWORD()
if not kernel.K32EnumProcessModules(process,modules,ctypes.sizeof(modules),ctypes.byref(size)):raise ctypes.WinError(ctypes.get_last_error())
if size.value>ctypes.sizeof(modules):raise RuntimeError('Module inventory overflow')
crt=[]
for module in modules[:size.value//ctypes.sizeof(wintypes.HMODULE)]:
    buf=ctypes.create_unicode_buffer(32768)
    if not kernel.K32GetModuleFileNameExW(process,module,buf,len(buf)):raise ctypes.WinError(ctypes.get_last_error())
    if Path(buf.value).name.lower().startswith(('msvcp','vcruntime','concrt')):crt.append(buf.value)
print(json.dumps(dict(executable=sys.executable,cadquery=cadquery.__file__,ocp=OCP.__file__,path=sys.path,msvcModules=crt)))
