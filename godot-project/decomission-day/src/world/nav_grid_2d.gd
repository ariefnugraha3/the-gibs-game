class_name NavGrid2D
extends RefCounted

## Grid navigasi biner + AStarGrid2D native Godot + string-pulling LOS +
## primitif tabrakan 2D (slide_walk, resolve_blockers, resolve_cylinders).

const ROBOT_RADIUS := 3.5

var x0 := 0.0
var z0 := 0.0
var cell := 14.0
var cols := 1
var rows := 1
var walk := PackedByteArray()
var _astar := AStarGrid2D.new()


func build(origin_x: float, origin_z: float, cell_size: float, num_cols: int, num_rows: int, sample_fn: Callable) -> void:
	x0 = origin_x
	z0 = origin_z
	cell = cell_size
	cols = maxi(1, num_cols)
	rows = maxi(1, num_rows)
	walk.resize(cols * rows)

	_astar = AStarGrid2D.new()
	_astar.region = Rect2i(0, 0, cols, rows)
	_astar.cell_size = Vector2(cell, cell)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_astar.update()

	for r in rows:
		for c in cols:
			var wx := x0 + (float(c) + 0.5) * cell
			var wz := z0 + (float(r) + 0.5) * cell
			var ok: bool = bool(sample_fn.call(wx, wz))
			walk[r * cols + c] = 1 if ok else 0
			_astar.set_point_solid(Vector2i(c, r), not ok)


func cell_walk(c: int, r: int) -> bool:
	if c < 0 or r < 0 or c >= cols or r >= rows:
		return false
	return walk[r * cols + c] == 1


func circle_free(x: float, z: float, rad: float, extra_walk: Callable = Callable()) -> bool:
	var c0 := int(floorf((x - rad - x0) / cell))
	var c1 := int(floorf((x + rad - x0) / cell))
	var r0 := int(floorf((z - rad - z0) / cell))
	var r1 := int(floorf((z + rad - z0) / cell))
	for r in range(r0, r1 + 1):
		for c in range(c0, c1 + 1):
			if not cell_walk(c, r):
				return false
	if extra_walk.is_valid() and not bool(extra_walk.call(x, z, rad)):
		return false
	return true


func grid_los(x1: float, z1: float, x2: float, z2: float, rad: float = ROBOT_RADIUS, extra_walk: Callable = Callable()) -> bool:
	var dx := x2 - x1
	var dz := z2 - z1
	var dist := hypot(dx, dz)
	var steps := maxi(1, int(ceilf(dist / (cell * 0.45))))
	for i in range(1, steps + 1):
		var t := float(i) / float(steps)
		if not circle_free(x1 + dx * t, z1 + dz * t, rad, extra_walk):
			return false
	return true


func snap_cell(x: float, z: float, max_ring: int = 6, extra_walk: Callable = Callable()) -> Vector2i:
	var cc := int(floorf((x - x0) / cell))
	var cr := int(floorf((z - z0) / cell))
	if _node_walk(cc, cr, extra_walk):
		return Vector2i(cc, cr)
	for ring in range(1, max_ring + 1):
		for dr in range(-ring, ring + 1):
			for dc in range(-ring, ring + 1):
				if maxi(absi(dc), absi(dr)) != ring:
					continue
				if _node_walk(cc + dc, cr + dr, extra_walk):
					return Vector2i(cc + dc, cr + dr)
	return Vector2i(-1, -1)


func _node_walk(c: int, r: int, extra_walk: Callable) -> bool:
	if not cell_walk(c, r):
		return false
	if extra_walk.is_valid():
		var wx := x0 + (float(c) + 0.5) * cell
		var wz := z0 + (float(r) + 0.5) * cell
		return bool(extra_walk.call(wx, wz, ROBOT_RADIUS))
	return true


func find_path(sx: float, sz: float, tx: float, tz: float, extra_walk: Callable = Callable()) -> Array[Vector2]:
	var a := snap_cell(sx, sz, 6, extra_walk)
	var b := snap_cell(tx, tz, 6, extra_walk)
	if a.x < 0 or b.x < 0 or a == b:
		return []
	var id_path := _astar.get_id_path(a, b)
	if id_path.is_empty():
		return []
	var pts: Array[Vector2] = []
	for i in range(1, mini(id_path.size(), 80)):
		var pt := id_path[i]
		pts.append(Vector2(x0 + (float(pt.x) + 0.5) * cell, z0 + (float(pt.y) + 0.5) * cell))
	return _smooth(sx, sz, pts, extra_walk)


func _smooth(sx: float, sz: float, pts: Array[Vector2], extra_walk: Callable) -> Array[Vector2]:
	var out: Array[Vector2] = []
	var cx := sx
	var cz := sz
	var i := 0
	while i < pts.size():
		var best := i
		for j in range(mini(pts.size() - 1, i + 20), i, -1):
			if grid_los(cx, cz, pts[j].x, pts[j].y, ROBOT_RADIUS, extra_walk):
				best = j
				break
		out.append(pts[best])
		cx = pts[best].x
		cz = pts[best].y
		i = best + 1
	return out


