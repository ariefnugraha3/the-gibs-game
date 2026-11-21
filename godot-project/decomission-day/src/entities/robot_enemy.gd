class_name RobotEnemy
extends Node3D

## Robot Iron Battalion prosedural (kelas C perunggu melee, B perak ranged,
## A emas dual-rifle heavy ranged, dan Giant boss Survival).
## Porting visual autentik dari src/entities/robots.js (tabel geometri RG):
## torso meruncing pipih, pelat dada elipsoid warna kelas, panggul, inti daya emisif,
## ransel daya, yoke bahu + bantalan bahu, kepala sensor + crown + visor merah + antena,
## sendi bola pinggul/lutut/siku, telapak ber-ankle, cakar kerucut / senapan detail.

signal robot_killed(robot: RobotEnemy, killed_by_player: bool)
signal robot_shoot_requested(origin: Vector3, dir: Vector3, speed: float, dmg: float, monas_dmg: float, target_structure: bool)
signal player_clawed(robot: RobotEnemy, dmg: float, push_dir: Vector2)
signal monas_gnawed(robot: RobotEnemy, dmg: float)
signal structure_clawed(robot: RobotEnemy, dmg: float)

var kind := "C"
var stage_id := 0
var encounter := ""
var state := "chasing" # "idle" | "chasing" | "dead"
var hp := 50.0
var max_hp := 50.0
var speed := 0.8
var attack := 5.0
var scl := 1.0
var ranged := false
var fire_range := 140.0
var fire_delay := 0.8
var bullet_speed := 1.0
var reach_mul := 1.0

var nav_head := 0.0
var _nav_path: Array[Vector2] = []
var _nav_idx := 0
var _repath_t := 0.0

var _fire_cd := 0.4
var _fire_alt := false
var _recoil_l := 0.0
var _recoil_r := 0.0
var _attack_cd := 0.0
var _wind_t := 0.0
var _wind_dur := 0.5
var _wind_target := "player"
var _claw_side := 1.0
var _moving := false
var _gait := 0.0
var _flash_t := 0.0
var _dead_t := 0.0

# State khusus Survival / Saboteur
var monas_committed := false
var monas_locked := false
var is_saboteur := false
var saboteur_target := "aircraft"

var _inner: Node3D
var _head_g: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _leg_l: Node3D
var _leg_r: Node3D
var _knee_l: Node3D
var _knee_r: Node3D
var _ankle_l: Node3D
var _ankle_r: Node3D
var _armor_mats: Array[StandardMaterial3D] = []
var _muzzle_r: Node3D
var _muzzle_l: Node3D


func setup(p_kind: String, p_pos: Vector3, p_stage: int = 0, p_encounter: String = "", start_idle: bool = false) -> void:
	kind = p_kind
	stage_id = p_stage
	encounter = p_encounter
	state = "idle" if start_idle else "chasing"
	global_position = p_pos
	_gait = randf() * TAU

	if kind == "boss":
		var g: Dictionary = Config.campaign().get("bosses", {}).get("giant", {})
		max_hp = float(g.get("hp", 1800.0))
		hp = max_hp
		speed = float(g.get("speed", 0.35))
		attack = float(g.get("clawDamage", 60.0))
		scl = float(g.get("scale", 2.4))
		ranged = false
		reach_mul = float(g.get("reachMul", 1.8))
	else:
		var c: Dictionary = Config.section("robot").get("classes", {}).get(kind, {})
		max_hp = float(c.get("hp", 50.0))
		hp = max_hp
		speed = float(c.get("speed", 0.8))
		attack = float(c.get("attack", 5.0))
		scl = float(c.get("scale", 1.0))
		ranged = bool(c.get("ranged", false))
		fire_range = float(c.get("rangeMeters", 20.0)) * Config.CAMP_M
		fire_delay = float(c.get("fireDelaySec", 0.8))
		bullet_speed = float(c.get("bulletSpeed", 1.0))
		reach_mul = maxf(1.0, scl)

	scale = Vector3.ONE * scl
	_build_mesh()


