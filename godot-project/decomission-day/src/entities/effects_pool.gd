class_name EffectsPool
extends Node3D

## Pengelola efek tempur & gore (Porting dari src/entities/effects.js & gore.js):
## - Peluru tracer emas player + kilat moncong bintang 3D + lontaran selongsong kuningan (casings)
## - Peluru plasma musuh + kilat moncong plasma
## - Roket/granat launcher dengan jejak asap
## - Ledakan berlapis (flash OmniLight3D + bola api + cincin kejut + gumpalan asap + percikan)
## - Gore robot & player: semburan cairan, potongan mekanis terpental (gibs), dan genangan lantai (decals).

signal player_bullet_hit_check(b: Dictionary)
signal enemy_bullet_hit_check(b: Dictionary)
signal explosion_damage_check(center: Vector3, radius: float, dmg: float, is_enemy_blast: bool)

var player_bullets: Array[Dictionary] = []
var enemy_bullets: Array[Dictionary] = []
var grenades: Array[Dictionary] = []
var explosions: Array[Dictionary] = []
var particles: Array[Dictionary] = []
var muzzles: Array[Dictionary] = []
var casings: Array[Dictionary] = []
var decals: Array[Dictionary] = []

var _m_player_bullet: StandardMaterial3D
var _m_enemy_bullet: StandardMaterial3D
var _m_rocket: StandardMaterial3D
var _m_grenade: StandardMaterial3D
var _m_coolant: StandardMaterial3D
var _m_blood: StandardMaterial3D
var _m_casing: StandardMaterial3D
var _m_gib: StandardMaterial3D
var _decal_tex: ImageTexture


func _ready() -> void:
	_m_player_bullet = Pal.mat(Pal.BULLET_GOLD, Pal.BULLET_GOLD, 1.8, 0.15, 0.0, false, 1.0, true)
	_m_enemy_bullet = Pal.mat(Pal.PLASMA_BLUE, Pal.PLASMA_BLUE, 1.9, 0.15, 0.0, false, 1.0, true)
	_m_rocket = Pal.mat(Pal.HAZARD, Pal.AMBER, 1.4, 0.35, 0.25)
	_m_grenade = Pal.mat(Pal.LEAF, Color.BLACK, 0.0, 0.5, 0.3)
	_m_coolant = Pal.mat(Pal.COOLANT_GREEN, Pal.COOLANT_GREEN, 0.9, 0.25, 0.0, false, 1.0, true)
	_m_blood = Pal.mat(Pal.BLOOD_RED, Color.BLACK, 0.0, 0.35, 0.0)
	_m_casing = Pal.mat(Color("#e8c15a"), Color("#b88a28"), 0.5, 0.25, 0.85)
	_m_gib = Pal.mat(Color("#3d444c"), Color.BLACK, 0.0, 0.62, 0.45)
	_decal_tex = _build_splat_texture()


func _build_splat_texture() -> ImageTexture:
	var sz := 64
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var center := Vector2(32, 32)
	var rng := RandomNumberGenerator.new(); rng.seed = 4405
	var blobs: Array[Vector3] = [Vector3(32, 32, 16)]
	for _i in 14:
		var a := rng.randf() * TAU
		var d := rng.randf_range(10.0, 22.0)
		blobs.append(Vector3(32.0 + cos(a) * d, 32.0 + sin(a) * d, rng.randf_range(2.2, 6.2)))
	for y in sz:
		for x in sz:
			var best_a := 0.0
			for b in blobs:
				var dist := Vector2(x, y).distance_to(Vector2(b.x, b.y))
				if dist < b.z:
					var k := 1.0 - (dist / b.z)
					best_a = maxf(best_a, clampf(k * 1.35, 0.0, 0.92))
			if best_a > 0.01:
				img.set_pixel(x, y, Color(1, 1, 1, best_a))
	return ImageTexture.create_from_image(img)


func clear_all() -> void:
	for arr in [player_bullets, enemy_bullets, grenades, explosions, particles, muzzles, casings, decals]:
		for item in arr:
			for k in ["node", "ring", "light"]:
				var n: Variant = item.get(k)
				if n is Node and is_instance_valid(n):
					(n as Node).queue_free()
		arr.clear()


