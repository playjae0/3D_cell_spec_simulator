"""R4 nominal tooling. Source dimensions -> OCC -> metrics; no mechanics claims."""
import math
from copy import deepcopy
import cadquery as cq
from process import ModelError, STAGE_CONTRACT
from proof_pocket import pocket, roundwire
from pouch_process import line_intervals, transform_model
from tab_seal import tab_face, edge_info, report_profile

POLES=('positive','negative')
def rect(l,w,x=0,y=0,z=0,r=0):
    wire=roundwire(l,w,r) if r else cq.Workplane('XY').rect(l,w).val()
    return cq.Face.makeFromWires(wire).translate((x,y,z))
def slab(face,h=.1):return cq.Compound.makeCompound([cq.Solid.extrudeLinear(f.outerWire(),f.innerWires(),cq.Vector(0,0,h)) for f in face.Faces()])
def bounds(shape):
    b=shape.BoundingBox();return [b.xmin,b.ymin,b.xmax,b.ymax]
def paths(shape):
    return [[[p.x,p.y,p.z] for edge in wire.Edges() for p in edge.positions([i/24 for i in range(25)])] for wire in shape.Wires()]
def outline(f):
    vs=f['vertices'];edges=[]
    for i,b in enumerate(vs):
        a=vs[i-1];p=cq.Vector(a['u'],a['v'],0);q=cq.Vector(b['u'],b['v'],0);d=q-p
        if d.Length<1e-7:raise ModelError([f['id']+': 중복 윤곽점'])
        sag=b.get('arc',0)
        if abs(sag)>1e-7:
            mid=(p+q)*.5+cq.Vector(-d.y,d.x,0)*(sag/d.Length)
            edges.append(cq.Edge.makeThreePointArc(p,mid,q))
        else:edges.append(cq.Edge.makeLine(p,q))
    face=cq.Face.makeFromWires(cq.Wire.assembleEdges(edges))
    if not face.isValid() or face.Area()<1e-7:raise ModelError([f['id']+': 닫힌 작업면 윤곽이 자기 교차하거나 유효하지 않습니다'])
    return face

def validate_config(p):
    q=p['processTooling'];errors=[]
    def check(ok,msg):
        if not ok:errors.append(msg)
    def finite(o,path):
        if isinstance(o,dict):
            for k,v in o.items():finite(v,path+'.'+k)
        elif isinstance(o,list):
            for v in o:finite(v,path)
        elif isinstance(o,(float,int)) and not isinstance(o,bool):check(math.isfinite(o),path+': 유한값 필요')
    finite(q,'processTooling');check(q['version']==1,'R4 설정 버전 미지원')
    for side in POLES:
        d=q['poles'][side];g=d['gathering'];t=p[side]['tab'];top=g['topDatumZ']-g['depth']
        check(g['depth']>=0 and top-g['bottomZ']>2*t['edgeR'],side+': 침입 깊이가 잔류 두께/모서리 R을 침범합니다')
        check(t['gatherDistance']>0,side+': 진입 X > 0 필요')
        check(d['method'] in ['ultrasonic','laser'],side+': 용접 방식 미지원')
        for stage,tools in d['tools'].items():
            for kind,f in tools.items():
                pre=side+'.'+stage+'.'+kind
                check(all(f[k]>0 for k in ['length','width','knurlLength','knurlWidth','pitchU','pitchV','height']),pre+': 치수/피치/높이 양수 필요')
                check(0<=f['cornerR']<min(f['length'],f['width'])/2,pre+': 외곽 R 범위 오류')
                check(f['knurlLength']<=f['length'] and f['knurlWidth']<=f['width'],pre+': 너링 범위가 외곽보다 큽니다')
                check(f['tooth'] in ['pyramid','ridge'],pre+': 치형 미지원')
                check(f['knurlLength']/f['pitchU']*f['knurlWidth']/f['pitchV']<5000,pre+': 한 작업면의 표시 너링은 5000개 미만으로 설정하세요')
        l=d['laser'];check(l['diameter']>0 and l['pitchX']>0 and l['pitchY']>0,side+': 레이저 직경/피치 양수 필요')
        check(all(isinstance(l[k],int) and 1<=l[k]<=50 for k in ['rows','columns']),side+': 행열 1–50 정수 필요')
        ids=[s['id'] for s in l['spots']];check(len(ids)==len(set(ids)) and len(ids)<=2500,side+': 스팟 ID 중복 또는 개수 초과')
    for f in q['sealBars'].values():
        if 'tabProfile' in f:
            fields = ['centerLength', 'transitionR', 'centerWidth', 'outerWidth', 'startU', 'endU', 'centerOffset']
            valid = f['location'] in POLES and isinstance(f['tabProfile'], dict) and all(
                isinstance(f['tabProfile'].get(k), (float, int)) and not isinstance(f['tabProfile'][k], bool)
                for k in fields)
            check(valid, f['id'] + ': 탭측 접선 윤곽 입력 누락 또는 형식 오류')
            if valid and not errors:
                tab_face(f, p)
        else:
            check(3 <= len(f['vertices']) <= 100, f['id'] + ': 윤곽점 3–100개 필요')
        check(f['extra']['length']>0 and f['extra']['width']>0,f['id']+': 추가 타격 치수 양수 필요')
        check(f['relief']['length']>0 and f['relief']['depth']>=0,f['id']+': 상세 홈 치수 오류')
    a=q['packaging'];check(a['bridgeInnerR']>0,'브리지 R > 0 필요')
    check(q['sealBars']['final_upper']['v']<a['cutY']<q['sealBars']['gas_upper']['v'],'최종 실링선 < 절단선 < 가스방 외곽선 필요')
    check(a['foldR']>0 and 0<=a['foldAngle']<=120,'폴딩 R/각도 범위 오류')
    if errors:raise ModelError(errors)