func _build_mesh() -> void:
	var look: Dictionary = Pal.CLASS_LOOK.get(kind, Pal.CLASS_LOOK["C"])
	var jitter := randf_range(-0.04, 0.03)
	var armor_col: Color = (look["armor"] as Color).lightened(jitter) if jitter >= 0.0 else (look["armor"] as Color).darkened(-jitter)
	var metal_col: Color = Pal.GUNMETAL.lightened(jitter * 0.5) if jitter >= 0.0 else Pal.GUNMETAL.darkened(-jitter * 0.5)

	var m_armor := Pal.unique_mat(armor_col, Color.BLACK, 0.0, 0.58, 0.45)
	var m_metal := Pal.unique_mat(metal_col, Color.BLACK, 0.0, 0.65, 0.38)
	var m_joint := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.25)
	var m_dark := Pal.mat(Color("#14171b"), Color.BLACK, 0.0, 0.82, 0.2)
	var m_glow := Pal.mat(look["glow"], look["glow"], 1.15, 0.25, 0.1, false, 1.0, true)
	var m_eye := Pal.mat(Pal.EYE_RED, Pal.EYE_RED, 1.45, 0.2, 0.0, false, 1.0, true)
	_armor_mats = [m_armor, m_metal]

	_inner = Node3D.new()
	_inner.name = "InnerRig"
	add_child(_inner)

	# Torso rangka meruncing pipih + pelat dada elipsoid + panggul + inti daya + ransel + yoke bahu
	var torso_mesh := ProceduralBuilder.add_cyl(_inner, 1.5, 1.0, 4.4, m_metal, Vector3(0, 7.9, 0), Vector3.ZERO, 10)
	torso_mesh.scale = Vector3(1.0, 1.0, 0.68)
	ProceduralBuilder.add_sphere(_inner, 1.32, m_armor, Vector3(0, 8.55, 0.42), Vector3(1.42, 0.95, 0.6), 10, 6, false)
	ProceduralBuilder.add_sphere(_inner, 0.92, m_joint, Vector3(0, 5.6, 0.0), Vector3(1.32, 0.6, 0.95), 8, 5, false)
	ProceduralBuilder.add_sphere(_inner, 0.44, m_glow, Vector3(0, 7.35, 1.05), Vector3(1.0, 1.3, 0.7), 8, 5, false)
	ProceduralBuilder.add_box(_inner, Vector3(1.85, 2.3, 0.95), m_dark, Vector3(0, 8.2, -1.28), Vector3.ZERO, false)
	ProceduralBuilder.add_sphere(_inner, 1.0, m_joint, Vector3(0, 9.75, 0.0), Vector3(2.05, 0.66, 0.92), 10, 6, false)
	ProceduralBuilder.add_cyl(_inner, 0.34, 0.46, 0.9, m_dark, Vector3(0, 10.0, 0), Vector3.ZERO, 8, false)

	# Kepala: tabung sensor + crown armor + celah visor merah + antena (B/A)
	_head_g = Node3D.new()
	_head_g.position = Vector3(0, 10.3, 0)
	_inner.add_child(_head_g)
	var h_cyl := ProceduralBuilder.add_cyl(_head_g, 0.95, 1.05, 1.8, m_metal, Vector3(0, 1.15, 0), Vector3.ZERO, 10)
	h_cyl.scale = Vector3(1.0, 1.0, 0.9)
	ProceduralBuilder.add_sphere(_head_g, 1.0, m_armor, Vector3(0, 2.05, 0), Vector3(0.98, 0.55, 0.9), 10, 5, false)
	ProceduralBuilder.add_box(_head_g, Vector3(1.52, 0.42, 0.52), m_eye, Vector3(0, 1.3, 0.84), Vector3.ZERO, false)
	if ranged:
		ProceduralBuilder.add_cyl(_head_g, 0.06, 0.06, 1.4, m_dark, Vector3(0.72, 2.7, -0.2), Vector3.ZERO, 6, false)
		ProceduralBuilder.add_sphere(_head_g, 0.18, m_eye, Vector3(0.72, 3.4, -0.2), Vector3.ONE, 6, 4, false)

	# Kaki kiri & kanan: hipBall -> thigh -> knee -> kneePad + shin -> ankle -> foot
	for side in [-1.0, 1.0]:
		var hip := Node3D.new()
		hip.position = Vector3(side * 1.05, 5.7, 0.0)
		_inner.add_child(hip)
		ProceduralBuilder.add_sphere(hip, 0.62, m_joint, Vector3.ZERO, Vector3.ONE, 7, 5, false)
		ProceduralBuilder.add_cyl(hip, 0.64, 0.5, 3.0, m_armor, Vector3(0, -1.5, 0), Vector3.ZERO, 8)
		var knee := Node3D.new()
		knee.position = Vector3(0, -3.0, 0)
		hip.add_child(knee)
		ProceduralBuilder.add_sphere(knee, 0.56, m_joint, Vector3(0, 0.12, 0.28), Vector3(1.0, 0.85, 1.0), 7, 5, false)
		ProceduralBuilder.add_cyl(knee, 0.42, 0.58, 2.7, m_metal, Vector3(0, -1.35, 0), Vector3.ZERO, 8)
		var ankle := Node3D.new()
		ankle.position = Vector3(0, -2.5, 0)
		knee.add_child(ankle)
		ProceduralBuilder.add_sphere(ankle, 0.62, m_dark, Vector3(0, 0, 0.5), Vector3(1.1, 0.55, 1.85), 7, 5, false)
		if side < 0.0:
			_leg_l = hip; _knee_l = knee; _ankle_l = ankle
		else:
			_leg_r = hip; _knee_r = knee; _ankle_r = ankle

	# Lengan kiri & kanan: bantalan bahu + aktuator lengan + siku bola + cakar / senapan
	_arm_l = _build_arm(-2.15, m_armor, m_metal, m_joint, m_dark, kind == "A")
	_arm_r = _build_arm(2.15, m_armor, m_metal, m_joint, m_dark, ranged)