func _safe_look(node: Node3D, origin: Vector3, dir: Vector3) -> void:
	if dir.length_squared() > 1e-4 and absf(dir.normalized().dot(Vector3.UP)) < 0.995:
		node.look_at(origin + dir, Vector3.UP)


func spawn_muzzle_flash(origin: Vector3, dir: Vector3, col: Color = Color("#ffde82"), scale_m: float = 1.0) -> void:
	var root := Node3D.new()
	root.position = origin
	add_child(root)
	_safe_look(root, origin, dir)
	var m := Pal.unique_mat(col, col, 2.0, 0.1, 0.0, true, 0.92, true)
	ProceduralBuilder.add_box(root, Vector3(3.4 * scale_m, 0.15, 0.85 * scale_m), m, Vector3.ZERO, Vector3.ZERO, false)
	ProceduralBuilder.add_box(root, Vector3(0.85 * scale_m, 0.15, 3.8 * scale_m), m, Vector3(0, 0, -0.8 * scale_m), Vector3.ZERO, false)
	muzzles.append({"node": root, "mat": m, "life": 0.065, "max_life": 0.065})


func _spawn_shell_casing(origin: Vector3, dir: Vector3) -> void:
	if casings.size() >= 24:
		var old: Dictionary = casings.pop_front()
		if is_instance_valid(old["node"]):
			(old["node"] as Node).queue_free()
	var right := dir.cross(Vector3.UP).normalized()
	if right.length_squared() < 0.01:
		right = Vector3.RIGHT
	var eject_vel := right * randf_range(16.0, 26.0) - dir * randf_range(4.0, 11.0) + Vector3(0, randf_range(18.0, 28.0), 0)
	var mesh := ProceduralBuilder.add_box(self, Vector3(0.32, 0.32, 0.92), _m_casing, origin - dir * 1.4, Vector3.ZERO, false)
	casings.append({
		"node": mesh,
		"vel": eject_vel,
		"spin": Vector3(randf_range(-18, 18), randf_range(-18, 18), randf_range(-18, 18)),
		"life": 1.1,
		"bounced": false,
	})


func spawn_decal(pos: Vector3, is_blood: bool = false, radius: float = 6.5) -> void:
	if decals.size() >= 36:
		var old: Dictionary = decals.pop_front()
		if is_instance_valid(old["node"]):
			(old["node"] as Node).queue_free()
	var col := Color("#b81d1d") if is_blood else Color("#2fbf66")
	var m := StandardMaterial3D.new()
	m.albedo_texture = _decal_tex
	m.albedo_color = Color(col.r, col.g, col.b, 0.82)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var mi := ProceduralBuilder.add_plane(self, Vector2(radius, radius), m, Vector3(pos.x, maxf(0.06, pos.y + 0.06), pos.z), Vector3(0, randf_range(0, 360), 0))
	decals.append({"node": mi, "mat": m, "life": 5.5})


func spawn_player_bullet(weapon_id: String, origin: Vector3, dir: Vector3, dmg: float, is_rocket: bool) -> void:
	spawn_muzzle_flash(origin, dir, Color("#ffe38a"), 1.35 if weapon_id == "shotgun" else 1.0)
	var wc: Dictionary = Config.section("weapons")
	if weapon_id == "launcher":
		var mesh := ProceduralBuilder.add_sphere(self, 1.4, _m_rocket if is_rocket else _m_grenade, origin, Vector3(1, 1, 1.8 if is_rocket else 1.2), 8, 5, false)
		_safe_look(mesh, origin, dir)
		var spd := float(wc.get("launcher", {}).get("roundSpeed", 5.0)) * (1.35 if is_rocket else 1.0)
		grenades.append({
			"node": mesh,
			"pos": origin,
			"prev": origin,
			"vel": dir * spd * 60.0,
			"dmg": dmg,
			"radius": float(wc.get("splashRadiusMeters", 1.0)) * Config.CAMP_M * (3.8 if is_rocket else 3.2),
			"life": 3.0,
			"is_rocket": is_rocket,
		})
		return

	if randf() < (0.35 if weapon_id == "shotgun" else 0.85):
		_spawn_shell_casing(origin, dir)

	var mesh := ProceduralBuilder.add_box(self, Vector3(0.55, 0.55, 6.2), _m_player_bullet, origin, Vector3.ZERO, false)
	_safe_look(mesh, origin, dir)
	var spd := float(wc.get("bulletSpeed", 27.0))
	player_bullets.append({
		"node": mesh,
		"pos": origin,
		"prev": origin,
		"dir": dir,
		"speed": spd * 60.0,
		"dmg": dmg,
		"life": float(wc.get("bulletLife", 120.0)) / 60.0,
		"alive": true,
	})


