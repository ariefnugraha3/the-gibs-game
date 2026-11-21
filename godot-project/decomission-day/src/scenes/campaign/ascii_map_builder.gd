class_name AsciiMapBuilder
extends RefCounted

## Pengurai peta ASCII & CSV untuk interior campaign (Stage 1, 2, 3, 5, 6, 9):
## membangkitkan lantai fasilitas bertekstur + garis nat TEAL menyala (interior.js),
## dinding panel bertekstur + strip puncak menyala + detail rib arsitektural (wallDetail.js),
## sistem Wall Occlusion Fade 20% saat menghalangi kamera->karakter (wallFade.js/occlusion.js),
## podium gedung + latar jalanan Kota Jakarta (cityscape.js), pintu geser, prop, dan NavGrid2D.

const CELL := 14.0
const WALL_H := 22.0


class BuiltMap:
	extends RefCounted
	var cols := 1
	var rows := 1
	var cell := 14.0
	var x0 := 0.0
	var z0 := 0.0
	var grid: Array[String] = []
	var nav: NavGrid2D = NavGrid2D.new()
	var doors: Array[Dictionary] = []
	var blockers: Array[Dictionary] = []
	var door_lookup: Dictionary = {} # "c,r" -> door dict
	var cells: Dictionary = {} # char -> Array[Vector2i]

	# Wall Occlusion Fade (porting dari wallFade.js & occlusion.js)
	var wall_meshes: Dictionary = {} # "c,r" -> Array[MeshInstance3D]
	var faded_cells: Dictionary = {} # "c,r" -> true
	var mat_wall_opaque: StandardMaterial3D
	var mat_wall_faded: StandardMaterial3D

	func cell_pos(c: float, r: float, y: float = 0.0) -> Vector3:
		return Vector3(x0 + (c + 0.5) * cell, y, z0 + (r + 0.5) * cell)

	func world_to_cell(x: float, z: float) -> Vector2i:
		return Vector2i(int(floorf((x - x0) / cell)), int(floorf((z - z0) / cell)))

	func char_at(c: int, r: int) -> String:
		if r < 0 or r >= rows or c < 0 or c >= grid[r].length():
			return "#"
		return grid[r].substr(c, 1)

	func door_at(c: int, r: int) -> Dictionary:
		return door_lookup.get("%d,%d" % [c, r], {})

	func is_walkable(x: float, z: float) -> bool:
		var cr := world_to_cell(x, z)
		if cr.x < 0 or cr.y < 0 or cr.x >= cols or cr.y >= rows:
			return false
		var ch := char_at(cr.x, cr.y)
		if ch == "#":
			return false
		var d: Dictionary = door_at(cr.x, cr.y)
		if not d.is_empty():
			if bool(d.get("broken", false)) or bool(d.get("locked", false)):
				return false
			return float(d.get("open", 0.0)) > 0.35
		return nav.cell_walk(cr.x, cr.y)

	func is_door_passable(x: float, z: float, _rad: float = 3.5) -> bool:
		var cr := world_to_cell(x, z)
		var d: Dictionary = door_at(cr.x, cr.y)
		if d.is_empty():
			return true
		if bool(d.get("broken", false)) or bool(d.get("locked", false)):
			return false
		return float(d.get("open", 0.0)) > 0.25

	func resolve(pos: Vector3, radius: float, feet_y: float = 0.0) -> Vector3:
		var min_x := x0 + radius + 1.0
		var max_x := x0 + float(cols) * cell - radius - 1.0
		var min_z := z0 + radius + 1.0
		var max_z := z0 + float(rows) * cell - radius - 1.0
		pos.x = clampf(pos.x, min_x, max_x)
		pos.z = clampf(pos.z, min_z, max_z)

		# Blok pintu terkunci/rusak
		for d in doors:
			if bool(d.get("broken", false)) or bool(d.get("locked", false)):
				var root: Node3D = d["root"]
				var w := float(d["width"]) * 0.5
				var t := float(d["thick"]) * 0.5 + 1.0
				var hx := w if str(d["dir"]) == "ns" else t
				var hz := t if str(d["dir"]) == "ns" else w
				var res := NavGrid2D.resolve_blockers(pos, radius, feet_y, [NavGrid2D.make_blocker(root.global_position.x, root.global_position.z, hx, hz, WALL_H)])
				pos = res["pos"]

		if not blockers.is_empty():
			var res2 := NavGrid2D.resolve_blockers(pos, radius, feet_y, blockers)
			pos = res2["pos"]
		return pos

	func bullet_blocked(p1: Vector3, p2: Vector3) -> bool:
		var steps := maxi(2, int(ceilf(Vector2(p2.x - p1.x, p2.z - p1.z).length() / 3.2)))
		for i in range(1, steps + 1):
			var t := float(i) / float(steps)
			var wx := lerpf(p1.x, p2.x, t)
			var wz := lerpf(p1.z, p2.z, t)
			var cr := world_to_cell(wx, wz)
			if cr.x < 0 or cr.y < 0 or cr.x >= cols or cr.y >= rows:
				return true
			if char_at(cr.x, cr.y) == "#":
				return true
			var d: Dictionary = door_at(cr.x, cr.y)
			if not d.is_empty() and float(d.get("open", 0.0)) < 0.45:
				return true
		return false

	func step_doors(dt: float, player_pos: Vector3, robots: Array = []) -> void:
		for d in doors:
			var force_open := false
			if not bool(d["locked"]) and not bool(d["broken"]):
				var root: Node3D = d["root"]
				for r in robots:
					if is_instance_valid(r) and r.state != "dead":
						if Vector2(r.global_position.x - root.global_position.x, r.global_position.z - root.global_position.z).length() < cell * 1.4:
							force_open = true
							break
			PropFactory.update_split_door(d, dt, player_pos, force_open)
		_step_wall_occlusion(player_pos, robots)

	## Memudarkan sel dinding yang menutupi garis pandang kamera (Barat Daya: -X, +Z)
	## ke player atau robot aktif menjadi opasitas 20% (porting dari wallFade.js/occlusion.js).
	func _step_wall_occlusion(player_pos: Vector3, robots: Array) -> void:
		if wall_meshes.is_empty() or not mat_wall_faded or not mat_wall_opaque:
			return
		var next_faded: Dictionary = {}
		var targets: Array[Vector3] = [player_pos]
		for r in robots:
			if is_instance_valid(r) and r.state == "chasing":
				if Vector2(r.global_position.x - player_pos.x, r.global_position.z - player_pos.z).length() < 180.0:
					targets.append(r.global_position)

		for tpos in targets:
			var tc := world_to_cell(tpos.x, tpos.z)
			# Kamera berada di arah (-X, +Z) dari entitas; periksa koridor 1..2 sel ke arah kamera
			for dr in range(0, 3):
				for dc in range(-2, 1):
					if dc == 0 and dr == 0:
						continue
					var wc := tc.x + dc
					var wr := tc.y + dr
					var key := "%d,%d" % [wc, wr]
					if wall_meshes.has(key):
						next_faded[key] = true

		# Pulihkan dinding yang tidak lagi menutupi
		for old_key in faded_cells.keys():
			if not next_faded.has(old_key) and wall_meshes.has(old_key):
				var arr: Array = wall_meshes[old_key]
				if not arr.is_empty() and is_instance_valid(arr[0]):
					(arr[0] as MeshInstance3D).material_override = mat_wall_opaque
				for k in range(1, arr.size()):
					if is_instance_valid(arr[k]):
						(arr[k] as Node3D).visible = true

		# Pudarkan dinding yang baru menutupi
		for new_key in next_faded.keys():
			if not faded_cells.has(new_key) and wall_meshes.has(new_key):
				var arr: Array = wall_meshes[new_key]
				if not arr.is_empty() and is_instance_valid(arr[0]):
					(arr[0] as MeshInstance3D).material_override = mat_wall_faded
				for k in range(1, arr.size()):
					if is_instance_valid(arr[k]):
						(arr[k] as Node3D).visible = false

		faded_cells = next_faded


