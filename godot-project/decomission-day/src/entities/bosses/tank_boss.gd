class_name TankBoss
extends Node3D

## Boss Tank Stage 4: hull + track + turret berputar, meriam utama, senapan mesin,
## mortir pelacak, serbuan charge, kejutan listrik jarak dekat, dan turret terlepas saat kalah.

signal boss_hp_changed(hp: float, max_hp: float, subtitle: String)
signal boss_defeated(boss: TankBoss)
signal player_hit_requested(dmg: float, push_dir: Vector2, is_electric: bool)

var hp := 7000.0
var max_hp := 7000.0
var active := false
var dead := false
var enraged := false

var _hull: Node3D
var _turret: Node3D
var _muzzle: Node3D
var _telegraph_ring: MeshInstance3D
var _telegraph_line: MeshInstance3D

var _state := "idle" # idle | cooldown | mg | cannon | mortar | charge
var _state_t := 0.0
var _gap_t := 1.5
var _burst_left := 0
var _burst_cd := 0.0
var _charge_dir := Vector2.ZERO
var _shock_tick := 0.0
var _mortars: Array[Dictionary] = []

var arena_bounds := Rect2()
var wreck_avoid := Vector3.ZERO # Vector3(x, z, r)


func _ready() -> void:
	_build_mesh()
	reset_boss()


func _build_mesh() -> void:
	var m_hull := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.6, 0.45)
	var m_dark := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.3)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.5, 0.5)
	var m_eye := Pal.mat(Pal.EYE_RED, Pal.EYE_RED, 1.2, 0.2, 0.0, false, 1.0, true)

	_hull = Node3D.new(); add_child(_hull)
	ProceduralBuilder.add_box(_hull, Vector3(32, 9, 44), m_hull, Vector3(0, 6.5, 0))
	ProceduralBuilder.add_box(_hull, Vector3(7, 7, 46), m_dark, Vector3(-16.5, 3.5, 0))
	ProceduralBuilder.add_box(_hull, Vector3(7, 7, 46), m_dark, Vector3(16.5, 3.5, 0))
	ProceduralBuilder.add_box(_hull, Vector3(18, 2.2, 4), m_eye, Vector3(0, 8.2, 22), Vector3.ZERO, false)

	_turret = Node3D.new(); _turret.position = Vector3(0, 12.5, 0); add_child(_turret)
	ProceduralBuilder.add_box(_turret, Vector3(20, 6.5, 22), m_steel, Vector3(0, 1.5, 0))
	ProceduralBuilder.add_cyl(_turret, 2.0, 2.4, 24.0, m_dark, Vector3(0, 2.0, 18.0), Vector3(90, 0, 0), 10)
	_muzzle = Node3D.new(); _muzzle.position = Vector3(0, 2.0, 30.0); _turret.add_child(_muzzle)

	_telegraph_ring = ProceduralBuilder.add_ring(self, 0.82, 1.0, Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.1, 0.2, 0.0, true, 0.65, true), Vector3(0, 0.5, 0), 28)
	_telegraph_ring.visible = false
	_telegraph_line = ProceduralBuilder.add_box(self, Vector3(6.0, 0.4, 160.0), Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.0, 0.2, 0.0, true, 0.45, true), Vector3(0, 0.5, 80.0), Vector3.ZERO, false)
	_telegraph_line.visible = false


func reset_boss() -> void:
	var c := _cfg()
	max_hp = float(c.get("hp", 7000.0))
	hp = max_hp
	active = false
	dead = false
	enraged = false
	_state = "idle"
	_state_t = 0.0
	_gap_t = float(c.get("engageDelaySec", 2.0))
	_turret.position = Vector3(0, 12.5, 0)
	_turret.rotation = Vector3.ZERO
	_telegraph_ring.visible = false
	_telegraph_line.visible = false
	for m in _mortars:
		(m["mesh"] as Node).queue_free()
		(m["ring"] as Node).queue_free()
	_mortars.clear()