func spawn_enemy_bullet(origin: Vector3, dir: Vector3, speed_unit: float, dmg: float, monas_dmg: float = 0.0, target_structure: bool = false, is_tracer: bool = false) -> void:
	spawn_muzzle_flash(origin, dir, Pal.PLASMA_BLUE, 0.9)
	var size := Vector3(0.95, 0.95, 6.2) if is_tracer else Vector3(1.5, 1.5, 2.2)
	var mesh := ProceduralBuilder.add_box(self, size, _m_enemy_bullet, origin, Vector3.ZERO, false)
	_safe_look(mesh, origin, dir)
	enemy_bullets.append({
		"node": mesh,
		"pos": origin,
		"prev": origin,
		"dir": dir,
		"speed": speed_unit * 60.0,
		"dmg": dmg,
		"monas_dmg": monas_dmg,
		"structure_dmg": dmg if target_structure else 0.0,
		"life": float(Config.section("robot").get("rangedBulletLife", 120.0)) / 60.0,
		"alive": true,
	})


func spawn_explosion(center: Vector3, radius: float, dmg: float = 0.0, color: Color = Color("#ff6a20"), is_enemy_blast: bool = false, sfx_key: String = "explode") -> void:
	var sphere := ProceduralBuilder.add_sphere(
		self, 1.0,
		Pal.unique_mat(color, color, 2.2, 0.2, 0.0, true, 0.92, true),
		center, Vector3.ONE * 2.0, 12, 8, false
	)
	var ring := ProceduralBuilder.add_ring(
		self, 0.72, 1.0,
		Pal.unique_mat(Pal.AMBER, Pal.AMBER, 1.6, 0.2, 0.0, true, 0.88, true),
		Vector3(center.x, maxf(0.3, center.y), center.z), 24
	)
	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 3.2
	light.omni_range = maxf(65.0, radius * 2.8)
	light.position = center + Vector3(0, 4.0, 0)
	add_child(light)

	explosions.append({
		"node": sphere,
		"ring": ring,
		"light": light,
		"t": 0.0,
		"dur": 0.45,
		"max_r": maxf(8.0, radius),
	})

	# Percikan bara & pecahan logam dari ledakan
	for i in 10:
		var ang := randf() * TAU
		var spd := randf_range(28.0, 78.0)
		var spark := ProceduralBuilder.add_box(self, Vector3(0.8, 0.8, 1.8), _m_player_bullet if i % 2 == 0 else _m_gib, center + Vector3(0, 2, 0), Vector3.ZERO, false)
		particles.append({
			"node": spark,
			"vel": Vector3(cos(ang) * spd, randf_range(22.0, 56.0), sin(ang) * spd),
			"spin": Vector3(randf_range(-10, 10), randf_range(-10, 10), randf_range(-10, 10)),
			"life": randf_range(0.35, 0.75),
			"gravity": 115.0,
		})

	if not sfx_key.is_empty():
		AudioManager.play_sfx(sfx_key, 0.8)
	if dmg > 0.0:
		explosion_damage_check.emit(center, radius, dmg, is_enemy_blast)


