"""Stage-scoped design resolution. Stored inputs never contain derived geometry.

The axial shortening is a declared envelope assumption, not foil strain or trim.
S0 stock projection feeds S1+: gathered length = stock - distance - shortening.
Editing a later-stage target adjusts shortening, never the S0 stock projection.
"""
from copy import deepcopy
import math

STAGES = ('stacked', 'gathered', 'preweld', 'welded', 'assembly', 'packaged', 'finished')

class ModelError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__('; '.join(errors))

def resolve_pole(source, stage='assembly'):
    p=deepcopy(source);t=p['tab']
    if 'foilWidth' not in t:
        raise ModelError(['기존 포일 폭 데이터입니다. JSON 불러오기에서 뿌리/집속 폭을 명시적으로 선택해 변환하세요.'])
    for key in (['foilWidth','rootLength'] if stage=='stacked' else ['foilWidth','rootLength','axialShortening']):
        value=t.get(key)
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value):
            raise ModelError([f'tab.{key}: 유한한 숫자가 필요합니다'])
    t['rootWidth']=t['width']=t['foilWidth']
    if stage!='stacked':t['length']=t['rootLength']-t['gatherDistance']-t['axialShortening']
    p['_stage']=stage
    p['_hasLead']=stage in STAGES[3:] or (stage=='preweld' and p['preweldLead']['included'])
    if stage=='preweld' and p['_hasLead']:p['lead']={k:v for k,v in p['preweldLead'].items() if k!='included'}
    if stage not in STAGES[2:]:p['prewelds']=[]
    if stage not in STAGES[3:]:p['joints']=[]
    if stage not in STAGES[4:]:p['tapes']=[]
    if stage not in STAGES[3:]:p['leadFilm']={'enabled':False}
    elif p.get('leadFilm',{}).get('enabled') is None:
        if stage!='welded':raise ModelError(['leadFilm.enabled: 실런트 존재/부재와 입력 확인 필요'])
        # Legacy S3 compatibility only; no source mutation or inferred absence.
        p['_leadFilmUnknown']=True
        p['leadFilm']={'enabled':False}
    if not p['_hasLead']:p['lead']={}
    return p

def resolve_product(source,stage):
    if stage not in STAGES:raise ModelError(['지원하지 않는 공정 상태'])
    p=deepcopy(source)
    for side in ['positive','negative']:p[side]=resolve_pole(p[side],stage)
    return p
