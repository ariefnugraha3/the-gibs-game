class_name PropFactory
extends RefCounted

## Pabrik prop 3D low-poly bergaya GIBS 2045 (perabot kantor futuristik,
## kendaraan taktis GRD LTV-45, pickup musuh, pintu geser, tangga, lift, marker).

static func build_furniture(kind: String, sx: float, sy: float, sz: float) -> Node3D:
	var root := Node3D.new()
	root.name = "Prop_%s" % kind
	var m_metal := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.72, 0.3)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.65, 0.35)
	var m_panel := Pal.mat(Pal.PANEL, Color.BLACK, 0.0, 0.85, 0.05)
	var m_wood := Pal.mat(Pal.WOOD, Color.BLACK, 0.0, 0.82, 0.05)
	var m_ink := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.85, 0.15)
	var m_leaf := Pal.mat(Pal.LEAF, Color.BLACK, 0.0, 0.88, 0.0)
	var m_tech := Pal.mat(Pal.TECH, Pal.TECH, 0.65, 0.35, 0.1)

	match kind:
		"cupboard", "rack":
			ProceduralBuilder.add_box(root, Vector3(sx, sy, sz), m_metal, Vector3(0, sy * 0.5, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.92, sy * 0.12, sz * 1.02), m_steel, Vector3(0, sy * 0.88, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.6, 0.6, sz * 1.03), m_tech, Vector3(0, sy * 0.55, 0), Vector3.ZERO, false)
		"desk", "meeting":
			var top_h := maxf(1.2, sy * 0.2)
			ProceduralBuilder.add_box(root, Vector3(sx, top_h, sz), m_panel if kind == "meeting" else m_wood, Vector3(0, sy - top_h * 0.5, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.86, sy - top_h, sz * 0.78), m_metal, Vector3(0, (sy - top_h) * 0.5, 0))
			if kind == "desk":
				ProceduralBuilder.add_box(root, Vector3(minf(6.0, sx * 0.32), 2.8, 0.7), m_ink, Vector3(0, sy + 1.6, -sz * 0.25))
				ProceduralBuilder.add_box(root, Vector3(minf(5.2, sx * 0.27), 2.0, 0.2), m_tech, Vector3(0, sy + 1.6, -sz * 0.25 + 0.4), Vector3.ZERO, false)
		"console":
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.65, sz), m_metal, Vector3(0, sy * 0.325, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.88, sy * 0.5, sz * 0.6), m_ink, Vector3(0, sy * 0.85, -sz * 0.12), Vector3(-18, 0, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.76, sy * 0.36, 0.3), m_tech, Vector3(0, sy * 0.88, -sz * 0.12 + sz * 0.31), Vector3(-18, 0, 0), false)
		"planter":
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.45, sz), m_panel, Vector3(0, sy * 0.225, 0))
			ProceduralBuilder.add_sphere(root, minf(sx, sz) * 0.45, m_leaf, Vector3(0, sy * 0.78, 0), Vector3(1, 0.85, 1))
		"sofa", "bench":
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.5, sz), m_steel, Vector3(0, sy * 0.25, 0))
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.48, sz * 0.24), m_metal, Vector3(0, sy * 0.72, -sz * 0.38))
		"chair":
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.18, sz), m_ink, Vector3(0, sy * 0.48, 0))
			ProceduralBuilder.add_cyl(root, 0.6, 0.9, sy * 0.45, m_steel, Vector3(0, sy * 0.22, 0), Vector3.ZERO, 8)
			ProceduralBuilder.add_box(root, Vector3(sx * 0.9, sy * 0.52, 0.8), m_ink, Vector3(0, sy * 0.76, -sz * 0.42))
		"sink", "stall":
			ProceduralBuilder.add_box(root, Vector3(sx, sy, sz), m_panel, Vector3(0, sy * 0.5, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.7, 0.8, sz * 0.7), m_steel, Vector3(0, sy + 0.3, 0))
		"rubble":
			ProceduralBuilder.add_box(root, Vector3(sx, sy * 0.65, sz), m_steel, Vector3(0, sy * 0.32, 0), Vector3(6, 14, -8))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.6, sy * 0.55, sz * 0.6), m_metal, Vector3(sx * 0.18, sy * 0.58, -sz * 0.12), Vector3(-12, 22, 9))
		_:
			ProceduralBuilder.add_box(root, Vector3(sx, sy, sz), m_metal, Vector3(0, sy * 0.5, 0))
			ProceduralBuilder.add_box(root, Vector3(sx * 0.96, 0.7, sz * 0.96), m_steel, Vector3(0, sy * 0.5, 0))
	return root


