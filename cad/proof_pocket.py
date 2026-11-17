import cadquery as cq, math, time

def roundwire(l,w,r,z=0):
 return cq.Workplane('XY').rect(l,w).extrude(1).edges('|Z').fillet(r).faces('<Z').wires().val().translate((0,0,z))

def pocket(L=260,W=80,d=4.5,rf=1.3,rt=.9,R=7,t=.15):
 # path is the inner floor's tangent boundary, clockwise starts at center of right edge
 a,b=L/2-rf-rt,W/2-rf-rt;r=R-rf-rt
 path=(cq.Workplane('XY').moveTo(a,0).lineTo(a,b-r).radiusArc((a-r,b),-r).lineTo(-a+r,b).radiusArc((-a,b-r),-r).lineTo(-a,-b+r).radiusArc((-a+r,-b),-r).lineTo(a-r,-b).radiusArc((a,-b+r),-r).close().wire())
 # XZ profile at x=a, y=0. Inner and outer offset arcs.
 q=math.sqrt(.5)
 prof=(cq.Workplane('XZ').moveTo(a,d)
 .threePointArc((a+rf*q,d-rf+rf*q),(a+rf,d-rf)).lineTo(a+rf,rt)
 .threePointArc((a+rf+rt-rt*q,rt-rt*q),(a+rf+rt,0))
 .lineTo(a+rf+rt,t)
 .threePointArc((a+rf+rt-(rt-t)*q,rt-(rt-t)*q),(a+rf+t,rt))
 .lineTo(a+rf+t,d-rf)
 .threePointArc((a+(rf+t)*q,d-rf+(rf+t)*q),(a,d+t)).close())
 ring=prof.sweep(path,isFrenet=True).val()
 floor=cq.Workplane('XY').add(roundwire(2*a,2*b,r,d)).toPending().extrude(t).val()
 shape=ring.fuse(floor).clean()
 return shape
if __name__=='__main__':
 s=pocket(); print('valid',s.isValid(),'solids',len(s.Solids()),'volume',s.Volume(),'bbox',s.BoundingBox().xlen,s.BoundingBox().ylen,s.BoundingBox().zlen)
 cq.exporters.export(s,'/tmp/pocket-proof.step')
 v,f=s.tessellate(.05,.2);print('vertices',len(v),'faces',len(f))
