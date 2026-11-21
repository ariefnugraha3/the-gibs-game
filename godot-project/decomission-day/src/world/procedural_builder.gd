class_name ProceduralBuilder
extends RefCounted

## Pabrik geometri primitif 3D low-poly prosedural & preset cahaya GIBS 2045.
## Menggunakan cache Mesh agar instance berbagi draw-state secara efisien di PC & Mobile.

static var _box_cache: Dictionary = {}
static var _cyl_cache: Dictionary = {}
static var _sph_cache: Dictionary = {}
static var _plane_cache: Dictionary = {}


static func _get_box(size: Vector3) -> BoxMesh:
	var key := "%.2f|%.2f|%.2f" % [size.x, size.y, size.z]
	if _box_cache.has(key):
		return _box_cache[key]
	var m := BoxMesh.new()
	m.size = size
	_box_cache[key] = m
	return m


static func _get_cyl(r_top: float, r_bot: float, h: float, radial: int = 10) -> CylinderMesh:
	var key := "%.2f|%.2f|%.2f|%d" % [r_top, r_bot, h, radial]
	if _cyl_cache.has(key):
		return _cyl_cache[key]
	var m := CylinderMesh.new()
	m.top_radius = r_top
	m.bottom_radius = r_bot
	m.height = h
	m.radial_segments = radial
	m.rings = 1
	_cyl_cache[key] = m
	return m


static func _get_sph(r: float, radial: int = 10, rings: int = 6) -> SphereMesh:
	var key := "%.2f|%d|%d" % [r, radial, rings]
	if _sph_cache.has(key):
		return _sph_cache[key]
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	m.radial_segments = radial
	m.rings = rings
	_sph_cache[key] = m
	return m


static func _get_plane(size: Vector2) -> PlaneMesh:
	var key := "%.2f|%.2f" % [size.x, size.y]
	if _plane_cache.has(key):
		return _plane_cache[key]
	var m := PlaneMesh.new()
	m.size = size
	_plane_cache[key] = m
	return m


static func add_box(
	parent: Node3D,
	size: Vector3,
	mat: Material,
	pos: Vector3 = Vector3.ZERO,
	rot_deg: Vector3 = Vector3.ZERO,
	cast_shadow: bool = true
) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _get_box(size)
	mi.material_override = mat
	mi.position = pos
	if rot_deg != Vector3.ZERO:
		mi.rotation_degrees = rot_deg
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func add_cyl(
	parent: Node3D,
	r_top: float,
	r_bot: float,
	h: float,
	mat: Material,
	pos: Vector3 = Vector3.ZERO,
	rot_deg: Vector3 = Vector3.ZERO,
	radial: int = 10,
	cast_shadow: bool = true
) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _get_cyl(r_top, r_bot, h, radial)
	mi.material_override = mat
	mi.position = pos
	if rot_deg != Vector3.ZERO:
		mi.rotation_degrees = rot_deg
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func add_sphere(
	parent: Node3D,
	r: float,
	mat: Material,
	pos: Vector3 = Vector3.ZERO,
	scale_v: Vector3 = Vector3.ONE,
	radial: int = 10,
	rings: int = 6,
	cast_shadow: bool = true
) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _get_sph(r, radial, rings)
	mi.material_override = mat
	mi.position = pos
	mi.scale = scale_v
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func add_plane(
	parent: Node3D,
	size: Vector2,
	mat: Material,
	pos: Vector3 = Vector3.ZERO,
	rot_deg: Vector3 = Vector3.ZERO
) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _get_plane(size)
	mi.material_override = mat
	mi.position = pos
	if rot_deg != Vector3.ZERO:
		mi.rotation_degrees = rot_deg
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func add_ring(
	parent: Node3D,
	r_inner: float,
	r_outer: float,
	mat: Material,
	pos: Vector3 = Vector3.ZERO,
	segs: int = 28
) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in segs:
		var a0 := (float(i) / float(segs)) * TAU
		var a1 := (float(i + 1) / float(segs)) * TAU
		var p0 := Vector3(cos(a0) * r_inner, 0.0, sin(a0) * r_inner)
		var p1 := Vector3(cos(a0) * r_outer, 0.0, sin(a0) * r_outer)
		var p2 := Vector3(cos(a1) * r_outer, 0.0, sin(a1) * r_outer)
		var p3 := Vector3(cos(a1) * r_inner, 0.0, sin(a1) * r_inner)
		st.set_normal(Vector3.UP)
		st.add_vertex(p0); st.add_vertex(p1); st.add_vertex(p2)
		st.add_vertex(p0); st.add_vertex(p2); st.add_vertex(p3)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func setup_lighting(parent: Node3D, preset: String = "outdoor") -> Dictionary:
	for ch_name in ["WorldEnv", "SunLight", "RimLight"]:
		var old := parent.get_node_or_null(ch_name)
		if old:
			parent.remove_child(old)
			old.queue_free()
	var rig := create_lighting_rig(parent)
	apply_light_preset(rig, preset)
	return rig