static func build_vehicle(kind: String, body_color: Color = Color.html("#3d4a52")) -> Node3D:
	var root := Node3D.new()
	root.name = "Vehicle_%s" % kind
	var m_body := Pal.mat(body_color, Color.BLACK, 0.0, 0.55, 0.35)
	var m_trim := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.8, 0.2)
	var m_glass := Pal.mat(Pal.SCREEN_BG, Pal.TECH_DIM, 0.2, 0.2, 0.1, true, 0.85)
	var m_tire := Pal.mat(Pal.RUBBER, Color.BLACK, 0.0, 0.92, 0.05)
	var m_head := Pal.mat(Pal.AMBER, Pal.AMBER, 0.85, 0.3, 0.0, false, 1.0, true)
	var m_tail := Pal.mat(Pal.HAZARD, Pal.HAZARD, 0.7, 0.3, 0.0, false, 1.0, true)

	var length := 28.0
	var width := 13.0
	var hull_h := 5.2
	var cab_h := 4.4
	if kind == "suv":
		length = 30.0
		width = 14.0
		hull_h = 6.2
	elif kind == "grd":
		length = 32.0
		width = 15.0
		hull_h = 6.5
		m_body = Pal.mat(Color.html("#4b4539"), Color.BLACK, 0.0, 0.62, 0.42)
	elif kind == "pickup":
		length = 31.0
		width = 14.0
		hull_h = 5.6

	# Chassis & bodi
	ProceduralBuilder.add_box(root, Vector3(length, hull_h, width), m_body, Vector3(0, 2.2 + hull_h * 0.5, 0))
	if kind == "pickup" or kind == "grd":
		# Kabin depan + bak belakang terbuka
		ProceduralBuilder.add_box(root, Vector3(length * 0.42, cab_h, width * 0.92), m_body, Vector3(length * 0.12, 2.2 + hull_h + cab_h * 0.5, 0))
		ProceduralBuilder.add_box(root, Vector3(length * 0.44, 2.0, width * 0.88), m_trim, Vector3(-length * 0.24, 2.2 + hull_h + 0.6, 0))
		if kind == "grd":
			ProceduralBuilder.add_box(root, Vector3(5.0, 0.8, 5.0), m_trim, Vector3(-length * 0.22, 2.2 + hull_h + 2.0, 0))
			ProceduralBuilder.add_box(root, Vector3(0.4, 2.2, 6.0), Pal.mat(Pal.HAZARD), Vector3(length * 0.48, 4.5, 0))
	else:
		var cab_len := length * (0.64 if kind == "suv" else 0.52)
		ProceduralBuilder.add_box(root, Vector3(cab_len, cab_h, width * 0.88), m_body, Vector3(-length * 0.05, 2.2 + hull_h + cab_h * 0.5, 0))
		ProceduralBuilder.add_box(root, Vector3(cab_len * 0.82, cab_h * 0.65, width * 0.9), m_glass, Vector3(-length * 0.05, 2.2 + hull_h + cab_h * 0.48, 0), Vector3.ZERO, false)

	# 4 Roda
	for sx in [-length * 0.31, length * 0.31]:
		for sz in [-width * 0.48, width * 0.48]:
			ProceduralBuilder.add_cyl(root, 3.0, 3.0, 2.2, m_tire, Vector3(sx, 3.0, sz), Vector3(90, 0, 0), 10)

	# Lampu depan & belakang
	for sz in [-width * 0.34, width * 0.34]:
		ProceduralBuilder.add_box(root, Vector3(0.6, 1.2, 2.2), m_head, Vector3(length * 0.5 + 0.1, 4.4, sz), Vector3.ZERO, false)
		ProceduralBuilder.add_box(root, Vector3(0.6, 1.2, 2.2), m_tail, Vector3(-length * 0.5 - 0.1, 4.4, sz), Vector3.ZERO, false)
	return root


