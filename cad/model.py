"""Datum-driven OCC geometry. Millimetres. No image-derived product dimensions.

Tab model: distributed foil roots -> smooth central gathering -> finite overlap.
S1-13 / S1-14 V folds, W2 guides and W3 hybrid welding are NOT shape inputs.
"""
import math
import cadquery as cq
from functools import lru_cache
from copy import deepcopy
from proof_pocket import pocket, roundwire

class ModelError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__('; '.join(errors))

def validate(p):
    errors=[]
    def check(ok, msg):
        if not ok: errors.append(msg)
    def finite(x): return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
    def nums(d,path):
        for k,v in d.items():
            if isinstance(v,dict): nums(v,path+'.'+k)
            elif isinstance(v,list):
                for i,x in enumerate(v):
                    if isinstance(x,dict): nums(x,f'{path}.{k}[{i}]')
            elif isinstance(v,(int,float)) and not isinstance(v,bool): check(finite(v),path+'.'+k+': 유한한 숫자가 필요합니다')
    nums(p,'product')
    s=p['stack']; q=p['pouch']
    for k in ['length','width','thickness','cornerR']: check(s[k]>0,'stack.'+k+': 양수 필요')
    check(0<s['cornerR']<min(s['length'],s['width'])/2,'stack.cornerR: 외곽보다 큽니다')
    check(p['positive']['end'] in [-1,1] and p['negative']['end']==-p['positive']['end'],'양극·음극은 서로 반대쪽 끝이어야 합니다')
    for name in ['positive','negative']:
        pole=p[name]; t=pole['tab']; l=pole['lead']; f=pole['leadFilm']
        for k in ['rootWidth','rootSpread','gatherDistance','width','thickness','length','edgeR']: check(t[k]>0,f'{name}.tab.{k}: 양수 필요')
        for k in ['length','width','thickness']: check(l[k]>0,f'{name}.lead.{k}: 양수 필요')
        check(abs(t['rootY'])+t['rootWidth']/2<=s['width']/2,f'{name}: 탭 뿌리가 조립체 폭을 벗어납니다')
        check(abs(t['rootZ'])+t['rootSpread']/2<=s['thickness']/2,f'{name}: 탭 뿌리 분포가 조립체 두께를 벗어납니다')
        check(t['edgeR']<min(t['thickness'],t['width'],t['rootSpread'],t['rootWidth'])/2,f'{name}: 탭 모서리 R이 단면보다 큽니다')
        check(l['contactSide'] in ['below','above'],f'{name}: 리드 접촉 면은 above/below')
        check(0<=l['start']<t['length'] and l['start']+l['length']>t['length'],f'{name}: 리드와 집속부가 겹치지 않습니다')
        overlap=min(t['width']/2,l['offsetY']+l['width']/2)-max(-t['width']/2,l['offsetY']-l['width']/2)
        check(overlap>0,f'{name}: Y 방향 겹침 없음')
        for j in pole['joints']:
            if not j['enabled']: continue
            check(j['kind']=='tab_to_lead',f'{name}: 현재 접합 형상은 tab_to_lead만 지원합니다')
            check(j['length']>0 and j['width']>0,f'{name}: 접합 영역 길이·폭은 양수')
            check(j['start']>=l['start'] and j['start']+j['length']<=t['length'],f'{name}: 접합 영역 X 경계가 실제 겹침 밖입니다')
            check(abs(j['offsetY'])+j['width']/2<=t['width']/2 and abs(j['offsetY']-l['offsetY'])+j['width']/2<=l['width']/2,f'{name}: 접합 영역 Y 경계가 실제 겹침 밖입니다')
        for a in pole['tapes']:
            if not a['enabled']: continue
            check(a['host']=='tab' and a['path'] in ['top','top_edges'],f'{name}: 지원 테이프 경로는 tab/top, tab/top_edges')
            check(a.get('face','top') in ['top','bottom'],f'{name}: 테이프 부착면은 top/bottom')
            if a.get('face','top')==('bottom' if l['contactSide']=='below' else 'top'):
                check(a['start']+a['length']<=l['start'],f'{name}: 테이프가 리드 접촉면과 중첩됩니다. 노출된 반대 부착면을 선택하세요')
            check(a['length']>0 and a['thickness']>0 and a['width']>0,f'{name}: 테이프 치수는 양수')
            check(a['start']>=0 and a['start']+a['length']<=t['length'],f'{name}: 테이프가 집속부 부착 범위를 벗어납니다')
            if a['path']=='top': check(abs(a['offsetY'])+a['width']/2<=t['width']/2-t['edgeR'],f'{name}: 평면 테이프는 상면 평탄부 안에 있어야 합니다. 모서리 경로를 선택하세요')
            else: check(0<=a['edgeDrop']<=t['thickness']-2*t['edgeR'],f'{name}: 감쌈 깊이가 탭 측면 높이를 벗어납니다')
        if f['enabled']:
            check(f['length']>0 and f['thickness']>0 and f['overhang']>=0,f'{name}: 리드 필름 치수 오류')
            check(f['start']>=t['length'] and f['start']+f['length']<=l['start']+l['length'],f'{name}: 리드 필름은 집속부 밖의 노출 리드에 놓여야 합니다')
    for k in ['openingLength','openingWidth','planR','filmThickness','sealWidth','trimMargin','foldR']: check(q[k]>0,'pouch.'+k+': 양수 필요')
    check(q['sealGap']>0,'현재 형상은 성형–실링 간격 > 0 필요')
    check(q['foldR']>q['filmThickness'],'접힘 R은 외장 필름 두께보다 커야 합니다')
    check(q['packagingExtraYMinus']>=0 and q['packagingExtraYPlus']>=0,'패키징 외장 추가 여유는 음수 불가')
    for side in ['upper','lower']:
        d,rf,rt=q[side+'Depth'],q[side+'FloorR'],q[side+'RimR']
        check(rf>0 and rt>q['filmThickness'],f'{side}: 바닥 R>0, 상단 R>필름 두께 필요')
        check(d>rf+rt,f'{side}: 깊이는 바닥 R + 상단 R보다 커야 합니다 (현재 수직 측벽 모델)')
        check(q['planR']>rf+rt,f'{side}: 평면 R은 바닥 R + 상단 R보다 커야 합니다')
        check(q['openingLength']-2*(rf+rt)>s['length'] and q['openingWidth']-2*(rf+rt)>s['width'],f'{side}: 포켓 바닥이 조립체 외곽보다 작습니다')
        check(d>=s['thickness']/2+.1,f'{side}: 포켓 깊이와 조립체가 간섭합니다 (최소 여유 0.1 mm)')
    check(q['planR']<min(q['openingLength'],q['openingWidth'])/2,'파우치 평면 R 범위 초과')
    for name in ['positive','negative']:
        pole=p[name];t=pole['tab'];tapeT=max([a['thickness'] for a in pole['tapes'] if a['enabled']]+[0])
        check(t['gatherZ']+t['thickness']/2+tapeT<q['upperDepth'] and t['gatherZ']-t['thickness']/2> -q['lowerDepth'],f'{name}: 집속부/테이프가 포켓 깊이를 벗어납니다')
        check(s['length']/2+t['gatherDistance']+t['length']<q['openingLength']/2-max(q['upperFloorR']+q['upperRimR'],q['lowerFloorR']+q['lowerRimR']),f'{name}: 집속부가 포켓 바닥의 X 범위를 벗어납니다')
    check(0<=q['foldAngle']<=120,'접힘 각도 지원 범위: 0–120°')
    check(q['foldR']*math.radians(q['foldAngle'])<q['trimMargin'],'접힘 호 길이가 절단 여유보다 큽니다')
    if errors: raise ModelError(errors)