def resolved(p):
    out=deepcopy(p);q=out.pop('processTooling')
    for side in POLES:
        g=q['poles'][side]['gathering'];t=out[side]['tab'];top=g['topDatumZ']-g['depth']
        t['thickness']=top-g['bottomZ'];t['gatherZ']=(top+g['bottomZ'])/2
        if q['poles'][side]['method']=='laser':out[side]['joints']=[]
    return out

def add_part(m,id,name,shape,color,role='region',meta=None):
    if not shape.isValid():raise ModelError([id+': CAD 형상 오류'])
    m['parts'].append({'id':id,'name':name,'shape':shape,'color':color,'role':role,'meta':meta or {}})
def feature(m,id,part,p,**kw):
    m['features'][id]={'partId':part,'kind':'point','name':id,'point':list(p),'available':True,**kw}
def metric(m,id,part,a,b,name,**kw):
    feature(m,id+'.a',part,a);feature(m,id+'.b',part,b)
    m.setdefault('processMetrics',[]).append({'id':id,'name':name,'a':id+'.a','b':id+'.b','mode':'distance','kind':'calculated',**kw})
def pose(face,f):return face.rotate((0,0,0),(0,0,1),f['rotation']).translate((f['x'],f['y'],0))
def welding(m,p,source,stage):
    from model import place
    rank=['stacked','gathered','preweld','welded','assembly'].index(stage) if stage in ['stacked','gathered','preweld','welded','assembly'] else 4
    q=source['processTooling'];report=m.setdefault('toolingResults',{'poles':{},'seals':{},'plans':{}})
    for side in POLES:
        pole=p[side];t=pole['tab'];cfg=q['poles'][side];g=cfg['gathering'];entry=t['gatherDistance'];top=t['gatherZ']+t['thickness']/2;bottom=g['bottomZ'];width=t['foilWidth']
        report['poles'][side]={'topZ':top,'entryZ':t['gatherZ'],'bottomZ':bottom,'residualThickness':t['thickness'],'topSlope':(top-t['rootZ']-t['rootSpread']/2)/entry,'bottomSlope':(bottom-t['rootZ']+t['rootSpread']/2)/entry,'entryX':entry,'foilWidth':width,'rootZ':t['rootZ'],'rootSpread':t['rootSpread'],'depth':g['depth']}
        if rank<2:continue
        e=pole['end'];L=p['stack']['length'];xyz=lambda x,y,z:[e*(L/2+entry+x),t['gatherY']+y,z]
        metric(m,'r4.'+side+'.residual',side+'.tab',xyz(0,0,bottom),xyz(0,0,top),side+' 집속 잔류 두께')
        wstage='preweld' if rank==2 else 'welded';lead=pole['lead'];z=top if rank==2 else bottom if lead['contactSide']=='below' else top
        contact=rect(t['rootLength']-entry-t['axialShortening'],width,(t['rootLength']-entry-t['axialShortening'])/2)
        if rank>=3:
            contact=contact.intersect(rect(lead['length'],lead['width'],lead['start']+lead['length']/2,lead['offsetY']))
        plans={'overlap':paths(contact),'stage':wstage,'datum':'U=탭 진입 X부터 바깥쪽, V=집속 중심 Y부터; 제품 A/B/C 연계','tools':{},'spots':[]}
        if rank==2 or cfg['method']=='ultrasonic':
            for kind,f in cfg['tools'][wstage].items():
                outer=pose(rect(f['length'],f['width'],r=f['cornerR']),f);knurl=pose(rect(f['knurlLength'],f['knurlWidth']),f)
                if knurl.cut(outer).Area()>1e-7:raise ModelError([side+'.'+kind+': 너링 모서리가 공구 외곽을 벗어납니다'])
                hit=knurl.intersect(contact)
                id=f'tool.{side}.{wstage}.{kind}'
                toolZ=top if kind=='horn' else bottom
                if rank>=3:
                    toolZ=max(top,top+lead['thickness']) if kind=='horn' and lead['contactSide']=='above' else bottom-lead['thickness'] if kind=='anvil' and lead['contactSide']=='below' else toolZ
                actual=place(outer.translate((entry,t['gatherY'],toolZ)),e,L)
                add_part(m,id,side+' '+kind+' 작업면 · '+f['revision'],actual,'#5b86db' if kind=='horn' else '#be79c8')
                if hit.Area()>1e-7:
                    part=side+'.contact.'+kind;real=place(hit.translate((entry,t['gatherY'],toolZ)),e,L)
                    add_part(m,part,side+' '+kind+' 공칭 접촉 (접합/압흔 아님)',real,'#559ed0' if kind=='horn' else '#b467a5')
                    m['parts'][-1]['displayShape']=real.translate((0,0,top-toolZ+.012+(.002 if kind=='horn' else 0)))
                    c=hit.Center();feature(m,part+'.center',part,xyz(c.x,c.y,toolZ),kind='face')
                plans['tools'][kind]={'outer':paths(outer),'knurl':paths(knurl),'contact':paths(hit),'contactArea':hit.Area(),'surfaceZ':toolZ,'center':[hit.Center().x,hit.Center().y] if hit.Area()>1e-7 else None,'definition':deepcopy(f)}
        else:
            laser=cfg['laser'];r=laser['diameter']/2;rot=math.radians(laser['rotation']);co=math.cos(rot);si=math.sin(rot)
            for spot in laser['spots']:
                x=(spot['column']-(laser['columns']-1)/2)*laser['pitchX']+spot['dx'];y=(spot['row']-(laser['rows']-1)/2)*laser['pitchY']+spot['dy'];x,y=laser['x']+x*co-y*si,laser['y']+x*si+y*co
                circle=cq.Face.makeFromWires(cq.Wire.makeCircle(r,cq.Vector(x,y,0),cq.Vector(0,0,1)));outside=circle.cut(contact).Area()>1e-6;id=side+'.laser.'+spot['id']
                shape=place(circle.translate((entry,t['gatherY'],z)),e,L);add_part(m,id,side+' 레이저 '+spot['id']+(' · 원주 겹침 이탈' if outside else ''),shape,'#ef5757' if outside else '#54b79e')
                m['parts'][-1]['displayShape']=shape.translate((0,0,top-z+.015));feature(m,id+'.center',id,xyz(x,y,z),kind='face');metric(m,id+'.diameter',id,xyz(x-r,y,z),xyz(x+r,y,z),side+' '+spot['id']+' 공칭 직경')
                plans['spots'].append({'id':spot['id'],'x':x,'y':y,'diameter':2*r,'outside':outside})
                if outside:m['diagnostics'].append({'level':'warning','message':id+': 중심 위치와 무관하게 원주가 탭–리드 겹침 밖입니다'})
        report['plans'][side]=plans