func _build_arm(sx: float, m_armor: Material, m_metal: Material, m_joint: Material, m_dark: Material, has_gun: bool) -> Node3D:
	var arm := Node3D.new()
	arm.position = Vector3(sx, 9.5, 0.0)
	_inner.add_child(arm)
	ProceduralBuilder.add_sphere(arm, 0.72, m_armor, Vector3(0, 0.1, 0), Vector3(1.05, 0.82, 1.0), 8, 5, false)
	ProceduralBuilder.add_cyl(arm, 0.46, 0.36, 3.7, m_metal, Vector3(0, -1.85, 0), Vector3.ZERO, 8)
	ProceduralBuilder.add_sphere(arm, 0.5, m_joint, Vector3(0, -3.7, 0), Vector3.ONE, 7, 5, false)

	if has_gun:
		var gun_g := Node3D.new()
		gun_g.position = Vector3(0, -3.9, 0.3)
		arm.add_child(gun_g)
		ProceduralBuilder.add_box(gun_g, Vector3(0.46, 0.66, 2.4), m_dark, Vector3(0, 0, 1.1))
		ProceduralBuilder.add_cyl(gun_g, 0.14, 0.14, 1.9, m_metal, Vector3(0, 0.12, 3.1), Vector3(90, 0, 0), 8)
		ProceduralBuilder.add_cyl(gun_g, 0.24, 0.24, 0.45, m_joint, Vector3(0, 0.12, 4.1), Vector3(90, 0, 0), 8, false)
		ProceduralBuilder.add_box(gun_g, Vector3(0.26, 0.85, 0.5), m_armor, Vector3(0, -0.55, 1.3), Vector3.ZERO, false)
		ProceduralBuilder.add_box(gun_g, Vector3(0.38, 0.55, 1.0), m_joint, Vector3(0, -0.1, -0.4), Vector3.ZERO, false)
		var muz := Node3D.new()
		muz.position = Vector3(0, 0.12, 4.4)
		gun_g.add_child(muz)
		if sx < 0.0:
			_muzzle_l = muz
		else:
			_muzzle_r = muz
	else:
		# Cakar kerucut tajam (kelas C / boss / lengan kiri kelas B)
		ProceduralBuilder.add_cyl(arm, 0.05, 0.52, 1.45, m_armor, Vector3(0, -4.4, 0.25), Vector3(165, 0, 0), 6, false)
	return arm