def box(l,w,h,x=0,y=0,z=0):
    return cq.Workplane('XY').box(l,w,h).val().translate((x,y,z))

def rounded(l,w,h,r):
    return cq.Workplane('XY').box(l,w,h).edges('|Z').fillet(r).val()

def yz_wire(x,y,z,w,h,r):
    # Circular corner transitions, independent of tab gathering path.
    return roundwire(w,h,r).rotate((0,0,0),(0,1,0),90).rotate((0,0,0),(1,0,0),90).translate((x,y,z))

def place(shape,end,L):
    if end==-1: shape=shape.rotate((0,0,0),(0,0,1),180).mirror('XZ')
    return shape.translate((end*L/2,0,0))

def tape_shape(t,a):
    x=t['gatherDistance']+a['start']; y=t['gatherY']; z=t['gatherZ']+t['thickness']/2
    if a['path']=='top':
        shape=box(a['length'],a['width'],a['thickness'],x+a['length']/2,y+a['offsetY'],z+a['thickness']/2)
        return shape if a.get('face','top')=='top' else shape.translate((0,0,-t['gatherZ'])).mirror('XY').translate((0,0,t['gatherZ']))
    r=t['edgeR']; w=t['width']; h=a['edgeDrop']; thick=a['thickness']; v=math.sqrt(.5)
    # Closed constant-offset strip: top, quarter circles, and two side legs.
    u=w/2-r; base=z-r-h
    profile=(cq.Workplane('YZ',origin=(x,y,0)).moveTo(-w/2-thick,base).lineTo(-w/2-thick,z-r)
      .threePointArc((-u-(r+thick)*v,z-r+(r+thick)*v),(-u,z+thick)).lineTo(u,z+thick)
      .threePointArc((u+(r+thick)*v,z-r+(r+thick)*v),(w/2+thick,z-r)).lineTo(w/2+thick,base)
      .lineTo(w/2,base).lineTo(w/2,z-r)
      .threePointArc((u+r*v,z-r+r*v),(u,z)).lineTo(-u,z)
      .threePointArc((-u-r*v,z-r+r*v),(-w/2,z-r)).lineTo(-w/2,base).close())
    shape=profile.extrude(a['length']).val()
    return shape if a.get('face','top')=='top' else shape.translate((0,0,-t['gatherZ'])).mirror('XY').translate((0,0,t['gatherZ']))