static func build_stand_marker(color: Color, size_x: float = 12.0, size_z: float = 12.0) -> MeshInstance3D:
	var mat := Pal.unique_mat(color, color, 0.8, 0.4, 0.0, true, 0.55, true)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hx := size_x * 0.5
	var hz := size_z * 0.5
	var ring := minf(1.8, minf(hx, hz) * 0.25)
	var outer := [Vector3(-hx, 0, -hz), Vector3(hx, 0, -hz), Vector3(hx, 0, hz), Vector3(-hx, 0, hz)]
	var inner := [Vector3(-hx + ring, 0, -hz + ring), Vector3(hx - ring, 0, -hz + ring), Vector3(hx - ring, 0, hz - ring), Vector3(-hx + ring, 0, hz - ring)]
	for i in 4:
		var ni := (i + 1) % 4
		st.set_normal(Vector3.UP)
		st.add_vertex(outer[i]); st.add_vertex(outer[ni]); st.add_vertex(inner[ni])
		st.add_vertex(outer[i]); st.add_vertex(inner[ni]); st.add_vertex(inner[i])
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	mi.position.y = 0.25
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func build_split_door(width: float, height: float, thick: float, dir_axis: String, locked: bool = false, broken: bool = false) -> Dictionary:
	var root := Node3D.new()
	root.name = "SplitDoor"
	var m_frame := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.35)
	var m_leaf := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.6, 0.45)
	var lamp_col := Pal.HAZARD if (locked or broken) else Pal.EXIT_GREEN
	var m_lamp := Pal.unique_mat(lamp_col, lamp_col, 0.85, 0.3, 0.0, false, 1.0, true)

	var leaf_a := ProceduralBuilder.add_box(root, Vector3(width * 0.5, height, thick) if dir_axis == "ns" else Vector3(thick, height, width * 0.5), m_leaf, Vector3.ZERO)
	var leaf_b := ProceduralBuilder.add_box(root, Vector3(width * 0.5, height, thick) if dir_axis == "ns" else Vector3(thick, height, width * 0.5), m_leaf, Vector3.ZERO)

	if dir_axis == "ns":
		leaf_a.position = Vector3(-width * 0.25, height * 0.5, 0)
		leaf_b.position = Vector3(width * 0.25, height * 0.5, 0)
		ProceduralBuilder.add_box(root, Vector3(1.6, height + 0.5, thick + 1.4), m_frame, Vector3(-width * 0.5 - 0.8, height * 0.5, 0))
		ProceduralBuilder.add_box(root, Vector3(1.6, height + 0.5, thick + 1.4), m_frame, Vector3(width * 0.5 + 0.8, height * 0.5, 0))
		ProceduralBuilder.add_box(root, Vector3(1.2, 2.8, thick + 2.2), m_lamp, Vector3(-width * 0.5 - 0.8, height * 0.72, 0), Vector3.ZERO, false)
		ProceduralBuilder.add_box(root, Vector3(1.2, 2.8, thick + 2.2), m_lamp, Vector3(width * 0.5 + 0.8, height * 0.72, 0), Vector3.ZERO, false)
	else:
		leaf_a.position = Vector3(0, height * 0.5, -width * 0.25)
		leaf_b.position = Vector3(0, height * 0.5, width * 0.25)
		ProceduralBuilder.add_box(root, Vector3(thick + 1.4, height + 0.5, 1.6), m_frame, Vector3(0, height * 0.5, -width * 0.5 - 0.8))
		ProceduralBuilder.add_box(root, Vector3(thick + 1.4, height + 0.5, 1.6), m_frame, Vector3(0, height * 0.5, width * 0.5 + 0.8))
		ProceduralBuilder.add_box(root, Vector3(thick + 2.2, 2.8, 1.2), m_lamp, Vector3(0, height * 0.72, -width * 0.5 - 0.8), Vector3.ZERO, false)
		ProceduralBuilder.add_box(root, Vector3(thick + 2.2, 2.8, 1.2), m_lamp, Vector3(0, height * 0.72, width * 0.5 + 0.8), Vector3.ZERO, false)

	return {
		"root": root, "leaf_a": leaf_a, "leaf_b": leaf_b,
		"lamp_mat": m_lamp, "width": width, "height": height, "thick": thick,
		"dir": dir_axis, "locked": locked, "broken": broken,
		"open": 0.0, "target": 0.0, "timer": 0.0,
	}


static func update_split_door(d: Dictionary, dt: float, player_pos: Vector3, force_open: bool = false) -> void:
	var prev_target := float(d["target"])
	if bool(d["broken"]) or bool(d["locked"]):
		d["target"] = 0.0
	else:
		var root: Node3D = d["root"]
		var dist := Vector2(player_pos.x - root.global_position.x, player_pos.z - root.global_position.z).length()
		if force_open or dist < float(d["width"]) * 0.95 + 14.0:
			d["target"] = 1.0
			d["timer"] = float(Config.campaign().get("doors", {}).get("closeDelaySec", 3.0))
		elif float(d["timer"]) > 0.0:
			d["timer"] = float(d["timer"]) - dt
			if float(d["timer"]) <= 0.0:
				d["target"] = 0.0
		else:
			d["target"] = 0.0

	if absf(float(d["target"]) - prev_target) > 0.5:
		AudioManager.play_sfx("door_open" if float(d["target"]) > 0.5 else "door_close", 0.6)

	d["open"] = lerpf(float(d["open"]), float(d["target"]), clampf(dt * 8.5, 0.0, 1.0))
	var slide := float(d["open"]) * (float(d["width"]) * 0.46)
	var la: MeshInstance3D = d["leaf_a"]
	var lb: MeshInstance3D = d["leaf_b"]
	var hw := float(d["width"]) * 0.25
	if str(d["dir"]) == "ns":
		la.position.x = -hw - slide
		lb.position.x = hw + slide
	else:
		la.position.z = -hw - slide
		lb.position.z = hw + slide