func activate_boss() -> void:
	active = true
	_state = "cooldown"
	_gap_t = float(_cfg().get("engageDelaySec", 2.0))
	boss_hp_changed.emit(hp, max_hp, "HEAVY TANK")


func _cfg() -> Dictionary:
	return Config.campaign().get("bosses", {}).get("tank", {})


func step(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	if dead:
		return
	_update_mortars(dt, player_pos, fx)
	if not active:
		return

	var c := _cfg()
	var to_p := Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z)
	var dist := to_p.length()
	var target_yaw := atan2(to_p.x, to_p.y) if dist > 0.1 else 0.0

	# Kejutan listrik jarak dekat
	var shock_r := float(c.get("shockRadiusMeters", 5.0)) * Config.CAMP_M + float(c.get("bodyRadius", 22.0))
	if dist <= shock_r:
		_shock_tick -= dt
		if _shock_tick <= 0.0:
			_shock_tick = 0.35
			player_hit_requested.emit(float(c.get("shockDps", 20.0)) * 0.35, to_p.normalized(), true)

	enraged = hp <= max_hp * float(c.get("enrageHpFrac", 0.5))

	match _state:
		"cooldown":
			_turret.rotation.y = lerp_angle(_turret.rotation.y, target_yaw - rotation.y, clampf(dt * 4.5, 0.0, 1.0))
			_gap_t -= dt
			if _gap_t <= 0.0:
				_pick_next_attack(player_pos, target_yaw, c)
		"mg":
			_turret.rotation.y = lerp_angle(_turret.rotation.y, target_yaw - rotation.y, clampf(dt * 3.5, 0.0, 1.0))
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("mgIntervalSec", 0.1))
				_burst_left -= 1
				var orig := _muzzle.global_position
				var dir := (Vector3(player_pos.x, orig.y, player_pos.z) - orig).normalized().rotated(Vector3.UP, randf_range(-0.18, 0.18))
				fx.spawn_enemy_bullet(orig, dir, float(c.get("mgBulletSpeed", 4.0)), float(c.get("mgDamage", 5.0)))
				AudioManager.play_sfx("tank_mg", 0.45)
			if _burst_left <= 0:
				_finish_attack(c)
		"cannon":
			_state_t -= dt
			_telegraph_line.visible = true
			if _state_t <= 0.0:
				_telegraph_line.visible = false
				var orig := _muzzle.global_position
				var dir := Vector3(sin(rotation.y + _turret.rotation.y), 0.0, cos(rotation.y + _turret.rotation.y)).normalized()
				fx.spawn_enemy_bullet(orig, dir, float(c.get("cannonShellSpeed", 7.0)), float(c.get("cannonDamage", 50.0)), 0.0, false, true)
				AudioManager.play_sfx("tank_mortar", 0.75)
				_finish_attack(c)
		"mortar":
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("mortarBurstGapSec", 0.5))
				_burst_left -= 1
				_launch_mortar(player_pos, c)
			if _burst_left <= 0:
				_finish_attack(c)
		"charge":
			_state_t -= dt
			var spd := 125.0 * float(c.get("chargeSpeedMul", 1.2))
			global_position.x += _charge_dir.x * spd * dt
			global_position.z += _charge_dir.y * spd * dt
			if arena_bounds.size.x > 0.0:
				global_position.x = clampf(global_position.x, arena_bounds.position.x + 28.0, arena_bounds.end.x - 28.0)
				global_position.z = clampf(global_position.z, arena_bounds.position.y + 28.0, arena_bounds.end.y - 28.0)
			if dist < float(c.get("bodyRadius", 22.0)) + 7.0:
				player_hit_requested.emit(float(c.get("cannonDamage", 50.0)) * 0.65, to_p.normalized(), false)
				_finish_attack(c)
			elif _state_t <= 0.0:
				_finish_attack(c)


