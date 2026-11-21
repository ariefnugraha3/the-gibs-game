class_name MonasWorld
extends Node3D

## Dunia Taman Monas yang digunakan bersama oleh Survival Mode dan Stage 12 (Final).
## Porting visual autentik dari src/scenes/survival/world.js:
## - Pelataran bundar radial batu-emas (radius 95, cincin konsentris & 36 jari-jari)
## - Jalan Silang Monas (2 jalan diagonal menyilang X + marka putus-putus)
## - Jalan Medan Merdeka (4 ruas ring road aspal retak di luar pagar beton)
## - Monumen Nasional marmer berurat + engsel obelisk + lidah api emas + halo pijar
## - Air Mancur Menari (barat) dengan 3 semburan air berdenyut + Kolam Pantul (utara)
## - Pagar panel beton + coping + pilar tiap 38 unit + 40 pohon bertajuk 3-gumpal faceted.

const PARK_HX := 620.0
const PARK_HZ := 340.0
const ROAD_W := 68.0
const FOUNTAIN := Vector3(-341.0, 0.0, 0.0)
const FOUNTAIN_R := 47.0
const FOUNTAIN_TOP_Y := 3.2
const PARK_GATE := Vector3(-620.0, 0.0, 0.0)
const GATE_HALF_SPAN := 42.0
const MONAS_HINGE := Vector2(-7.5, 8.0)
const MONAS_TOP := 64.0
const FENCE_H := 16.0
const FOG_H := 32.0

var monas_top: Node3D
var monas_flame_light: OmniLight3D
var monas_flame_glow: MeshInstance3D
var gate_doors: Node3D
var fog_canopy: MeshInstance3D
var fog_canopy_mat: StandardMaterial3D
var _flame_mesh: MeshInstance3D
var _stage12_mode := false
var _water_jets: Array[Node3D] = []
var _decor_t := 0.0

var _tree_colliders: Array[Dictionary] = [] # {"x": float, "z": float, "r": float}
var _pillar_colliders: Array[Dictionary] = []
var _collapse_debris: Array[Dictionary] = []

# State animasi tumbangnya Monas
var collapse_active := false
var _collapse_phase := "" # "tremble" | "topple" | "settle"
var _collapse_t := 0.0
var _collapse_ang := 0.0
var _collapse_vel := 0.0
var _collapse_bounced := false


func build(is_stage12: bool = false) -> void:
	_stage12_mode = is_stage12
	_tree_colliders.clear()
	_pillar_colliders.clear()
	_water_jets.clear()

	_build_ground()
	_build_park_roads()
	_build_monas()
	_build_fountain_and_pool()
	_build_fence_and_gate()
	_build_trees_and_lamps()
	_build_fog_canopy()

	var sky_r := 760.0
	CityscapeBuilder.build_skyline_ring(self, Vector3.ZERO, sky_r, sky_r + 750.0, 88)


func _process(dt: float) -> void:
	_decor_t += dt
	# Denyut api Monas & semburan air mancur (porting dari src/world/decor.js)
	if not collapse_active:
		if monas_flame_light:
			monas_flame_light.light_energy = 2.2 + sin(_decor_t * 6.1) * 0.25 + sin(_decor_t * 17.0) * 0.12
		if monas_flame_glow:
			var s := 15.0 + sin(_decor_t * 5.2) * 1.4
			monas_flame_glow.scale = Vector3(s, s, s)
	for i in _water_jets.size():
		var jet: Node3D = _water_jets[i]
		if is_instance_valid(jet):
			var sy := 1.0 + sin(_decor_t * 2.2 + float(i) * 2.1) * 0.14
			var sxz := 1.0 + sin(_decor_t * 3.1 + float(i)) * 0.06
			jet.scale = Vector3(sxz, sy, sxz)