static func set_door_locked(d: Dictionary, locked: bool) -> void:
	if d.is_empty():
		return
	d["locked"] = locked
	var m: StandardMaterial3D = d["lamp_mat"]
	var col := Pal.HAZARD if (locked or bool(d["broken"])) else Pal.EXIT_GREEN
	m.albedo_color = col
	m.emission = col


static func build_generator() -> Node3D:
	var root := Node3D.new()
	root.name = "Generator"
	var m_body := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.7, 0.35)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.6, 0.4)
	var m_amber := Pal.mat(Pal.AMBER, Pal.AMBER, 0.6, 0.4, 0.1)
	ProceduralBuilder.add_box(root, Vector3(22, 12, 12), m_body, Vector3(0, 6, 0))
	ProceduralBuilder.add_cyl(root, 4.2, 4.2, 14, m_steel, Vector3(-3, 7, 0), Vector3(0, 0, 90), 12)
	ProceduralBuilder.add_box(root, Vector3(4, 14, 10), m_amber, Vector3(7, 7, 0))
	return root


static func build_terminal(accent: Color = Pal.TECH) -> Dictionary:
	var root := Node3D.new()
	root.name = "Terminal"
	var m_ped := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.72, 0.35)
	var m_scr := Pal.unique_mat(accent, accent, 0.85, 0.3, 0.1, false, 1.0, true)
	ProceduralBuilder.add_box(root, Vector3(11, 10, 6.5), m_ped, Vector3(0, 5, 0))
	ProceduralBuilder.add_box(root, Vector3(9.5, 5.2, 1.0), m_scr, Vector3(0, 12.2, -1.2), Vector3(-20, 0, 0), false)
	ProceduralBuilder.add_box(root, Vector3(9.5, 1.4, 4.2), Pal.mat(Pal.INK), Vector3(0, 9.8, 1.6), Vector3(15, 0, 0))
	return {"root": root, "screen_mat": m_scr}


static func build_stairwell(destroyed: bool = false) -> Node3D:
	var root := Node3D.new()
	root.name = "Stairwell"
	var m_step := Pal.mat(Pal.CONCRETE)
	var m_rail := Pal.mat(Pal.STEEL)
	for i in 8:
		if destroyed and i >= 2 and i <= 5:
			continue
		var h := 2.4 * float(i + 1)
		ProceduralBuilder.add_box(root, Vector3(16, 2.0, 3.2), m_step, Vector3(0, h - 1.0, -10.0 + float(i) * 2.8))
	if destroyed:
		ProceduralBuilder.add_box(root, Vector3(12, 2.2, 7.0), m_step, Vector3(-1, 3.5, 2.0), Vector3(18, 12, -14))
		ProceduralBuilder.add_box(root, Vector3(1.2, 9.0, 1.2), m_rail, Vector3(-7.2, 4.5, -5.0), Vector3(22, 0, 16))
	else:
		ProceduralBuilder.add_box(root, Vector3(1.0, 14.0, 22.0), m_rail, Vector3(-8.2, 10.0, 0.0), Vector3(-34, 0, 0))
		ProceduralBuilder.add_box(root, Vector3(1.0, 14.0, 22.0), m_rail, Vector3(8.2, 10.0, 0.0), Vector3(-34, 0, 0))
	return root


static func build_lift_bank() -> Node3D:
	var root := Node3D.new()
	root.name = "LiftBank"
	ProceduralBuilder.add_box(root, Vector3(22, 22, 12), Pal.mat(Pal.INK), Vector3(0, 11, 0))
	ProceduralBuilder.add_box(root, Vector3(14, 18, 1.5), Pal.mat(Pal.STEEL), Vector3(0, 9, 6.2))
	ProceduralBuilder.add_box(root, Vector3(4, 1.6, 1.8), Pal.mat(Pal.AMBER, Pal.AMBER, 0.7), Vector3(0, 19.5, 6.3), Vector3.ZERO, false)
	return root