static func build(parent: Node3D, raw_rows: Array, opts: Dictionary = {}) -> BuiltMap:
	var bm := BuiltMap.new()
	var cell := float(opts.get("cell", CELL))
	var wall_h := float(opts.get("wall_h", WALL_H))
	bm.cell = cell
	bm.rows = raw_rows.size()
	bm.cols = raw_rows[0].length() if bm.rows > 0 else 1
	for s in raw_rows:
		bm.cols = maxi(bm.cols, str(s).length())
		bm.grid.append(str(s))

	bm.x0 = float(opts.get("x0", -float(bm.cols) * cell * 0.5))
	bm.z0 = float(opts.get("z0", -float(bm.rows) * cell * 0.5))

	var accent_raw: Variant = opts.get("wall_accent", Pal.TECH)
	var accent_col: Color = accent_raw if accent_raw is Color else Pal.TECH

	# Material lantai & dinding bertekstur prosedural + strip/nat TEAL menyala (interior.js)
	var m_floor := Pal.interior_floor_mat(cell)
	var m_wall := Pal.interior_wall_mat(accent_col)
	var m_wall_fade := Pal.build_interior_wall_instance(accent_col)
	m_wall_fade.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m_wall_fade.albedo_color = Color(1.0, 1.0, 1.0, 0.22)
	bm.mat_wall_opaque = m_wall
	bm.mat_wall_faded = m_wall_fade

	var m_cap := Pal.mat(Pal.PANEL, Color.BLACK, 0.0, 0.65, 0.15)
	var m_baseboard := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.82, 0.2)
	var m_rib := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.55, 0.45)
	var m_accent := Pal.mat(accent_col, accent_col, 0.75, 0.3, 0.1)

	var total_w := float(bm.cols) * cell
	var total_d := float(bm.rows) * cell
	ProceduralBuilder.add_box(
		parent, Vector3(total_w, 2.0, total_d), m_floor,
		Vector3(bm.x0 + total_w * 0.5, -1.0, bm.z0 + total_d * 0.5), Vector3.ZERO, false
	)

	# Latar jalanan & gedung Kota Jakarta di sekeliling podium gedung lantai 2 (cityscape.js)
	if not bool(opts.get("no_city_backdrop", false)) and parent.get_parent() and not parent.get_parent().has_node("CitySkyline"):
		CityscapeBuilder.build_indoor_city_backdrop(parent, total_w * 0.5, total_d * 0.5, -70.0)

	var door_defs: Dictionary = {}
	for dd in opts.get("door_defs", []):
		if dd.has("cells"):
			for pair in dd["cells"]:
				door_defs["%d,%d" % [int(pair[0]), int(pair[1])]] = dd
		elif dd.has("c") and dd.has("r"):
			door_defs["%d,%d" % [int(dd["c"]), int(dd["r"])]] = dd

	var walls_root := Node3D.new(); walls_root.name = "Walls"; parent.add_child(walls_root)
	var props_root := Node3D.new(); props_root.name = "Props"; parent.add_child(props_root)

	# Lampu plafon hangat tersebar merata agar tekstur lantai & dinding terang jelas
	var lights_root := Node3D.new(); lights_root.name = "CeilingLights"; parent.add_child(lights_root)
	var step_c := maxi(10, bm.cols / 3)
	var step_r := maxi(10, bm.rows / 3)
	var lc := step_c / 2
	while lc < bm.cols:
		var lr := step_r / 2
		while lr < bm.rows:
			if bm.char_at(lc, lr) != "#":
				var lp := bm.cell_pos(lc, lr, wall_h + 10.0)
				var omni := OmniLight3D.new()
				omni.light_color = Color("#ffe6c8")
				omni.light_energy = 0.72
				omni.omni_range = cell * float(maxi(step_c, step_r)) * 0.85
				omni.shadow_enabled = false
				omni.position = lp
				lights_root.add_child(omni)
			lr += step_r
		lc += step_c

	for r in bm.rows:
		for c in bm.cols:
			var ch := bm.char_at(c, r)
			if not bm.cells.has(ch):
				bm.cells[ch] = []
			(bm.cells[ch] as Array).append(Vector2i(c, r))
			var wp := bm.cell_pos(c, r, 0.0)

			if ch == "#":
				var cell_key := "%d,%d" % [c, r]
				var w_box := ProceduralBuilder.add_box(walls_root, Vector3(cell, wall_h, cell), m_wall, Vector3(wp.x, wall_h * 0.5, wp.z))
				var cell_parts: Array = [w_box]
				# Bibir coping atas terang (mempertegas denah dari atas)
				var cap := ProceduralBuilder.add_box(walls_root, Vector3(cell * 0.96, 0.45, cell * 0.96), m_cap, Vector3(wp.x, wall_h + 0.2, wp.z), Vector3.ZERO, false)
				cell_parts.append(cap)

				# Detail kulit muka dinding pada sisi terbuka (porting dari wallDetail.js)
				var h_val := absi(c * 37 + r * 61)
				if bm.char_at(c, r + 1) != "#": # muka selatan (+Z, menghadap kamera)
					var bb := ProceduralBuilder.add_box(walls_root, Vector3(cell - 0.6, 2.4, 0.55), m_baseboard, Vector3(wp.x, 1.2, wp.z + cell * 0.5 + 0.15), Vector3.ZERO, false)
					cell_parts.append(bb)
					if h_val % 4 == 0:
						var ac := ProceduralBuilder.add_box(walls_root, Vector3(cell * 0.36, 2.2, 0.65), m_accent, Vector3(wp.x, wall_h - 4.2, wp.z + cell * 0.5 + 0.2), Vector3.ZERO, false)
						cell_parts.append(ac)
				if bm.char_at(c - 1, r) != "#": # muka barat (-X, menghadap kamera)
					var bb2 := ProceduralBuilder.add_box(walls_root, Vector3(0.55, 2.4, cell - 0.6), m_baseboard, Vector3(wp.x - cell * 0.5 - 0.15, 1.2, wp.z), Vector3.ZERO, false)
					cell_parts.append(bb2)
					if h_val % 5 == 0:
						var rb := ProceduralBuilder.add_box(walls_root, Vector3(0.6, wall_h - 4.0, 0.8), m_rib, Vector3(wp.x - cell * 0.5 - 0.18, wall_h * 0.5, wp.z), Vector3.ZERO, false)
						cell_parts.append(rb)
				bm.wall_meshes[cell_key] = cell_parts
			elif ch == "=" or ch == "D":
				var key := "%d,%d" % [c, r]
				var ddef: Dictionary = door_defs.get(key, {})
				var locked := bool(ddef.get("locked", false))
				var broken := bool(ddef.get("broken", false))
				var left_w := bm.char_at(c - 1, r) == "#"
				var right_w := bm.char_at(c + 1, r) == "#"
				var axis := "ns" if (left_w or right_w) else "ew"
				var d := PropFactory.build_split_door(cell * 0.96, wall_h * 0.82, 2.4, axis, locked, broken)
				var droot: Node3D = d["root"]
				droot.position = wp
				props_root.add_child(droot)
				bm.doors.append(d)
				bm.door_lookup[key] = d
			elif ch == "~":
				var rub := PropFactory.build_furniture("rubble", cell * 0.72, 4.2, cell * 0.72)
				rub.position = wp
				props_root.add_child(rub)
			elif ch in ["d", "m", "k", "r", "s", "p", "c", "K"]:
				var kind := "desk"
				if ch == "m": kind = "meeting"
				elif ch == "k" or ch == "r" or ch == "K": kind = "rack"
				elif ch == "s": kind = "sofa"
				elif ch == "p": kind = "planter"
				elif ch == "c": kind = "chair"
				var f := PropFactory.build_furniture(kind, cell * 0.62, 5.2, cell * 0.56)
				f.position = wp
				props_root.add_child(f)
				bm.blockers.append(NavGrid2D.make_blocker(wp.x, wp.z, cell * 0.34, cell * 0.32, 8.0))

	for dd in opts.get("door_spans", []):
		var c0 := int(dd["c0"])
		var r0 := int(dd["r0"])
		var c1 := int(dd["c1"])
		var r1 := int(dd["r1"])
		var dir := str(dd.get("dir", "ns"))
		var span_cells := (c1 - c0 + 1) if dir == "ns" else (r1 - r0 + 1)
		var locked := bool(dd.get("locked", false))
		var broken := bool(dd.get("broken", false))
		var d := PropFactory.build_split_door(cell * float(span_cells), wall_h * 0.84, 2.4, dir, locked, broken)
		var droot: Node3D = d["root"]
		droot.position = bm.cell_pos(float(c0 + c1) * 0.5, float(r0 + r1) * 0.5, 0.0)
		props_root.add_child(droot)
		bm.doors.append(d)
		for rr in range(r0, r1 + 1):
			for cc in range(c0, c1 + 1):
				bm.door_lookup["%d,%d" % [cc, rr]] = d

	bm.nav.build(bm.x0, bm.z0, cell, bm.cols, bm.rows, func(wx: float, wz: float) -> bool:
		var cr := bm.world_to_cell(wx, wz)
		var ch := bm.char_at(cr.x, cr.y)
		return ch != "#"
	)
	return bm
