import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const local=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const python=process.env.POUCH_PYTHON||(existsSync(local)?local:'python');
const child=spawn(python,['cad/server.py'],{stdio:'inherit'});
child.on('error',error=>{console.error('로컬 Python/CadQuery 필요:',error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);
process.on('SIGINT',()=>child.kill('SIGINT'));