static func hypot(a: float, b: float) -> float:
	return sqrt(a * a + b * b)


static func seg_point_dist_sq(px: float, pz: float, ax: float, az: float, bx: float, bz: float) -> float:
	var abx := bx - ax
	var abz := bz - az
	var len_sq := abx * abx + abz * abz
	if len_sq < 1e-8:
		var dx := px - ax
		var dz := pz - az
		return dx * dx + dz * dz
	var t := clampf(((px - ax) * abx + (pz - az) * abz) / len_sq, 0.0, 1.0)
	var cx := ax + abx * t
	var cz := az + abz * t
	var rx := px - cx
	var rz := pz - cz
	return rx * rx + rz * rz


static func slide_walk(walkable_fn: Callable, pos: Vector3, old_x: float, old_z: float, r: float) -> Vector3:
	if bool(walkable_fn.call(pos.x, pos.z, r)):
		return pos
	if bool(walkable_fn.call(pos.x, old_z, r)):
		pos.z = old_z
		return pos
	if bool(walkable_fn.call(old_x, pos.z, r)):
		pos.x = old_x
		return pos
	pos.x = old_x
	pos.z = old_z
	return pos


static func make_blocker(
	cx: float,
	cz: float,
	hx: float,
	hz: float,
	top: float = 22.0,
	standable: bool = false,
	yaw_rad: float = 0.0
) -> Dictionary:
	var c := cos(yaw_rad)
	var s := sin(yaw_rad)
	return {
		"x": cx, "z": cz, "hx": hx, "hz": hz,
		"axx": c, "axz": -s, "azx": s, "azz": c,
		"rad": sqrt(hx * hx + hz * hz),
		"top": top, "standable": standable,
	}


static func resolve_blockers(pos: Vector3, radius: float, feet_y: float, blockers: Array) -> Dictionary:
	var hit_standable := false
	for b in blockers:
		var dx := pos.x - float(b["x"])
		var dz := pos.z - float(b["z"])
		var pre := float(b["rad"]) + radius + 1.0
		if dx * dx + dz * dz > pre * pre:
			continue
		if feet_y >= float(b["top"]) - 0.4:
			continue
		var axx := float(b.get("axx", 1.0))
		var axz := float(b.get("axz", 0.0))
		var azx := float(b.get("azx", 0.0))
		var azz := float(b.get("azz", 1.0))
		var lx := dx * axx + dz * axz
		var lz := dx * azx + dz * azz
		var px := float(b["hx"]) + radius - absf(lx)
		var pz := float(b["hz"]) + radius - absf(lz)
		if px <= 0.0 or pz <= 0.0:
			continue
		if px < pz:
			var s := 1.0 if lx >= 0.0 else -1.0
			pos.x += s * px * axx
			pos.z += s * px * axz
		else:
			var s := 1.0 if lz >= 0.0 else -1.0
			pos.x += s * pz * azx
			pos.z += s * pz * azz
		if bool(b.get("standable", false)):
			hit_standable = true
	return {"pos": pos, "hit_standable": hit_standable}


static func blockers_ground_height(x: float, z: float, feet_y: float, blockers: Array) -> float:
	var h := 0.0
	for b in blockers:
		if not bool(b.get("standable", false)):
			continue
		var dx := x - float(b["x"])
		var dz := z - float(b["z"])
		var rad := float(b["rad"]) + 2.0
		if dx * dx + dz * dz > rad * rad:
			continue
		var lx := dx * float(b.get("axx", 1.0)) + dz * float(b.get("axz", 0.0))
		var lz := dx * float(b.get("azx", 0.0)) + dz * float(b.get("azz", 1.0))
		if absf(lx) <= float(b["hx"]) + 1.0 and absf(lz) <= float(b["hz"]) + 1.0 and feet_y >= float(b["top"]) - 2.0:
			h = maxf(h, float(b["top"]))
	return h


static func resolve_cylinders(pos: Vector3, radius: float, cylinders: Array) -> Vector3:
	for c in cylinders:
		var dx := pos.x - float(c["x"])
		var dz := pos.z - float(c["z"])
		var min_d := float(c["r"]) + radius
		var d2 := dx * dx + dz * dz
		if d2 < min_d * min_d and d2 > 1e-6:
			var d := sqrt(d2)
			pos.x = float(c["x"]) + dx / d * min_d
			pos.z = float(c["z"]) + dz / d * min_d
	return pos


static func turn_toward(cur_angle: float, desired: float, rate: float, dt: float) -> float:
	var diff := wrapf(desired - cur_angle, -PI, PI)
	var step := rate * dt
	if diff > step:
		diff = step
	elif diff < -step:
		diff = -step
	return wrapf(cur_angle + diff, -PI, PI)