def build_pole(name,pole,s):
    t=pole['tab']; l=pole['lead']; g=t['gatherDistance']; e=pole['end']; L=s['length']; parts=[]; features={}; paths=[]
    def xyz(x,y,z): return [e*(L/2+x),y,z]
    def point(key,title,v,kind='point'): features[f'{name}.{key}']={'partId':f'{name}.'+key.split('.')[0],'kind':kind,'name':title,'point':xyz(*v)}
    def add(key,label,shape,color,role='solid',meta=None):
        parts.append({'id':name+'.'+key,'name':('양극' if name=='positive' else '음극')+' · '+label,'shape':place(shape,e,L),'color':color,'role':role,'meta':meta or {}})
    wires=[]
    for i in range(9):
        u=i/8; v=u*u*(3-2*u)
        wires.append(yz_wire(g*u,t['rootY']+(t['gatherY']-t['rootY'])*v,t['rootZ']+(t['gatherZ']-t['rootZ'])*v,t['rootWidth']+(t['width']-t['rootWidth'])*v,t['rootSpread']+(t['thickness']-t['rootSpread'])*v,t['edgeR']))
    transition=cq.Solid.makeLoft(wires,ruled=False)
    gathered=cq.Solid.extrudeLinear(yz_wire(g,t['gatherY'],t['gatherZ'],t['width'],t['thickness'],t['edgeR']),[],cq.Vector(t['length'],0,0))
    tab=transition.fuse(gathered).clean()
    add('tab','포일 탭 집속',tab,'#b7c6ce',meta={'definition':'뿌리 분포→smoothstep 집속→유한 겹침. 개별 포일 변형 해석 아님','gatherCenter':xyz(g,t['gatherY'],t['gatherZ'])})
    # Illustrative foil trajectories, NOT an electrode layer count.
    for layer in range(9):
        f=layer/8-.5; line=[]
        for i in range(33):
            u=i/32; v=u*u*(3-2*u)
            z=(t['rootZ']+f*t['rootSpread'])*(1-v)+(t['gatherZ']+f*t['thickness'])*v
            y=t['rootY']+(t['gatherY']-t['rootY'])*v-(t['rootWidth']+(t['width']-t['rootWidth'])*v)/2
            line.append(xyz(g*u,y-.01,z))
        paths.append({'partId':name+'.tab','color':'#526770','points':line})
    sign=-1 if l['contactSide']=='below' else 1
    leadZ=t['gatherZ']+sign*(t['thickness']+l['thickness'])/2
    leadY=t['gatherY']+l['offsetY']; leadX=g+l['start']
    add('lead','외부 리드',box(l['length'],l['width'],l['thickness'],leadX+l['length']/2,leadY,leadZ),'#b8b5a7' if name=='positive' else '#c4b199',meta={'contactSide':l['contactSide'],'assumption':'접촉면은 편집 가능한 예시 설정'})
    overlapMinY=max(t['gatherY']-t['width']/2,leadY-l['width']/2)
    overlapMaxY=min(t['gatherY']+t['width']/2,leadY+l['width']/2)
    interfaceZ=t['gatherZ']+sign*t['thickness']/2
    # Overlap is metadata/outline, not a second material solid.
    paths.append({'partId':name+'.lead','color':'#5da69e','dashed':True,'points':[xyz(x,y,interfaceZ) for x,y in [(leadX,overlapMinY),(g+t['length'],overlapMinY),(g+t['length'],overlapMaxY),(leadX,overlapMaxY),(leadX,overlapMinY)]]})
    for j in pole['joints']:
        if not j['enabled']: continue
        key='joint.'+j['id']; x=g+j['start']; y=t['gatherY']+j['offsetY']
        # Footprint is a reference face at the actual interface, no weld bead.
        face=cq.Face.makeFromWires(cq.Workplane('XY').rect(j['length'],j['width']).val()).translate((x+j['length']/2,y,interfaceZ))
        add(key,'접합 영역 (예시 경계)',face,'#df8660','region',{'process':j['process'],'definition':'리드–탭 접촉면의 관리 영역, 비드/용입 형상 아님'})
        displayZ=max(t['gatherZ']+t['thickness']/2,leadZ+l['thickness']/2)+.002
        parts[-1]['displayShape']=face.translate((0,0,displayZ-interfaceZ))
        parts[-1]['meta']['display']='상면 투영 경계 · 실제 접합면 기준은 단면/주석 참조'
        point(key+'.start','접합 시작',(x,y,interfaceZ));point(key+'.end','접합 끝',(x+j['length'],y,interfaceZ))
        point(key+'.widthMinus','접합 폭 −',(x+j['length']/2,y-j['width']/2,interfaceZ));point(key+'.widthPlus','접합 폭 +',(x+j['length']/2,y+j['width']/2,interfaceZ))
        point(key+'.face','접합 면 중심',(x+j['length']/2,y,interfaceZ),'face')
    for a in pole['tapes']:
        if not a['enabled']: continue
        key='tape.'+a['id']; add(key,'노란 테이프',tape_shape(t,a),'#e6b62f',meta={'host':name+'.tab','path':a['path'],'backside':'미확정 · 전체 뒷면 복제 없음'})
        x=g+a['start']; y=t['gatherY']+(a['offsetY'] if a['path']=='top' else 0); z=t['gatherZ']+t['thickness']/2+a['thickness']
        if a.get('face','top')=='bottom': z=2*t['gatherZ']-z
        width=a['width'] if a['path']=='top' else t['width']+2*a['thickness']
        edgeZ=z
        if a['path']=='top_edges':
            edgeZ=t['gatherZ']+t['thickness']/2-t['edgeR']-a['edgeDrop']
            if a.get('face','top')=='bottom': edgeZ=2*t['gatherZ']-edgeZ
        for suffix,v in [('start',(x,y,z)),('end',(x+a['length'],y,z)),('widthMinus',(x+a['length']/2,y-width/2,edgeZ)),('widthPlus',(x+a['length']/2,y+width/2,edgeZ)),('face',(x+a['length']/2,y,z))]: point(key+'.'+suffix,'테이프 '+suffix,v,'face' if suffix=='face' else 'point')
    f=pole['leadFilm']
    if f['enabled']:
        outer=box(f['length'],l['width']+2*f['overhang'],l['thickness']+2*f['thickness'],g+f['start']+f['length']/2,leadY,leadZ)
        inner=box(f['length']+2,l['width'],l['thickness'],g+f['start']+f['length']/2,leadY,leadZ)
        add('leadFilm','리드 실링 필름 (가정)',outer.cut(inner),'#9a8667')
    for key,title,v,kind in [
        ('tab.root','탭 뿌리 중심',(0,t['rootY'],t['rootZ']),'point'),('tab.gather','집속 중심',(g,t['gatherY'],t['gatherZ']),'point'),
        ('tab.end','탭 끝 상단 모서리',(g+t['length'],t['gatherY'],t['gatherZ']+t['thickness']/2),'edge'),
        ('tab.top','집속 상면',(g+t['length']/2,t['gatherY'],t['gatherZ']+t['thickness']/2),'face'),
        ('tab.bottom','집속 하면',(g+t['length']/2,t['gatherY'],t['gatherZ']-t['thickness']/2),'face'),
        ('lead.start','리드 시작 상단 모서리',(leadX,leadY,leadZ+l['thickness']/2),'edge'),('lead.end','리드 끝 상단 모서리',(leadX+l['length'],leadY,leadZ+l['thickness']/2),'edge'),
        ('lead.widthMinus','리드 폭 − 상단 모서리',(leadX+l['length']/2,leadY-l['width']/2,leadZ+l['thickness']/2),'edge'),('lead.widthPlus','리드 폭 + 상단 모서리',(leadX+l['length']/2,leadY+l['width']/2,leadZ+l['thickness']/2),'edge'),
        ('lead.top','리드 상면',(leadX+l['length']/2,leadY,leadZ+l['thickness']/2),'face'),('lead.bottom','리드 하면',(leadX+l['length']/2,leadY,leadZ-l['thickness']/2),'face'),
        ('lead.overlapStart','겹침 시작',(leadX,(overlapMinY+overlapMaxY)/2,interfaceZ),'edge'),('lead.overlapEnd','겹침 끝',(g+t['length'],(overlapMinY+overlapMaxY)/2,interfaceZ),'edge')]: point(key,title,v,kind)
    # Fix multi-component part IDs, never infer topology indices.
    for key,feat in features.items():
        candidates=[x['id'] for x in parts if key.startswith(x['id']+'.')]
        if candidates: feat['partId']=max(candidates,key=len)
        if key.endswith('.top'): feat['normal']=[0,0,1]
        elif key.endswith('.bottom'): feat['normal']=[0,0,-1]
        if key in [name+'.lead.top',name+'.lead.bottom']:
            feat['patch']={'u':[e*l['length']/2,0,0],'v':[0,l['width']/2,0]}
    return parts,features,paths

