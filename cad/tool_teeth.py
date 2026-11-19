"""OCC contact relief; tip plane preserves the existing nominal workface datum.
Only contact relief is defined: no unmeasured horn/anvil body or indentation.
"""
import math
import json
from functools import lru_cache
import cadquery as cq
from process import ModelError


def polygon(points):
    return cq.Face.makeFromWires(cq.Wire.makePolygon([cq.Vector(*p) for p in points], close=True))


@lru_cache(maxsize=64)
def contact_relief(encoded, kind):
    f = json.loads(encoded)
    pu, pv, height = (f[k] for k in ('pitchU', 'pitchV', 'height'))
    # Original workface z=0 is the contact/tip plane. Material extends away.
    root = height if kind == 'horn' else -height
    angle = math.radians(f['direction']); c, s = math.cos(angle), math.sin(angle)
    length, width = f['knurlLength'], f['knurlWidth']
    span = math.hypot(length, width) / 2
    nu, nv = math.ceil(span / pu), math.ceil(span / pv)
    def point(u, v, z): return (u*c-v*s, u*s+v*c, z)
    solids, centers = [], []
    # Origin at workface center, integer lattice. Whole teeth only, no clipped teeth.
    # A full pitch tile is the footprint; adjacent teeth meet only at their bases.
    for i in range(-nu, nu+1):
        for j in range(-nv, nv+1):
            u, v = i*pu, j*pv
            corners = [point(u+du*pu/2, v+dv*pv/2, root) for du,dv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            if any(abs(x)>length/2+1e-9 or abs(y)>width/2+1e-9 for x,y,z in corners): continue
            if f['tooth'] == 'pyramid':
                apex = point(u,v,0)
                faces = [polygon(corners[::-1])] + [polygon([corners[k],corners[(k+1)%4],apex]) for k in range(4)]
            else:
                # Legacy ridge: triangular U profile repeated in V pitch tiles.
                a,b = point(u,v-pv/2,0),point(u,v+pv/2,0)
                faces = [polygon(corners[::-1]), polygon([corners[0],corners[1],a]),
                         polygon([corners[2],corners[3],b]),polygon([corners[1],corners[2],b,a]),
                         polygon([corners[3],corners[0],a,b])]
            solid = cq.Solid.makeSolid(cq.Shell.makeShell(faces))
            if solid.Volume()<0: solid=cq.Shape.cast(solid.wrapped.Reversed())
            if not solid.isValid(): raise ModelError(['공구 치형 OCC 솔리드 오류'])
            solids.append(solid);centers.append(point(u,v,0))
    if not solids: raise ModelError(['너링 영역에 완전한 치형이 없습니다. 피치·방향·너링 영역을 확인하세요.'])
    if len(solids)>5000: raise ModelError(['치형 수 5000개 초과'])
    base = cq.Workplane('XY').rect(f['length'], f['width']).val()
    if f['cornerR']:
        from proof_pocket import roundwire
        base=roundwire(f['length'], f['width'],f['cornerR'])
    face=cq.Face.makeFromWires(base).translate((0,0,root))
    return cq.Compound.makeCompound([face,*solids]), centers


def generate(f, kind):
    intrinsic={k:f[k] for k in ['length','width','cornerR','knurlLength','knurlWidth','pitchU','pitchV','direction','height','tooth']}
    return contact_relief(json.dumps(intrinsic,sort_keys=True),kind)