func spawn_burst(pos: Vector3, count: int = 8, is_blood: bool = false) -> void:
	var mat := _m_blood if is_blood else _m_coolant
	for i in count:
		var ang := randf() * TAU
		var spd := randf_range(16.0, 48.0)
		var use_gib := (not is_blood) and (i % 3 == 0)
		var sz := Vector3(1.3, 0.7, 1.6) if use_gib else Vector3(0.95, 0.95, 0.95)
		var mesh := ProceduralBuilder.add_box(self, sz, _m_gib if use_gib else mat, pos, Vector3.ZERO, false)
		particles.append({
			"node": mesh,
			"vel": Vector3(cos(ang) * spd, randf_range(18.0, 46.0), sin(ang) * spd),
			"spin": Vector3(randf_range(-12, 12), randf_range(-12, 12), randf_range(-12, 12)),
			"life": randf_range(0.32, 0.68),
			"gravity": 105.0,
		})
	# Genangan coolant hijau / darah merah di lantai (gore.js spawnBloodDecal)
	if count >= 4:
		spawn_decal(Vector3(pos.x, 0.0, pos.z), is_blood, randf_range(5.2, 8.8))


func step(dt: float, bullet_blocked_fn: Callable = Callable()) -> void:
	# 1. Peluru player
	for i in range(player_bullets.size() - 1, -1, -1):
		var b: Dictionary = player_bullets[i]
		b["prev"] = b["pos"]
		b["pos"] = (b["pos"] as Vector3) + (b["dir"] as Vector3) * float(b["speed"]) * dt
		b["life"] = float(b["life"]) - dt
		var mi: MeshInstance3D = b["node"]
		mi.global_position = b["pos"]

		var blocked := false
		if bullet_blocked_fn.is_valid():
			blocked = bool(bullet_blocked_fn.call(b))
		if blocked:
			b["alive"] = false
		else:
			player_bullet_hit_check.emit(b)

		if not bool(b["alive"]) or float(b["life"]) <= 0.0:
			mi.queue_free()
			player_bullets.remove_at(i)

	# 2. Granat / roket launcher
	for i in range(grenades.size() - 1, -1, -1):
		var g: Dictionary = grenades[i]
		g["prev"] = g["pos"]
		g["pos"] = (g["pos"] as Vector3) + (g["vel"] as Vector3) * dt
		if not bool(g["is_rocket"]):
			var v: Vector3 = g["vel"]
			v.y -= 35.0 * dt
			g["vel"] = v
		g["life"] = float(g["life"]) - dt
		var mi: MeshInstance3D = g["node"]
		mi.global_position = g["pos"]

		var hit_wall := false
		if bullet_blocked_fn.is_valid():
			hit_wall = bool(bullet_blocked_fn.call({"prev": g["prev"], "pos": g["pos"]}))
		var hit_robot_probe := {"prev": g["prev"], "pos": g["pos"], "dmg": 0.0, "alive": true, "probe_only": true}
		player_bullet_hit_check.emit(hit_robot_probe)

		if hit_wall or not bool(hit_robot_probe["alive"]) or (g["pos"] as Vector3).y <= 0.5 or float(g["life"]) <= 0.0:
			spawn_explosion(g["pos"], float(g["radius"]), float(g["dmg"]), Color("#ff5518"), false, "rocket_explode" if bool(g["is_rocket"]) else "explode")
			mi.queue_free()
			grenades.remove_at(i)

	# 3. Peluru musuh
	for i in range(enemy_bullets.size() - 1, -1, -1):
		var b: Dictionary = enemy_bullets[i]
		b["prev"] = b["pos"]
		b["pos"] = (b["pos"] as Vector3) + (b["dir"] as Vector3) * float(b["speed"]) * dt
		b["life"] = float(b["life"]) - dt
		var mi: MeshInstance3D = b["node"]
		mi.global_position = b["pos"]

		var blocked := false
		if bullet_blocked_fn.is_valid():
			blocked = bool(bullet_blocked_fn.call(b))
		if blocked:
			b["alive"] = false
		else:
			enemy_bullet_hit_check.emit(b)

		if not bool(b["alive"]) or float(b["life"]) <= 0.0:
			mi.queue_free()
			enemy_bullets.remove_at(i)

	# 4. Animasi ledakan + flash light
	for i in range(explosions.size() - 1, -1, -1):
		var ex: Dictionary = explosions[i]
		ex["t"] = float(ex["t"]) + dt
		var k := clampf(float(ex["t"]) / float(ex["dur"]), 0.0, 1.0)
		var sp: MeshInstance3D = ex["node"]
		var rg: MeshInstance3D = ex["ring"]
		var lt: OmniLight3D = ex.get("light")
		var r := float(ex["max_r"]) * (0.2 + 0.8 * sin(k * PI * 0.5))
		sp.scale = Vector3.ONE * r * 0.65
		rg.scale = Vector3.ONE * r * 1.15
		if lt and is_instance_valid(lt):
			lt.light_energy = (1.0 - k) * 3.2
		var sm := sp.material_override as StandardMaterial3D
		if sm:
			sm.albedo_color.a = (1.0 - k) * 0.88
		var rm := rg.material_override as StandardMaterial3D
		if rm:
			rm.albedo_color.a = (1.0 - k) * 0.88
		if k >= 1.0:
			sp.queue_free()
			rg.queue_free()
			if lt and is_instance_valid(lt):
				lt.queue_free()
			explosions.remove_at(i)

	# 5. Partikel percikan & gibs
	for i in range(particles.size() - 1, -1, -1):
		var p: Dictionary = particles[i]
		p["life"] = float(p["life"]) - dt
		var vel: Vector3 = p["vel"]
		vel.y -= float(p["gravity"]) * dt
		p["vel"] = vel
		var mi: MeshInstance3D = p["node"]
		mi.global_position += vel * dt
		if p.has("spin"):
			mi.rotation += (p["spin"] as Vector3) * dt
		if mi.global_position.y < 0.25:
			mi.global_position.y = 0.25
			vel.y *= -0.35
			vel.x *= 0.65
			vel.z *= 0.65
			p["vel"] = vel
		if float(p["life"]) <= 0.0:
			mi.queue_free()
			particles.remove_at(i)

	# 6. Kilat moncong 3D
	for i in range(muzzles.size() - 1, -1, -1):
		var mz: Dictionary = muzzles[i]
		mz["life"] = float(mz["life"]) - dt
		var n: Node3D = mz["node"]
		var m: StandardMaterial3D = mz["mat"]
		var k := clampf(float(mz["life"]) / float(mz["max_life"]), 0.0, 1.0)
		m.albedo_color.a = k * 0.92
		if float(mz["life"]) <= 0.0:
			n.queue_free()
			muzzles.remove_at(i)

	# 7. Selongsong peluru kuningan (effects.js casingPool)
	for i in range(casings.size() - 1, -1, -1):
		var cs: Dictionary = casings[i]
		cs["life"] = float(cs["life"]) - dt
		var n: MeshInstance3D = cs["node"]
		var vel: Vector3 = cs["vel"]
		vel.y -= 150.0 * dt
		n.global_position += vel * dt
		n.rotation += (cs["spin"] as Vector3) * dt
		if n.global_position.y <= 0.22:
			n.global_position.y = 0.22
			if not bool(cs["bounced"]):
				cs["bounced"] = true
				vel = Vector3(vel.x * 0.45, absf(vel.y) * 0.32, vel.z * 0.45)
				cs["spin"] = (cs["spin"] as Vector3) * 0.3
			else:
				vel = Vector3.ZERO
				cs["spin"] = Vector3.ZERO
		cs["vel"] = vel
		if float(cs["life"]) <= 0.0:
			n.queue_free()
			casings.remove_at(i)

	# 8. Genangan coolant/darah di lantai (gore.js DECAL_POOL)
	for i in range(decals.size() - 1, -1, -1):
		var dc: Dictionary = decals[i]
		dc["life"] = float(dc["life"]) - dt
		var m: StandardMaterial3D = dc["mat"]
		if float(dc["life"]) < 1.5:
			m.albedo_color.a = clampf(float(dc["life"]) / 1.5, 0.0, 1.0) * 0.82
		if float(dc["life"]) <= 0.0:
			(dc["node"] as Node).queue_free()
			decals.remove_at(i)