static func create_lighting_rig(parent: Node3D) -> Dictionary:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("#080912")
	sky_mat.sky_horizon_color = Color("#4a2c1a")
	sky_mat.ground_horizon_color = Color("#24150d")
	sky_mat.ground_bottom_color = Color("#0a0a12")
	sky_mat.sky_curve = 0.12

	var sky := Sky.new()
	sky.sky_material = sky_mat

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_color = Color("#ffd9b3")
	env.ambient_light_sky_contribution = 0.45
	env.ambient_light_energy = 0.58
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true
	env.glow_intensity = 0.65
	env.glow_bloom = 0.28
	env.glow_hdr_threshold = 0.92
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color("#1a1410")
	env.fog_depth_begin = 240.0
	env.fog_depth_end = 1700.0

	var world_env := WorldEnvironment.new()
	world_env.name = "WorldEnv"
	world_env.environment = env
	parent.add_child(world_env)

	# Matahari/bulan apokaliptik (-220, 260, -280) sesuai src/world/lighting.js
	var sun := DirectionalLight3D.new()
	sun.name = "SunLight"
	sun.light_color = Color("#ff7b3a")
	sun.light_energy = 0.85
	sun.rotation_degrees = Vector3(-36.2, -141.8, 0.0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 680.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.4
	parent.add_child(sun)

	# Rim biru dingin (300, 200, 350) pemisah siluet robot dari tanah
	var rim := DirectionalLight3D.new()
	rim.name = "RimLight"
	rim.light_color = Color("#5a76c8")
	rim.light_energy = 0.28
	rim.rotation_degrees = Vector3(-23.4, 38.6, 0.0)
	rim.shadow_enabled = false
	parent.add_child(rim)

	var rig := {"world_env": world_env, "env": env, "sky_mat": sky_mat, "sun": sun, "rim": rim}
	apply_quality_to_rig(rig, SceneRouter.quality_tier)
	return rig


static func apply_quality_to_rig(rig: Dictionary, tier: int) -> void:
	var q: Dictionary = SceneRouter.QUALITY_TIERS[clampi(tier, 0, SceneRouter.QUALITY_TIERS.size() - 1)]
	var env: Environment = rig.get("env")
	var sun: DirectionalLight3D = rig.get("sun")
	if env:
		env.glow_enabled = bool(q["bloom"])
	if sun:
		sun.shadow_enabled = bool(q["shadows"])


static func apply_light_preset(rig: Dictionary, preset: String) -> void:
	var env: Environment = rig.get("env")
	var sky_mat: ProceduralSkyMaterial = rig.get("sky_mat")
	var sun: DirectionalLight3D = rig.get("sun")
	var rim: DirectionalLight3D = rig.get("rim")
	if not env or not sun or not rim:
		return
	match preset:
		"indoor":
			if sky_mat:
				sky_mat.sky_top_color = Color("#0c1018")
				sky_mat.sky_horizon_color = Color("#1e2634")
				sky_mat.ground_bottom_color = Color("#0a0d12")
			env.ambient_light_color = Color("#ffd9b3")
			env.ambient_light_energy = 0.72
			env.fog_light_color = Color("#141922")
			env.fog_depth_begin = 280.0
			env.fog_depth_end = 1450.0
			sun.light_color = Color("#ffaa70")
			sun.light_energy = 0.78
			rim.light_color = Color("#5a76c8")
			rim.light_energy = 0.34
		"night":
			if sky_mat:
				sky_mat.sky_top_color = Color("#05060f")
				sky_mat.sky_horizon_color = Color("#5a2a16")
				sky_mat.ground_bottom_color = Color("#0a0a12")
			env.ambient_light_color = Color("#ffd9b3")
			env.ambient_light_energy = 0.52
			env.fog_light_color = Color("#1a120d")
			env.fog_depth_begin = 220.0
			env.fog_depth_end = 1450.0
			sun.light_color = Color("#ff8242")
			sun.light_energy = 0.75
			rim.light_color = Color("#5a76c8")
			rim.light_energy = 0.26
		"flight":
			if sky_mat:
				sky_mat.sky_top_color = Color("#0d1522")
				sky_mat.sky_horizon_color = Color("#3d2920")
			env.ambient_light_color = Color("#ffd9b3")
			env.ambient_light_energy = 0.50
			env.fog_light_color = Color("#1c2430")
			env.fog_depth_begin = 260.0
			env.fog_depth_end = 1750.0
			sun.light_color = Color("#ff8e4d")
			sun.light_energy = 0.68
			rim.light_color = Color("#5a76c8")
			rim.light_energy = 0.22
		"midnight":
			if sky_mat:
				sky_mat.sky_top_color = Color("#05070b")
				sky_mat.sky_horizon_color = Color("#1a2230")
			env.ambient_light_color = Color("#b9c4d6")
			env.ambient_light_energy = 0.28
			env.fog_light_color = Color("#0b0f17")
			env.fog_depth_begin = 190.0
			env.fog_depth_end = 1150.0
			sun.light_color = Color("#8fa0c8")
			sun.light_energy = 0.42
			rim.light_color = Color("#3c4c78")
			rim.light_energy = 0.18
		"sunrise":
			if sky_mat:
				sky_mat.sky_top_color = Color("#1e2438")
				sky_mat.sky_horizon_color = Color("#d87842")
				sky_mat.ground_horizon_color = Color("#6a3d28")
			env.ambient_light_color = Color("#ffd7b0")
			env.ambient_light_energy = 0.76
			env.fog_light_color = Color("#7c5743")
			env.fog_depth_begin = 240.0
			env.fog_depth_end = 1600.0
			sun.light_color = Color("#ffae66")
			sun.light_energy = 1.1
			rim.light_color = Color("#88a8d8")
			rim.light_energy = 0.34
		_: # outdoor
			if sky_mat:
				sky_mat.sky_top_color = Color("#05060f")
				sky_mat.sky_horizon_color = Color("#6e3018")
			env.ambient_light_color = Color("#ffd9b3")
			env.ambient_light_energy = 0.56
			env.fog_light_color = Color("#1e140e")
			env.fog_depth_begin = 220.0
			env.fog_depth_end = 1700.0
			sun.light_color = Color("#ff7b3a")
			sun.light_energy = 0.85
			rim.light_color = Color("#5a76c8")
			rim.light_energy = 0.26