func _build_ground() -> void:
	var m_grass := Pal.park_grass_mat()
	var m_asphalt := Pal.asphalt_mat()
	var m_curb := Pal.mat(Color("#55534e"), Color.BLACK, 0.0, 0.82, 0.1)

	# Tanah dasar kota di luar ring road
	ProceduralBuilder.add_box(self, Vector3(3600.0, 2.0, 2600.0), Pal.mat(Color("#17150f"), Color.BLACK, 0.0, 0.92, 0.0), Vector3(-120.0, -1.6, 0), Vector3.ZERO, false)
	# Rumput Taman Monas bertekstur helai & normal map
	ProceduralBuilder.add_box(self, Vector3(PARK_HX * 2.0, 2.0, PARK_HZ * 2.0), m_grass, Vector3(0, -1.0, 0), Vector3.ZERO, false)

	# Jalan Medan Merdeka: 4 ruas ring road mengelilingi luar pagar taman
	var ox := PARK_HX + ROAD_W * 0.5
	var oz := PARK_HZ + ROAD_W * 0.5
	var len_x := PARK_HX * 2.0 + ROAD_W * 2.0
	var len_z := PARK_HZ * 2.0 + ROAD_W * 2.0
	ProceduralBuilder.add_box(self, Vector3(len_x, 0.4, ROAD_W), m_asphalt, Vector3(0, -0.18, -oz), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(len_x, 0.4, ROAD_W), m_asphalt, Vector3(0, -0.18, oz), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(ROAD_W, 0.4, len_z), m_asphalt, Vector3(-ox, -0.18, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(ROAD_W, 0.4, len_z), m_asphalt, Vector3(ox, -0.18, 0), Vector3.ZERO, false)

	# Trotoar/curb tepi luar ring road
	var co := ROAD_W + 1.5
	ProceduralBuilder.add_box(self, Vector3(len_x + 6.0, 1.4, 3.0), m_curb, Vector3(0, 0.7, -(PARK_HZ + co)), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(len_x + 6.0, 1.4, 3.0), m_curb, Vector3(0, 0.7, PARK_HZ + co), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(3.0, 1.4, len_z + 6.0), m_curb, Vector3(-(PARK_HX + co), 0.7, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(self, Vector3(3.0, 1.4, len_z + 6.0), m_curb, Vector3(PARK_HX + co, 0.7, 0), Vector3.ZERO, false)

	if _stage12_mode:
		# Boulevard barat panjang menuju gerbang barat Monas
		ProceduralBuilder.add_box(self, Vector3(540.0, 0.45, 108.0), m_asphalt, Vector3(-PARK_HX - 250.0, 0.05, 0), Vector3.ZERO, false)
		ProceduralBuilder.add_box(self, Vector3(540.0, 1.2, 4.0), m_curb, Vector3(-PARK_HX - 250.0, 0.6, -56.0), Vector3.ZERO, false)
		ProceduralBuilder.add_box(self, Vector3(540.0, 1.2, 4.0), m_curb, Vector3(-PARK_HX - 250.0, 0.6, 56.0), Vector3.ZERO, false)


func _build_park_roads() -> void:
	# 1. Pelataran tengah bundar berpola radial batu-emas (radius 95)
	ProceduralBuilder.add_cyl(self, 95.0, 95.0, 0.36, Pal.monas_plaza_mat(), Vector3(0, 0.18, 0), Vector3.ZERO, 48, false)

	# 2. Jalan Silang Monas: dua pita jalan diagonal menyilang X + marka putus-putus
	var diag_len: float = 2.0 * Vector2(PARK_HX, PARK_HZ).length() - 16.0
	var ang_deg := rad_to_deg(atan2(PARK_HZ, PARK_HX))
	var m_diag := Pal.asphalt_mat()
	var m_dash := Pal.mat(Color("#cec8b4"), Color.BLACK, 0.0, 0.85, 0.0)
	for a in [ang_deg, -ang_deg]:
		var d_grp := Node3D.new()
		d_grp.rotation_degrees = Vector3(0.0, float(a), 0.0)
		add_child(d_grp)
		ProceduralBuilder.add_box(d_grp, Vector3(diag_len, 0.24, 40.0), m_diag, Vector3(0, 0.06, 0), Vector3.ZERO, false)
		var x: float = -diag_len * 0.48
		while x < diag_len * 0.48:
			if absf(x) > 96.0:
				ProceduralBuilder.add_box(d_grp, Vector3(24.0, 0.28, 2.2), m_dash, Vector3(x, 0.08, 0), Vector3.ZERO, false)
			x += 52.0


func _build_monas() -> void:
	var m_stone := Pal.mat(Color("#8f8a80"), Color.BLACK, 0.0, 0.82, 0.08)
	var m_marble := Pal.monas_marble_mat()
	var m_flame := Pal.unique_mat(Color("#ffd700"), Color("#ffa028"), 1.85, 0.18, 0.85, false, 1.0, false)
	var m_glow := Pal.unique_mat(Color("#ffbe5a"), Color("#ff8c28"), 1.6, 0.2, 0.0, true, 0.32, true)

	var monas := Node3D.new()
	monas.name = "MonasMonument"
	add_child(monas)

	# Undakan dasar permanen
	ProceduralBuilder.add_box(monas, Vector3(44.0, 2.0, 44.0), m_stone, Vector3(0, 1.0, 0))
	ProceduralBuilder.add_box(monas, Vector3(40.0, 3.0, 40.0), m_stone, Vector3(0, 3.5, 0))
	ProceduralBuilder.add_box(monas, Vector3(30.0, 3.0, 30.0), m_marble, Vector3(0, 6.5, 0))

	# Grup engsel untuk menara yang bisa patah & tumbang ke timur
	monas_top = Node3D.new()
	monas_top.position = Vector3(MONAS_HINGE.x, MONAS_HINGE.y, 0.0)
	monas.add_child(monas_top)

	var ox := -MONAS_HINGE.x
	var oy := -MONAS_HINGE.y
	# Kaki obelisk -> obelisk meruncing -> cawan -> lidah api emas + halo
	ProceduralBuilder.add_cyl(monas_top, 5.6, 7.4, 6.0, m_marble, Vector3(ox, 11.0 + oy, 0.0), Vector3(0, 45, 0), 4)
	ProceduralBuilder.add_cyl(monas_top, 3.4, 5.6, 50.0, m_marble, Vector3(ox, 39.0 + oy, 0.0), Vector3(0, 45, 0), 4)
	ProceduralBuilder.add_cyl(monas_top, 10.0, 4.0, 6.0, m_marble, Vector3(ox, 66.0 + oy, 0.0), Vector3(0, 22.5, 0), 8)

	_flame_mesh = ProceduralBuilder.add_cyl(monas_top, 0.3, 4.0, 15.0, m_flame, Vector3(ox, 76.5 + oy, 0.0), Vector3.ZERO, 10, false)
	monas_flame_glow = ProceduralBuilder.add_sphere(monas_top, 1.0, m_glow, Vector3(ox, 78.0 + oy, 0.0), Vector3(15, 15, 15), 10, 6, false)
	monas_flame_light = OmniLight3D.new()
	monas_flame_light.light_color = Color("#ffc36b")
	monas_flame_light.light_energy = 2.4
	monas_flame_light.omni_range = 280.0
	monas_flame_light.position = Vector3(ox, 80.0 + oy, 0.0)
	monas_top.add_child(monas_flame_light)


func _build_fountain_and_pool() -> void:
	var m_stone := Pal.mat(Color("#6f6a5e"), Color.BLACK, 0.0, 0.82, 0.1)
	var m_water := Pal.water_ripple_mat()
	var m_jet := Pal.unique_mat(Color("#9fd2ee"), Color("#68b5e8"), 0.55, 0.15, 0.1, true, 0.46, false)

	# 1. Air Mancur Menari (Barat)
	var f_root := Node3D.new()
	f_root.position = FOUNTAIN
	add_child(f_root)
	ProceduralBuilder.add_cyl(f_root, 46.0, 48.0, FOUNTAIN_TOP_Y, m_stone, Vector3(0, FOUNTAIN_TOP_Y * 0.5, 0), Vector3.ZERO, 28)
	ProceduralBuilder.add_cyl(f_root, 42.0, 44.0, 0.8, m_water, Vector3(0, FOUNTAIN_TOP_Y - 0.1, 0), Vector3.ZERO, 28, false)
	ProceduralBuilder.add_cyl(f_root, 6.0, 8.5, 11.0, m_stone, Vector3(0, FOUNTAIN_TOP_Y + 5.5, 0), Vector3.ZERO, 12)
	ProceduralBuilder.add_cyl(f_root, 12.0, 4.0, 3.0, m_stone, Vector3(0, FOUNTAIN_TOP_Y + 11.5, 0), Vector3.ZERO, 12)
	_pillar_colliders.append({"x": FOUNTAIN.x, "z": FOUNTAIN.z, "r": 9.5})

	# 3 Kerucut semburan air mancur berdenyut (survival/world.js lines 691-702)
	for i in 3:
		var jh := 20.0 - float(i) * 4.0
		var jr := 3.0 - float(i) * 0.7
		var jet := ProceduralBuilder.add_cyl(f_root, 0.2, jr, jh, m_jet, Vector3(float(i - 1) * 14.0, FOUNTAIN_TOP_Y + jh * 0.5, float(i - 1) * 8.0), Vector3.ZERO, 10, false)
		_water_jets.append(jet)

	# 2. Kolam Pantul Utara (survival/world.js lines 704-712)
	var pool_z := -PARK_HZ * 0.55
	ProceduralBuilder.add_box(self, Vector3(156.0, 2.4, 66.0), m_stone, Vector3(0, 1.2, pool_z))
	ProceduralBuilder.add_box(self, Vector3(150.0, 0.8, 60.0), m_water, Vector3(0, 2.1, pool_z), Vector3.ZERO, false)


func _build_fence_and_gate() -> void:
	var m_wall := Pal.concrete_fence_mat()
	var m_cap := Pal.mat(Color("#96938b"), Color.BLACK, 0.0, 0.76, 0.1)
	var wh := FENCE_H * 0.78

	# Utara & Selatan (dinding panel beton + coping + pilar tiap 38 unit)
	for side_z in [-PARK_HZ, PARK_HZ]:
		ProceduralBuilder.add_box(self, Vector3(PARK_HX * 2.0, wh, 2.4), m_wall, Vector3(0, wh * 0.5, side_z))
		ProceduralBuilder.add_box(self, Vector3(PARK_HX * 2.0 + 1.2, 0.9, 3.6), m_cap, Vector3(0, wh + 0.45, side_z))
		var x := -PARK_HX
		while x <= PARK_HX:
			ProceduralBuilder.add_box(self, Vector3(4.0, FENCE_H, 4.0), m_wall, Vector3(x, FENCE_H * 0.5, side_z))
			ProceduralBuilder.add_box(self, Vector3(5.2, 1.1, 5.2), m_cap, Vector3(x, FENCE_H + 0.55, side_z))
			x += 38.0

	# Timur (full span)
	ProceduralBuilder.add_box(self, Vector3(2.4, wh, PARK_HZ * 2.0), m_wall, Vector3(PARK_HX, wh * 0.5, 0))
	ProceduralBuilder.add_box(self, Vector3(3.6, 0.9, PARK_HZ * 2.0 + 1.2), m_cap, Vector3(PARK_HX, wh + 0.45, 0))
	var ez := -PARK_HZ
	while ez <= PARK_HZ:
		ProceduralBuilder.add_box(self, Vector3(4.0, FENCE_H, 4.0), m_wall, Vector3(PARK_HX, FENCE_H * 0.5, ez))
		ProceduralBuilder.add_box(self, Vector3(5.2, 1.1, 5.2), m_cap, Vector3(PARK_HX, FENCE_H + 0.55, ez))
		ez += 38.0

	# Barat (celah gerbang di z in [-GATE_HALF_SPAN, +GATE_HALF_SPAN])
	var side_len := PARK_HZ - GATE_HALF_SPAN
	for s in [-1.0, 1.0]:
		var cz: float = float(s) * (GATE_HALF_SPAN + side_len * 0.5)
		ProceduralBuilder.add_box(self, Vector3(2.4, wh, side_len), m_wall, Vector3(-PARK_HX, wh * 0.5, cz))
		ProceduralBuilder.add_box(self, Vector3(3.6, 0.9, side_len + 1.2), m_cap, Vector3(-PARK_HX, wh + 0.45, cz))

	# Pilar gerbang barat
	for s in [-1.0, 1.0]:
		ProceduralBuilder.add_box(self, Vector3(7.0, FENCE_H + 7.0, 7.0), m_cap, Vector3(-PARK_HX, (FENCE_H + 7.0) * 0.5, float(s) * (GATE_HALF_SPAN + 4.0)))

	gate_doors = Node3D.new()
	gate_doors.position = PARK_GATE
	add_child(gate_doors)
	if not _stage12_mode:
		ProceduralBuilder.add_box(gate_doors, Vector3(2.2, wh, GATE_HALF_SPAN * 2.0), Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.5, 0.6), Vector3(0, wh * 0.5, 0))


func _build_trees_and_lamps() -> void:
	var m_trunk := Pal.mat(Color("#4a3322"), Color.BLACK, 0.0, 0.9, 0.0)
	var m_leaves := [
		Pal.mat(Color("#2e5c22"), Color.BLACK, 0.0, 0.86, 0.0),
		Pal.mat(Color("#396b2a"), Color.BLACK, 0.0, 0.86, 0.0),
		Pal.mat(Color("#254d1b"), Color.BLACK, 0.0, 0.86, 0.0),
	]
	var m_lamp := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.5, 0.6)
	var m_bulb := Pal.mat(Pal.AMBER, Pal.AMBER, 1.3, 0.2, 0.0, false, 1.0, true)

	# Pohon-pohon 3-gumpal tajuk faceted di area rumput (menjauhi pelataran, jalan diagonal, air mancur & kolam pantul)
	var positions := [
		Vector2(-480, -230), Vector2(-340, -250), Vector2(-190, -230), Vector2(190, -240), Vector2(350, -235), Vector2(490, -240),
		Vector2(-480, 230), Vector2(-340, 250), Vector2(-190, 230), Vector2(190, 240), Vector2(350, 235), Vector2(490, 240),
		Vector2(-520, -110), Vector2(-210, -70), Vector2(220, -75), Vector2(460, -115),
		Vector2(-520, 110), Vector2(-210, 70), Vector2(220, 75), Vector2(460, 115),
		Vector2(-150, 270), Vector2(150, 270), Vector2(310, -15), Vector2(450, 15),
	]
	var rng := RandomNumberGenerator.new(); rng.seed = 2045
	for i in positions.size():
		var p: Vector2 = positions[i]
		var sc := rng.randf_range(0.88, 1.24)
		var t := Node3D.new()
		t.position = Vector3(p.x, 0.0, p.y)
		t.rotation_degrees = Vector3(rng.randf_range(-3.5, 3.5), rng.randf_range(0.0, 360.0), rng.randf_range(-3.5, 3.5))
		add_child(t)
		ProceduralBuilder.add_cyl(t, 1.6 * sc, 2.6 * sc, 16.0 * sc, m_trunk, Vector3(0, 8.0 * sc, 0), Vector3.ZERO, 7)
		# 3 gerombol tajuk faceted (besar utama, samping sedang, pucuk atas)
		ProceduralBuilder.add_sphere(t, 11.5 * sc, m_leaves[i % 3], Vector3(0, 20.5 * sc, 0), Vector3(1.0, 0.86, 1.0), 7, 5)
		ProceduralBuilder.add_sphere(t, 8.2 * sc, m_leaves[(i + 1) % 3], Vector3(4.5 * sc, 18.5 * sc, 3.2 * sc), Vector3(1.0, 0.88, 1.0), 7, 5)
		ProceduralBuilder.add_sphere(t, 7.0 * sc, m_leaves[(i + 2) % 3], Vector3(-3.2 * sc, 25.5 * sc, -2.2 * sc), Vector3(1.0, 0.9, 1.0), 6, 5)
		_tree_colliders.append({"x": p.x, "z": p.y, "r": 3.4 * sc})

	# Tiang lampu taman di sekeliling pelataran & Jalan Silang
	var diag_a := atan2(PARK_HZ, PARK_HX)
	for r_dist in [125.0, 260.0, 410.0, 540.0]:
		for s1 in [-1.0, 1.0]:
			for s2 in [-1.0, 1.0]:
				var rd := float(r_dist)
				var f1 := float(s1)
				var f2 := float(s2)
				var ang: float = f1 * diag_a
				var lx: float = f2 * cos(ang) * rd - sin(ang) * 24.0 * f1
				var lz: float = f2 * sin(ang) * rd + cos(ang) * 24.0 * f1
				var l := Node3D.new()
				l.position = Vector3(lx, 0.0, lz)
				add_child(l)
				ProceduralBuilder.add_cyl(l, 0.65, 1.0, 22.0, m_lamp, Vector3(0, 11.0, 0), Vector3.ZERO, 8)
				ProceduralBuilder.add_sphere(l, 1.6, m_bulb, Vector3(0, 22.4, 0), Vector3.ONE, 8, 5, false)


func _build_fog_canopy() -> void:
	var sz := 256
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	var center := Vector2(sz * 0.5, sz * 0.5)
	for y in sz:
		for x in sz:
			var d := Vector2(x, y).distance_to(center) / (sz * 0.5)
			var hole := clampf((d - 0.14) / 0.14, 0.0, 1.0)
			var outer := clampf((1.0 - d) / 0.15, 0.0, 1.0)
			var n := 0.75 + 0.25 * sin(float(x) * 0.17 + cos(float(y) * 0.13) * 3.0)
			var alpha := hole * outer * n
			img.set_pixel(x, y, Color(0.55, 0.62, 0.68, alpha))
	var tex := ImageTexture.create_from_image(img)

	fog_canopy_mat = StandardMaterial3D.new()
	fog_canopy_mat.albedo_texture = tex
	fog_canopy_mat.albedo_color = Color(1, 1, 1, 0.0)
	fog_canopy_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fog_canopy_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fog_canopy_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	fog_canopy_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	fog_canopy_mat.disable_fog = true

	var mesh := PlaneMesh.new()
	mesh.size = Vector2(2200.0, 2200.0)
	fog_canopy = MeshInstance3D.new()
	fog_canopy.mesh = mesh
	fog_canopy.material_override = fog_canopy_mat
	fog_canopy.position = Vector3(0, FOG_H, 0)
	fog_canopy.visible = false
	add_child(fog_canopy)


func set_fog_canopy(k: float) -> void:
	if not fog_canopy or not fog_canopy_mat:
		return
	var a := clampf(k, 0.0, 1.0) * 0.88
	fog_canopy_mat.albedo_color.a = a
	fog_canopy.visible = a > 0.004


func drift_fog_canopy(dt: float) -> void:
	if fog_canopy and fog_canopy.visible:
		fog_canopy.rotation.y += dt * 0.06


static func monas_half_at(y: float) -> float:
	if y < 2.0:
		return 22.0
	if y < 5.0:
		return 20.0
	if y < 8.0:
		return 15.0
	return 8.0


static func monas_shot_blocked(p1: Vector3, p2: Vector3) -> bool:
	var y := p1.y
	if y < 0.0 or y > MONAS_TOP:
		return false
	var h := monas_half_at(y)
	var t0 := 0.0
	var t1 := 1.0
	var dx := p2.x - p1.x
	var dz := p2.z - p1.z
	if absf(dx) < 1e-6:
		if p1.x <= -h or p1.x >= h:
			return false
	else:
		var a := (-h - p1.x) / dx
		var b := (h - p1.x) / dx
		if a > b:
			var t := a; a = b; b = t
		t0 = maxf(t0, a)
		t1 = minf(t1, b)
	if absf(dz) < 1e-6:
		if p1.z <= -h or p1.z >= h:
			return false
	else:
		var a2 := (-h - p1.z) / dz
		var b2 := (h - p1.z) / dz
		if a2 > b2:
			var t2 := a2; a2 = b2; b2 = t2
		t0 = maxf(t0, a2)
		t1 = minf(t1, b2)
	return t0 <= t1 and t1 >= 0.0 and t0 <= 1.0


func ground_height(x: float, z: float, _cur_y: float = 0.0) -> float:
	var df := Vector2(x - FOUNTAIN.x, z - FOUNTAIN.z).length()
	if df <= FOUNTAIN_R:
		return FOUNTAIN_TOP_Y
	return 0.0


func resolve_body(pos: Vector3, radius: float, allow_west_boulevard: bool = false) -> Vector3:
	var min_x := (-PARK_HX - 510.0 + radius) if (allow_west_boulevard and absf(pos.z) < 52.0) else (-PARK_HX + radius + 3.0)
	pos.x = clampf(pos.x, min_x, PARK_HX - radius - 3.0)
	pos.z = clampf(pos.z, -PARK_HZ + radius + 3.0, PARK_HZ - radius - 3.0)

	# Paksa keluar dari pelataran dasar Monas
	var m_half := 22.5 + radius
	var mx := m_half - absf(pos.x)
	var mz := m_half - absf(pos.z)
	if mx > 0.0 and mz > 0.0:
		if mx < mz:
			pos.x += (1.0 if pos.x >= 0.0 else -1.0) * mx
		else:
			pos.z += (1.0 if pos.z >= 0.0 else -1.0) * mz

	# Paksa keluar dari Kolam Pantul utara
	var pool_z := -PARK_HZ * 0.55
	var px := (78.0 + radius) - absf(pos.x)
	var pz := (33.0 + radius) - absf(pos.z - pool_z)
	if px > 0.0 and pz > 0.0:
		if px < pz:
			pos.x += (1.0 if pos.x >= 0.0 else -1.0) * px
		else:
			pos.z += (1.0 if pos.z >= pool_z else -1.0) * pz

	pos = NavGrid2D.resolve_cylinders(pos, radius, _tree_colliders)
	pos = NavGrid2D.resolve_cylinders(pos, radius, _pillar_colliders)
	return pos


func start_monas_collapse() -> void:
	if collapse_active:
		return
	collapse_active = true
	_collapse_phase = "tremble"
	_collapse_t = 0.0
	_collapse_ang = 0.0
	_collapse_vel = 0.0
	_collapse_bounced = false
	for d in _collapse_debris:
		if is_instance_valid(d["node"]):
			(d["node"] as Node).queue_free()
	_collapse_debris.clear()
	AudioManager.play_sfx("explode", 0.9, 0.72)


func _spawn_collapse_debris(cx: float, cz: float, count: int, power: float) -> void:
	var m_marble := Pal.monas_marble_mat()
	for i in count:
		var s := randf_range(1.6, 4.2)
		var b := ProceduralBuilder.add_box(self, Vector3(s, s, s), m_marble, Vector3(cx + randf_range(-8, 8), randf_range(6, 22), cz + randf_range(-8, 8)))
		var ang := randf() * TAU
		var spd := randf_range(12.0, 28.0) * power
		_collapse_debris.append({
			"node": b,
			"vel": Vector3(cos(ang) * spd, randf_range(12.0, 28.0) * power, sin(ang) * spd),
			"rot": Vector3(randf_range(-6, 6), randf_range(-6, 6), randf_range(-6, 6)),
			"rest_y": s * 0.5,
			"done": false,
		})


func step_monas_collapse(dt: float, cam: TopDownCamera, fx: EffectsPool) -> bool:
	if not collapse_active or not monas_top:
		return false
	_collapse_t += dt

	for d in _collapse_debris:
		if bool(d["done"]) or not is_instance_valid(d["node"]):
			continue
		var n: Node3D = d["node"]
		var v: Vector3 = d["vel"]
		v.y -= 62.0 * dt
		n.position += v * dt
		n.rotation += (d["rot"] as Vector3) * dt
		if n.position.y <= float(d["rest_y"]):
			n.position.y = float(d["rest_y"])
			if v.y < -6.0:
				v = Vector3(v.x * 0.5, -v.y * 0.32, v.z * 0.5)
			else:
				v = Vector3.ZERO
				d["done"] = true
		d["vel"] = v

	if _collapse_phase == "tremble":
		var k := clampf(_collapse_t / 1.4, 0.0, 1.0)
		monas_top.rotation.z = sin(_collapse_t * 48.0) * 0.025 * k
		monas_top.rotation.x = cos(_collapse_t * 41.0) * 0.016 * k
		if monas_flame_light:
			monas_flame_light.light_energy = lerpf(2.4, 0.5, k)
		if cam:
			cam.add_shake(0.35 + k * 1.5)
		if _collapse_t >= 1.4:
			_collapse_phase = "topple"
			_collapse_t = 0.0
			_collapse_vel = 0.14
			if fx:
				fx.spawn_explosion(Vector3(0, 10, 0), 22.0, 0.0, Pal.AMBER, true, "explode")
	elif _collapse_phase == "topple":
		_collapse_vel += 1.5 * dt
		_collapse_ang += _collapse_vel * dt
		monas_top.rotation.z = -_collapse_ang
		if _collapse_ang >= PI * 0.48:
			monas_top.rotation.z = -PI * 0.48
			if not _collapse_bounced:
				_collapse_bounced = true
				_collapse_vel = -_collapse_vel * 0.22
				if cam:
					cam.add_shake(4.5)
				if fx:
					fx.spawn_explosion(Vector3(38.0, 4.0, 0.0), 46.0, 0.0, Color("#cfc9bd"), true, "explode")
				_spawn_collapse_debris(38.0, 0.0, 16, 1.3)
				_spawn_collapse_debris(14.0, 0.0, 10, 0.9)
				if monas_flame_light:
					monas_flame_light.light_energy = 0.0
				if monas_flame_glow:
					monas_flame_glow.visible = false
				if _flame_mesh:
					_flame_mesh.visible = false
			else:
				_collapse_phase = "settle"
				_collapse_t = 0.0
	elif _collapse_phase == "settle":
		if _collapse_t >= 1.4:
			collapse_active = false
			return true
	return false