func step_ai(
	dt: float,
	player_pos: Vector3,
	nav: NavGrid2D,
	walkable_fn: Callable,
	resolve_fn: Callable,
	los_fn: Callable = Callable(),
	activate_fn: Callable = Callable(),
	extra_target: Variant = null
) -> void:
	if state == "dead":
		_dead_t += dt
		rotation.x = lerpf(rotation.x, -PI * 0.48, clampf(dt * 8.0, 0.0, 1.0))
		position.y = lerpf(position.y, -0.8, clampf(dt * 6.0, 0.0, 1.0))
		if _dead_t > 2.2:
			queue_free()
		return

	if _flash_t > 0.0:
		_flash_t = maxf(0.0, _flash_t - dt)
		for m in _armor_mats:
			m.emission_enabled = _flash_t > 0.0
			m.emission = Pal.WHITE
			m.emission_energy_multiplier = 0.85

	if _recoil_l > 0.0:
		_recoil_l = maxf(0.0, _recoil_l - dt * 4.0)
	if _recoil_r > 0.0:
		_recoil_r = maxf(0.0, _recoil_r - dt * 4.0)

	if state == "idle":
		if activate_fn.is_valid() and bool(activate_fn.call(self)):
			state = "chasing"
		else:
			_moving = false
			_animate_rig(dt)
			return

	var step60 := dt * 60.0
	var target_pos := player_pos
	var attacking_non_player := ""
	if extra_target is Dictionary:
		target_pos = extra_target["pos"]
		attacking_non_player = str(extra_target.get("kind", ""))

	var to_t := Vector2(target_pos.x - global_position.x, target_pos.z - global_position.z)
	var dist := to_t.length()

	var aim_pt := Vector2(target_pos.x, target_pos.z)
	var direct := true
	if nav != null:
		direct = nav.grid_los(global_position.x, global_position.z, target_pos.x, target_pos.z)
		if not direct:
			_repath_t -= dt
			if _nav_path.is_empty() or _repath_t <= 0.0:
				_nav_path = nav.find_path(global_position.x, global_position.z, target_pos.x, target_pos.z)
				_nav_idx = 0
				_repath_t = float(Config.section("robot").get("repathSec", 0.5)) * randf_range(0.75, 1.25)
			if _nav_idx < _nav_path.size():
				aim_pt = _nav_path[_nav_idx]
				if Vector2(aim_pt.x - global_position.x, aim_pt.y - global_position.z).length() < nav.cell * 0.75:
					_nav_idx += 1

	var shot_ok := direct
	if ranged and los_fn.is_valid():
		shot_ok = bool(los_fn.call(global_position.x, global_position.z, target_pos.x, target_pos.z))

	var rc: Dictionary = Config.section("robot")
	var stop_d := (fire_range * 0.92) if (ranged and shot_ok) else (10.0 if not attacking_non_player.is_empty() else (float(GameState.player.get("radius", 5.0)) + float(rc.get("stopRange", 3.0)) * reach_mul))
	_moving = (not shot_ok) or dist > stop_d

	var old_x := global_position.x
	var old_z := global_position.z
	if _moving:
		var desired := atan2(aim_pt.x - global_position.x, aim_pt.y - global_position.z)
		nav_head = NavGrid2D.turn_toward(nav_head, desired, float(rc.get("turnRadPerSec", 9.0)), dt)
		global_position.x += sin(nav_head) * speed * step60
		global_position.z += cos(nav_head) * speed * step60
		rotation.y = nav_head
		if walkable_fn.is_valid():
			global_position = NavGrid2D.slide_walk(walkable_fn, global_position, old_x, old_z, 3.5)
		if resolve_fn.is_valid():
			var res: Variant = resolve_fn.call(global_position, 3.5, global_position.y)
			if res is Vector3:
				global_position = res
	else:
		if dist > 0.1:
			nav_head = atan2(to_t.x, to_t.y)
			rotation.y = nav_head

	# Serangan
	if ranged:
		if _fire_cd > 0.0:
			_fire_cd -= dt
		if shot_ok and dist <= fire_range * 1.05 and _fire_cd <= 0.0:
			_fire_cd = fire_delay * randf_range(0.85, 1.15)
			var use_left := (kind == "A" and _fire_alt and _muzzle_l != null)
			_fire_alt = not _fire_alt
			if use_left:
				_recoil_l = 1.0
			else:
				_recoil_r = 1.0
			var muz := _muzzle_l if use_left else _muzzle_r
			var orig := muz.global_position if muz else (global_position + Vector3(0, 7.0 * scl, 0))
			var fdir := (Vector3(target_pos.x, orig.y, target_pos.z) - orig).normalized()
			var monas_d := float(Config.section("survival").get("monasClawDamage", 20.0)) if attacking_non_player == "monas" else 0.0
			robot_shoot_requested.emit(orig, fdir, bullet_speed, attack, monas_d, attacking_non_player == "structure")
			AudioManager.play_sfx("robot_shot", 0.36, randf_range(0.95, 1.08))
	else:
		if _attack_cd > 0.0:
			_attack_cd -= dt
		if _wind_t > 0.0:
			_wind_t -= dt
			if _wind_t <= 0.0:
				var max_claw := (float(GameState.player.get("radius", 5.0)) + float(rc.get("clawRange", 3.5)) * reach_mul + float(rc.get("clawStrikeGrace", 2.0)))
				if _wind_target == "monas":
					monas_gnawed.emit(self, float(Config.section("survival").get("monasClawDamage", 20.0)))
					AudioManager.play_sfx("robot_bite", 0.4)
				elif _wind_target == "structure":
					structure_clawed.emit(self, attack)
					AudioManager.play_sfx("robot_bite", 0.4)
				elif dist <= max_claw:
					var pdir := to_t.normalized() if dist > 0.01 else Vector2(0, 1)
					player_clawed.emit(self, attack, pdir)
					AudioManager.play_sfx("robot_bite", 0.55)
		elif not _moving and _attack_cd <= 0.0:
			_attack_cd = float(rc.get("clawCooldownSec", 1.0))
			_wind_dur = float(rc.get("clawWindupSec", 0.5))
			_wind_t = _wind_dur
			_wind_target = attacking_non_player if not attacking_non_player.is_empty() else "player"
			_claw_side = -_claw_side

	_animate_rig(dt)