func _pick_next_attack(player_pos: Vector3, target_yaw: float, c: Dictionary) -> void:
	var roll := randi() % 4
	if roll == 0:
		_state = "mg"
		_burst_left = int(c.get("mgBurst", 15))
		_burst_cd = 0.0
	elif roll == 1:
		_state = "cannon"
		_state_t = float(c.get("aimSec", 0.5))
		_turret.rotation.y = target_yaw - rotation.y
	elif roll == 2:
		_state = "mortar"
		_burst_left = int(c.get("mortarBurst", 5))
		_burst_cd = 0.0
	else:
		_state = "charge"
		_state_t = 1.25
		var to_p := Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z)
		_charge_dir = to_p.normalized() if to_p.length_squared() > 0.1 else Vector2(0, 1)
		rotation.y = atan2(_charge_dir.x, _charge_dir.y)
		_turret.rotation.y = 0.0


func _finish_attack(c: Dictionary) -> void:
	_state = "cooldown"
	_gap_t = float(c.get("enrageGapSec", 0.8)) if enraged else float(c.get("gapSec", 1.5))


func _launch_mortar(player_pos: Vector3, c: Dictionary) -> void:
	AudioManager.play_sfx("tank_mortar", 0.6)
	var shell := ProceduralBuilder.add_sphere(get_parent(), 2.2, Pal.mat(Pal.HAZARD, Pal.AMBER, 1.2), global_position + Vector3(0, 14, 0), Vector3(1, 1.6, 1), 8, 5, false)
	var ring := ProceduralBuilder.add_ring(get_parent(), 16.0, 20.0, Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.0, 0.3, 0.0, true, 0.65, true), Vector3(player_pos.x, 0.4, player_pos.z), 24)
	_mortars.append({
		"mesh": shell,
		"ring": ring,
		"start": global_position + Vector3(0, 14, 0),
		"target": Vector3(player_pos.x, 0.4, player_pos.z),
		"t": 0.0,
		"dur": 1.6,
		"lock_sec": float(c.get("mortarLockSec", 0.5)),
		"dmg": float(c.get("mortarDamage", 50.0)),
	})


func _update_mortars(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	for i in range(_mortars.size() - 1, -1, -1):
		var m: Dictionary = _mortars[i]
		m["t"] = float(m["t"]) + dt
		var dur := float(m["dur"])
		var rem := dur - float(m["t"])
		if rem > float(m["lock_sec"]):
			m["target"] = Vector3(player_pos.x, 0.4, player_pos.z)
		var tgt: Vector3 = m["target"]
		var ring: MeshInstance3D = m["ring"]
		ring.global_position = tgt
		var k := clampf(float(m["t"]) / dur, 0.0, 1.0)
		var st: Vector3 = m["start"]
		var pos := st.lerp(tgt, k)
		pos.y += sin(k * PI) * 84.0
		var sh: MeshInstance3D = m["mesh"]
		sh.global_position = pos
		if k >= 1.0:
			fx.spawn_explosion(tgt, 22.0, 0.0, Color.html("#ff5518"), true, "tank_blast")
			var d := Vector2(player_pos.x - tgt.x, player_pos.z - tgt.z).length()
			if d <= 22.0:
				var pdir := Vector2(player_pos.x - tgt.x, player_pos.z - tgt.z).normalized()
				player_hit_requested.emit(float(m["dmg"]), pdir, false)
			sh.queue_free()
			ring.queue_free()
			_mortars.remove_at(i)


func take_damage(dmg: float) -> bool:
	if not active or dead:
		return false
	hp = maxf(0.0, hp - dmg)
	boss_hp_changed.emit(hp, max_hp, "HEAVY TANK" + (" [ENRAGED]" if enraged else ""))
	if hp <= 0.0:
		dead = true
		active = false
		_telegraph_ring.visible = false
		_telegraph_line.visible = false
		_turret.position = Vector3(14, 4.5, -10)
		_turret.rotation = Vector3(0.4, 0.7, 0.5)
		AudioManager.play_sfx("tank_explode", 0.95)
		AchievementManager.record_boss("tank")
		boss_defeated.emit(self)
		return true
	return false