def seal_transform(face,f,p):
    loc=f['location']
    pole = p.get(loc)
    u = pole['tab']['gatherY'] + pole['lead']['offsetY'] if 'tabProfile' in f else f['u']
    face=face.rotate((0,0,0),(0,0,1),f['rotation']).translate((u,f['v'],0))
    if loc in POLES:
        # (u,v)->(end*v,u). Workface normal is not used as polarity.
        face=face.rotate((0,0,0),(0,0,1),90)
        if p[loc]['end']==1:face=face.mirror('YZ')
    return face

def packaging(m,p,stage):
    from model import box
    from pouch_process import validate as validate_pouch,fold_shape
    from pouch_material import profile, mapped_point
    q=p['pouchProcess'];cfg=p['processTooling'];a=cfg['packaging'];step=STAGE_CONTRACT[stage]['step'];opened=step<2
    validate_pouch(q,'pouch_formed');t=q['sheets']['lower']['filmThickness'];R=a['bridgeInnerR'];bridge=math.pi*(R+t/2);edge=q['sheets']['lower']['blank']['yMinus'];upper=q['sheets']['upper'];lower=q['sheets']['lower']
    if abs(upper['filmThickness']-t)>1e-8:raise ModelError(['한 장 필름: 상하 필름 두께가 같아야 합니다'])
    if abs(upper['blank']['yPlus']+edge)>1e-8:raise ModelError(['한 장 필름: 상부 blank.yPlus = −하부 blank.yMinus 이어야 닫힌 두 컵의 중심이 정렬됩니다'])

    if a['cutY']<=a['foldLineY']+a['foldR']*math.radians(a['foldAngle']):raise ModelError(['절단 후 남는 재료가 폴딩 호 길이보다 짧습니다'])
    reports=m['toolingResults'];reports['packaging']={'step':step,'open':opened,'bridgeWidth':bridge,'bridgeEdgeY':edge,'gasState':['열린 필름 여유','수납 · 열린 여유','닫힘 · 가스측 개구','탭 실링 · 가스측 개구','가스방 외곽 실링 · 몸체와 연통','최종 실링 · 가스방 격리','가스방 제거','절단 잔여 플랜지 폴딩'][step],'cutY':a['cutY'],'upperDepth':upper['depth'],'upperFloorR':upper['floorR'],'lowerDepth':lower['depth'],'lowerFloorR':lower['floorR'],'remainingFlange':a['cutY']-lower['openingWidth']/2}
    flangeFaces=[];fold_profiles={}
    phase1 = any('tabProfile' in bar for bar in cfg['sealBars'].values())
    cup_edge = a['cups']['lower']['y'] + lower['openingWidth'] / 2
    for half in ['lower','upper']:
        h=q['sheets'][half];L,W,d,rf,rt,pr,film=[h[k] for k in ['openingLength','openingWidth','depth','floorR','rimR','planR','filmThickness']]
        cx=a['cups'][half]['x'];cy=a['cups'][half]['y']*(-1 if half=='upper' else 1)
        b=deepcopy(h['blank']);cut=step>=6
        if not (b['xMinus']<cx-L/2 and cx+L/2<b['xPlus'] and b['yMinus']<cy-W/2 and cy+W/2<b['yPlus']):raise ModelError([half+': 컵 입구 위치/크기가 필름 경계를 벗어납니다'])
        if step>=1 and (L-2*(rf+rt)<p['stack']['length']+2*abs(cx) or W-2*(rf+rt)<p['stack']['width']+2*abs(cy) or d+R<p['stack']['thickness']/2):raise ModelError([half+': 컵 바닥/깊이가 조립체와 간섭합니다'])
        if cut:
            b['xMinus']=h['cut']['xMinus'];b['xPlus']=h['cut']['xPlus']
            b['yPlus' if half=='lower' else 'yMinus']=a['cutY']*(1 if half=='lower' else -1)
        face=rect(b['xPlus']-b['xMinus'],b['yPlus']-b['yMinus'],(b['xPlus']+b['xMinus'])/2,(b['yPlus']+b['yMinus'])/2).cut(cq.Face.makeFromWires(roundwire(L,W,pr)).translate((cx,cy,0)))
        shell=pocket(L,W,d,rf,rt,pr,film).mirror('XY').translate((cx,cy,0));flange=cq.Solid.extrudeLinear(face.Faces()[0].outerWire(),face.Faces()[0].innerWires(),cq.Vector(0,0,-film))
        if half=='upper':
            if opened:
                y=edge-bridge-h['blank']['yPlus'];shell=shell.translate((0,y,-R));flange=flange.translate((0,y,-R));face=face.translate((0,y,0));sign=-1;centerY=y+cy;z=-R
            else:
                shell=shell.rotate((0,0,0),(1,0,0),180).translate((0,0,R));flange=flange.rotate((0,0,0),(1,0,0),180).translate((0,0,R));face=face.mirror('XZ');sign=1;centerY=-cy;z=R
        else:shell=shell.translate((0,0,-R));flange=flange.translate((0,0,-R));sign=-1;centerY=cy;z=-R
        flangeFaces.append(face)
        if step>=7:
            # The existing arc-length preserving fold kernel consumes the retained material.
            fq={'neutralFraction':.5,'seamGap':2*R,'sheets':{'upper':{'filmThickness':film},'lower':{'filmThickness':film}},'folds':{'r4':{'enabled':True,'edge':'yPlus','order':1,'line':a['foldLineY'],'angle':a['foldAngle'],'innerR':a['foldR']}}}
            profiles={edge:profile(fq,edge,a['cutY'] if edge=='yPlus' else abs(lower['blank']['yMinus'])) for edge in ['yMinus','yPlus']};flange=fold_shape(flange,profiles,R if half=='upper' else -R-t,R+t if half=='upper' else -R);fold_profiles=profiles
        part='pouch.'+half+'.pocket';add_part(m,part,half+' 성형 컵 · '+('입구 +Z' if opened else '닫힘'),shell,'#bacad0','shell')
        add_part(m,'pouch.'+half+'.flange',half+' 필름 외곽 · '+reports['packaging']['gasState'],flange,'#b0c1c7','shell')
        metric(m,'r4.'+half+'.depth',part,[cx,centerY,z],[cx,centerY,z+sign*d],half+' 성형 깊이')
        for key,value,point,center in [
            ('floorR',rf,[cx,centerY+W/2-rt-rf,z+sign*d],[cx,centerY+W/2-rt-rf,z+sign*(d-rf)]),
            ('rimR',rt,[cx,centerY+W/2,z],[cx,centerY+W/2,z+sign*rt]),
            ('planR',pr,[cx+L/2-pr,centerY+W/2,z],[cx+L/2-pr,centerY+W/2-pr,z])]:
            feature(m,part+'.'+key,part,point,kind='radius',value=value,center=center)
        feature(m,part+'.opening',part,[cx,centerY,z],kind='face',normal=[0,0,1 if opened or half=='lower' else -1])
    xmin=max(lower['blank']['xMinus'],upper['blank']['xMinus']);xmax=min(lower['blank']['xPlus'],upper['blank']['xPlus'])
    if step>=6:xmin=max(lower['cut']['xMinus'],upper['cut']['xMinus']);xmax=min(lower['cut']['xPlus'],upper['cut']['xPlus'])
    if opened:bs=box(xmax-xmin,bridge,t,(xmin+xmax)/2,edge-bridge/2,-R-t/2)
    else:
        bs=(cq.Workplane('YZ',origin=(xmin,edge,0)).moveTo(0,-R).threePointArc((-R,0),(0,R)).lineTo(0,R+t).threePointArc((-R-t,0),(0,-R-t)).close().extrude(xmax-xmin).val())
    add_part(m,'pouch.bridge','동일 필름 브리지 · '+('평면' if opened else '180° 공칭 접힘'),bs,'#7ca3b1','shell')
    feature(m,'pouch.bridge.center','pouch.bridge',[0,edge-bridge/2,-R] if opened else [0,edge-R,0],kind='edge')
    if step>=1:
        for side in POLES:
            pole=p[side];tab=pole['tab'];lf=pole['leadFilm'];center=pole['end']*(p['stack']['length']/2+tab['gatherDistance']+lf['start']+lf['length']/2)
            reports['packaging'][side+'SealantX']=center
    if phase1:
        report = reports['packaging']
        report['remainingFlange'] = a['cutY'] - cup_edge
        report['gasAllowance'] = lower['blank']['yPlus'] - cup_edge
        report['filmEdgeY'] = a['cutY'] if step >= 6 else lower['blank']['yPlus']
        if step >= 6:
            report['foldTip'] = mapped_point(fold_profiles, [0, a['cutY'], R+t])
    if opened:return
    film=flangeFaces[0].intersect(flangeFaces[1]);seals={};tab_edges={}
    for key,f in cfg['sealBars'].items():
        loc=f['location'];required=3 if loc in POLES else 4 if loc=='gas' else 5
        if 'tabProfile' in f:
            base, tab_edges[key] = tab_face(f, p)
        else:
            base = outline(f)
        extra=f['extra'];union=base
        if extra['enabled']:union=base.fuse(rect(extra['length'],extra['width'],extra['u'],extra['v'])).clean()
        relief=f['relief'];working=union
        if relief['enabled'] and relief['depth']>0:
            bb=union.BoundingBox();working=union.cut(rect(relief['length'],bb.ylen+2,relief['u'],(bb.ymax+bb.ymin)/2))
        projected=seal_transform(working,f,p);seals[key]=projected
        reports['seals'][key]={'base':paths(base),'union':paths(union),'working':paths(working),'projected':paths(projected),'projectionArea':projected.Area(),'baseArea':base.Area(),'definition':deepcopy(f),'active':step>=required}
        if key in tab_edges:
            reports['seals'][key]['tabDimensions'] = {
                name: edge_info(edge) for name, edge in tab_edges[key].items()
            }
        if step>=required and step<6 and projected.Area()>1e-8:
            z=R+t+.02 if f['half']=='upper' else -R-t-.02
            add_part(m,'tool.seal.'+key,key+' 실링바 작업면',projected.translate((0,0,z)),'#688dcc' if f['half']=='upper' else '#b481bc')
    if phase1:
        gas = seals['gas_upper'].intersect(seals['gas_lower'])
        final = seals['final_upper'].intersect(seals['final_lower'])
        if gas.Area() < 1e-7 or final.Area() < 1e-7:
            raise ModelError(['가스방·최종 실링의 상하 작업면이 서로 겹쳐야 합니다'])
        if not final.BoundingBox().ymax < a['cutY'] < gas.BoundingBox().ymin:
            raise ModelError(['절단선은 최종 실링 바깥 끝과 가스방 외곽 실링 사이에 있어야 합니다'])
    product_regions={}
    for loc in ['positive','negative','gas','final']:
        required=3 if loc in POLES else 4 if loc=='gas' else 5
        upper=seals[loc+'_upper'];bottom=seals[loc+'_lower'];effective=upper.intersect(bottom);product=effective.intersect(film)
        product_regions[loc]=product
        report={'overlapArea':effective.Area(),'productArea':product.Area(),'effective':paths(effective),'product':paths(product),'sections':[]};reports['seals'][loc]=report
        # Preserve pre-cut record, while trimmed product only contains retained material.
        if step>=required and not(step>=6 and loc=='gas') and product.Area()>1e-8:
            surface_z = R + t
            shape_z = surface_z if phase1 else surface_z + .008
            shape = product.translate((0,0,shape_z))
            if step>=7:
                shape = fold_shape(slab(shape,.004), fold_profiles, shape_z, shape_z+.004)
            colors = {'gas': '#398bb5', 'final': '#af713a'}
            add_part(m,'seal.'+loc,loc+' 제품 공칭 실링 (상하 유효 중첩∩필름)',shape,
                     colors.get(loc,'#dca857') if phase1 else '#dca857')
            if phase1 and step < 7:
                # Offset only the display mesh to avoid z-fighting with the film.
                m['parts'][-1]['displayShape'] = shape.translate((0,0,.008))
            if phase1:
                report['retainedBounds'] = {
                    'min': [shape.BoundingBox().xmin, shape.BoundingBox().ymin, shape.BoundingBox().zmin],
                    'max': [shape.BoundingBox().xmax, shape.BoundingBox().ymax, shape.BoundingBox().zmax],
                }
        if loc in POLES:
            pole=p[loc];tab=pole['tab'];lead=pole['lead'];lf=pole['leadFilm'];cy=tab['gatherY']+lead['offsetY'];filmX=sorted([pole['end']*(p['stack']['length']/2+tab['gatherDistance']+lf['start']+a) for a in [0,lf['length']]])
            for label,y in [('left',cy-lead['width']/2),('center',cy),('right',cy+lead['width']/2)]:
                intervals=line_intervals(slab(product),[0,y,.05],[1,0,0]) if product.Area()>1e-8 else []
                w=sum(b-a for a,b in intervals);ov=sum(max(0,min(b,filmX[1])-max(a,filmX[0])) for a,b in intervals) if lf['enabled'] else 0
                report['sections'].append({'id':label,'y':y,'width':w,'sealantOverlap':ov,'intervals':intervals})
                if step>=required and intervals:
                    lo,hi=max(intervals,key=lambda v:v[1]-v[0]);metric(m,'r4.seal.'+loc+'.'+label,'seal.'+loc,[lo,y,0],[hi,y,0],loc+' '+label+' 실링 폭')
        if loc in POLES and any(loc+'_'+half in tab_edges for half in ('upper','lower')):
            report_profile(m, p, loc, step, product, tab_edges, reports, fold_profiles, R+t)
        report['retainedAfterCut']=step>=6
    if step>=4:
        for side in POLES:
            if not line_intervals(slab(product_regions[side]),[0,edge+1e-5,.05],[1,0,0]):
                raise ModelError([side+': 탭측 실링이 브리지까지 닿지 않아 열린 경로가 남습니다. 바 U 배치/끝 윤곽을 수정하세요.'])
            for boundary in (['gas'] if step==4 else ['gas','final'] if step==5 else ['final']):
                if product_regions[side].intersect(product_regions[boundary]).Area()<1e-7:
                    raise ModelError([side+': '+boundary+' 실링과 연결되지 않습니다. 작업면 끝/배치를 확인하세요.'])
    if phase1:
        def boundary(id, part, y, start, stop, mapped=False):
            ends = [[x, y, R+t] for x in (start, stop)]
            if mapped:
                ends = [mapped_point(fold_profiles, point) for point in ends]
            feature(m, id, part, [(u+v)/2 for u,v in zip(*ends)], kind='edge', segment=ends)

        if step >= 5:
            boundary('phase1.cut.line', 'pouch.upper.flange', a['cutY'], xmin, xmax, step >= 7)
        if step >= 4 and step < 6:
            b = product_regions['gas'].BoundingBox()
            boundary('phase1.gas.outer', 'seal.gas', b.ymax, b.xmin, b.xmax)
        if step >= 5:
            b = product_regions['final'].BoundingBox()
            boundary('phase1.final.inner', 'seal.final', b.ymin, b.xmin, b.xmax)
    if step>=6:metric(m,'r4.trim.remaining','pouch.lower.flange',mapped_point(fold_profiles,[0,cup_edge if phase1 else lower['openingWidth']/2,-R]),mapped_point(fold_profiles,[0,a['cutY'],-R]),'절단 잔여 재료 폭',materialValue=a['cutY']-(cup_edge if phase1 else lower['openingWidth']/2))
    m['diagnostics'].append({'level':'warning','message':'실링은 평면 공칭 영역입니다. 브리지 폐합은 원통 굽힘; 리드 통과부 국부 필름 변형/융착 강도/가스 팽창은 해석하지 않습니다.'})