def ring(l,w,r,start,width,z,t):
    outer=cq.Solid.extrudeLinear(roundwire(l+2*(start+width),w+2*(start+width),r+start+width,z),[],cq.Vector(0,0,t))
    inner=cq.Solid.extrudeLinear(roundwire(l+2*start,w+2*start,r+start,z-1),[],cq.Vector(0,0,t+2))
    return outer.cut(inner).clean()

def folded_margin(q,upper=True):
    """Two long-edge trim flaps. Arc-length preserving cylindrical bend, no scaling.
    End corners are relief cut in the demo. Unknown product fold, explicit assumption.
    """
    L=q['openingLength']; W=q['openingWidth']; start=q['sealGap']+q['sealWidth']; m=q['trimMargin']; t=q['filmThickness']; R=q['foldR']; angle=math.radians(q['foldAngle']); straight=m-R*angle
    if angle<1e-8: return ring(L,W,q['planR'],start,m,0,t)
    # The short-end perimeter remains flat; remove long straight trim bands before bends.
    flat=ring(L,W,q['planR'],start,m,0,t)
    length=L-2*q['planR']; parts=[]
    for sign in [-1,1]:
        y=sign*(W/2+start)
        flat=flat.cut(box(length,2*m+2,10,0,y+sign*(m+1),0))
        # Upper trim bends upwards; lower follows below with its own film.
        def pt(a,r): return (r*math.sin(a),R-r*math.cos(a))
        p1=pt(angle,R); pm=pt(angle/2,R); p2=(p1[0]+straight*math.cos(angle),p1[1]+straight*math.sin(angle))
        # Material on outside (+z at the root); radius R-t.
        po=pt(angle,R-t); pmo=pt(angle/2,R-t); pe=(po[0]+straight*math.cos(angle),po[1]+straight*math.sin(angle))
        prof=(cq.Workplane('YZ',origin=(-length/2,0,0)).moveTo(0,0).threePointArc(pm,p1).lineTo(*p2).lineTo(*pe).lineTo(*po).threePointArc(pmo,(0,t)).close())
        flap=prof.extrude(length).val()
        if sign==-1: flap=flap.mirror('XZ')
        parts.append(flap.translate((0,y,0)))
    return cq.Compound.makeCompound([flat]+parts)