func _animate_rig(dt: float) -> void:
	if _moving:
		_gait += dt * 10.5 * speed
		var sw := sin(_gait) * 0.65
		_leg_l.rotation.x = sw
		_leg_r.rotation.x = -sw
		_knee_l.rotation.x = maxf(0.0, -sw * 0.85)
		_knee_r.rotation.x = maxf(0.0, sw * 0.85)
		_ankle_l.rotation.x = -sw * 0.35
		_ankle_r.rotation.x = sw * 0.35
		_inner.position.y = absf(sin(_gait)) * 0.42
	else:
		var k := clampf(dt * 10.0, 0.0, 1.0)
		_leg_l.rotation.x = lerpf(_leg_l.rotation.x, 0.0, k)
		_leg_r.rotation.x = lerpf(_leg_r.rotation.x, 0.0, k)
		_knee_l.rotation.x = lerpf(_knee_l.rotation.x, 0.0, k)
		_knee_r.rotation.x = lerpf(_knee_r.rotation.x, 0.0, k)
		_ankle_l.rotation.x = lerpf(_ankle_l.rotation.x, 0.0, k)
		_ankle_r.rotation.x = lerpf(_ankle_r.rotation.x, 0.0, k)
		_inner.position.y = lerpf(_inner.position.y, 0.0, k)

	if ranged:
		var aim_pitch := -1.35 if not _moving else -0.85
		_arm_r.rotation.x = aim_pitch - _recoil_r * 0.38
		if kind == "A":
			_arm_l.rotation.x = aim_pitch - _recoil_l * 0.38
		else:
			_arm_l.rotation.x = sin(_gait) * 0.35 if _moving else -0.25
	elif _wind_t > 0.0:
		var k := _wind_t / maxf(0.05, _wind_dur)
		var slash := -1.75 * sin(k * PI)
		_arm_l.rotation.x = slash
		_arm_r.rotation.x = slash
	else:
		var arm_sw := -sin(_gait) * 0.45 if _moving else -0.22
		_arm_l.rotation.x = arm_sw
		_arm_r.rotation.x = -arm_sw if _moving else -0.22


func take_damage(dmg: float, by_player: bool = true) -> bool:
	if state == "dead":
		return false
	hp -= dmg
	_flash_t = 0.08
	if state == "idle":
		state = "chasing"
	if hp <= 0.0:
		hp = 0.0
		state = "dead"
		_dead_t = 0.0
		if by_player:
			GameState.stats["kills"] = int(GameState.stats["kills"]) + 1
			AchievementManager.record_robot_kill()
		robot_killed.emit(self, by_player)
		return true
	return false
