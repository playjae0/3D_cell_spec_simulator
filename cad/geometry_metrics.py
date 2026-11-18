"""Engineering extents from analytic BRep geometry, never cached display mesh."""

import cadquery as cq
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib


def exact_bounds(shape):
    bounds = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape.wrapped, bounds, False, False)
    return cq.BoundBox(bounds)