def build(p,stage='assembly'):
    validate(p); s=p['stack']; q=p['pouch']; parts=[]; features={}; paths=[]
    parts.append({'id':'stack','name':'낱장 전극 적층 조립체','shape':rounded(s['length'],s['width'],s['thickness'],s['cornerR']),'color':'#c2c5c2','role':'solid','meta':{'method':'낱장 적층형, 권취 아님','layers':'포락 형상. 보조선은 실제 층수 아님'}})
    for axis,key,dim in [(0,'length',s['length']),(1,'width',s['width']),(2,'thickness',s['thickness'])]:
        for sign,name in [(-1,'minus'),(1,'plus')]:
            v=[0,0,0];v[axis]=sign*dim/2
            normal=[0,0,0];normal[axis]=sign
            features[f'stack.{key}.{name}']={'partId':'stack','kind':'face','name':f'조립체 {key} {name} 면 중심','point':v,'normal':normal}
            if axis==2: features[f'stack.{key}.{name}']['patch']={'u':[s['length']/2,0,0],'v':[0,s['width']/2,0],'halfSize':[s['length']/2,s['width']/2],'cornerR':s['cornerR']}
    for i in range(1,12):
        z=-s['thickness']/2+s['thickness']*i/12
        paths.append({'partId':'stack','color':'#858f8c','points':[[-s['length']/2+s['cornerR'],-s['width']/2-.01,z],[s['length']/2-s['cornerR'],-s['width']/2-.01,z]]})
    for name in ['positive','negative']:
        ps,fs,ls=build_pole(name,p[name],s);parts+=ps;features.update(fs);paths+=ls
    if stage!='assembly':
        for side,sign in [('upper',1),('lower',-1)]:
            depth=q[side+'Depth']; rf=q[side+'FloorR']; rt=q[side+'RimR']; film=q['filmThickness']
            shell=pocket(q['openingLength'],q['openingWidth'],depth,rf,rt,q['planR'],film)
            for sub,shape,color,role in [
                ('pocket',shell,'#b8c7cb','shell'),
                ('terrace',ring(q['openingLength'],q['openingWidth'],q['planR'],0,q['sealGap'],0,film),'#b3c0c2','shell'),
                ('seal',ring(q['openingLength'],q['openingWidth'],q['planR'],q['sealGap'],q['sealWidth'],0,film),'#91aaa8','seal'),
                ('margin',folded_margin(q) if stage=='finished' else ring(q['openingLength'],q['openingWidth'],q['planR'],q['sealGap']+q['sealWidth'],q['trimMargin'],0,film),'#b6c4c5','shell')]:
                if sign==-1: shape=shape.mirror('XY')
                # nominal two films meet at datum A. End lead accommodation isn't formed here.
                parts.append({'id':f'pouch.{side}.{sub}','name':('상부' if sign==1 else '하부')+' 파우치 · '+{'pocket':'성형 포켓','terrace':'성형–실링 여유','seal':'실링 관리 영역','margin':'외곽/접힘 예시'}[sub],'shape':shape,'color':color,'role':role,'meta':{'filmThickness':film,'assumption':'균일 공칭 필름. 실링 압축·리드 통과부 국부 성형 미적용'}})
            if stage=='packaged':
                for ys,suffix in [(-1,'Minus'),(1,'Plus')]:
                    extra=q['packagingExtraY'+suffix]
                    if extra>0:
                        end=q['openingWidth']/2+q['sealGap']+q['sealWidth']+q['trimMargin']
                        shape=box(q['openingLength']-2*q['planR'],extra,film,0,ys*(end+extra/2),sign*film/2)
                        parts.append({'id':f'pouch.{side}.extraY{suffix}','name':('상부' if sign==1 else '하부')+' 외장 추가 여유 '+suffix+' (용도 미확정)','shape':shape,'color':'#b6c4c5','role':'shell','meta':{'assumption':'사진의 이어진 외장 참고 · 가스 포켓/실링부로 확정하지 않음. 완성 상태에서 제거는 구현 가정'}})
            for key,value,point in [('depth',depth,[0,0,sign*depth]),('floorR',rf,[0,q['openingWidth']/2-rt-rf,sign*depth]),('rimR',rt,[0,q['openingWidth']/2,0]),('planR',q['planR'],[q['openingLength']/2-q['planR'],q['openingWidth']/2,0])]:
                center=[0,point[1],sign*(depth-rf)] if key=='floorR' else [0,q['openingWidth']/2,sign*rt] if key=='rimR' else [q['openingLength']/2-q['planR'],q['openingWidth']/2-q['planR'],0] if key=='planR' else [0,0,0]
                features[f'pouch.{side}.{key}']={'partId':f'pouch.{side}.pocket','kind':'radius' if key.endswith('R') else 'face','name':side+' '+key,'point':point,'center':center,'value':value}
            for key,z,n in [('innerFloor',sign*depth,-sign),('outerFloor',sign*(depth+film),sign)]:
                features[f'pouch.{side}.{key}']={'partId':f'pouch.{side}.pocket','kind':'face','name':side+' '+key+' 평탄면','point':[0,0,z],'normal':[0,0,n]}
        for key,offset,part in [('forming',0,'pocket'),('sealInner',q['sealGap'],'seal'),('sealOuter',q['sealGap']+q['sealWidth'],'seal'),('trim',q['sealGap']+q['sealWidth']+q['trimMargin'],'margin')]:
            for axis in ['x','y']:
                for sign,label in [(-1,'minus'),(1,'plus')]:
                    point=[sign*(q['openingLength']/2+offset),0,0] if axis=='x' else [0,sign*(q['openingWidth']/2+offset),0]
                    if key=='trim' and axis=='y' and stage=='packaged': point[1]+=sign*q['packagingExtraY'+('Plus' if sign==1 else 'Minus')]
                    # In finished state the long trim edge is bent, preserving material length.
                    if key=='trim' and axis=='y' and stage=='finished':
                        a=math.radians(q['foldAngle']);R=q['foldR'];rem=q['trimMargin']-R*a
                        point=[0,sign*(q['openingWidth']/2+q['sealGap']+q['sealWidth']+R*math.sin(a)+rem*math.cos(a)),R*(1-math.cos(a))+rem*math.sin(a)]
                    features[f'pouch.{key}.{axis}.{label}']={'partId':'pouch.upper.'+part,'kind':'edge','name':key+' '+axis+' '+label,'point':point}
        # Explicit contact diagnostics. Not a silently claimed interference-free seal.
    warnings=['모든 치수는 예시값입니다. 양극/음극의 사진상 끝 배정은 미확정입니다.', '탭 경로는 부드러운 포락 형상이며 실제 포일 변형/용접 강도 해석이 아닙니다.', '리드 접촉면·리드 필름·테이프 모서리 감쌈과 완제품 접힘은 편집 가능한 구현 가정입니다.']
    if stage!='assembly': warnings.append('리드 통과부 실링 압축/국부 필름 성형은 미지원: 공칭 외장과 리드의 간섭 가능성을 단면에서 확인하세요.')
    for part in parts:
        if not part['shape'].isValid(): raise ModelError([part['id']+': CAD 형상이 유효하지 않습니다'])
    return {'parts':parts,'features':features,'paths':paths,'diagnostics':[{'level':'warning','message':w} for w in warnings]}

def serialize(model,tolerance=.12):
    out={k:v for k,v in model.items() if k!='parts'};out['parts']=[]
    for part in model['parts']:
        shape=part['shape']; vertices,triangles=part.get('displayShape',shape).tessellate(tolerance,.3); b=shape.BoundingBox()
        out['parts'].append({**{k:v for k,v in part.items() if k not in ['shape','displayShape']},'mesh':{'positions':[round(c,7) for v in vertices for c in v.toTuple()],'indices':[i for tri in triangles for i in tri]},'bounds':{'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax]},'volume':shape.Volume() if part['role']!='region' else 0})
    return out