def build_r4(source,stage,base_builder):
    validate_config(source);p=resolved(source);cap=STAGE_CONTRACT[stage]
    stageAssembly='assembly' if cap.get('r4') else stage
    # Root-only/gathered views retain their upstream definition; depth starts at preweld.
    if stage in ['stacked','gathered']:
        p=deepcopy(source);p.pop('processTooling')
    if cap.get('r4') and cap['assembly'] is None:m={'parts':[],'features':{},'paths':[],'diagnostics':[]}
    else:m=base_builder(p,stageAssembly)
    m['stage']=stage;m['processCapabilities']={'r4':True};m['toolingResults']={'poles':{},'seals':{},'plans':{}}
    welding(m,resolved(source),source,'stacked' if cap.get('r4') and cap['assembly'] is None else stageAssembly)
    if cap.get('r4'):
        # Tooling is not present in downstream manufacturing states; records remain in source.
        m['parts']=[x for x in m['parts'] if not x['id'].startswith('tool.') and '.contact.' not in x['id']]
        p['processTooling']=source['processTooling'];packaging(m,p,stage)
    ids={x['id'] for x in m['parts']}
    for f in m['features'].values():
        if f.get('partId') not in ids and not f.get('partId','').startswith('datum'):
            f.update(available=False,reason='현재 공정에 존재하지 않는 참조')
    return m
