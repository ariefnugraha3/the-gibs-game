class_name MahapatihBoss
extends Node3D

## Boss Final Stage 12 — M-0 MAHAPATIH (4 Fase: Siege 6x6 Panser Anoa ->
## Personal Combat Dual Blade -> Hardline Electric 4 Anchor + Rotating Blue Sweep ->
## Exposed Core -> Staged 8-Part Destruction).

signal boss_hp_changed(hp: float, max_hp: float, subtitle: String)
signal phase_changed(new_phase: String)
signal boss_wrecked(boss: MahapatihBoss)
signal player_hit_requested(dmg: float, push_dir: Vector2, is_electric: bool)

var hp := 15000.0
var max_hp := 15000.0
var phase := "dormant" # dormant | siege | transition | combat | hardline | core | dying | dead
var _next_phase := "combat"
var _trans_t := 0.0
var _state := "gap"
var _timer := 1.5
var _burst_left := 0
var _burst_cd := 0.0

var _siege_shell: Node3D
var _personal_rig: Node3D
var _blade_l: Node3D
var _blade_r: Node3D
var _core_shutter: Node3D
var _core_mat: StandardMaterial3D
var _sweep_beam: MeshInstance3D
var _sweep_ang := 0.0
var _anchors: Array[Dictionary] = []
var _mortars: Array[Dictionary] = []

var _shutter_open := true
var _shutter_t := 3.0
var _death_t := 0.0
var _charge_dir := Vector2.ZERO
var _orbit_sign := 1.0
var _orbit_t := 0.0

var arena_bounds := Rect2()
var avoid_center := Vector3.ZERO # Vector3(x, z, r) untuk Monas


func _ready() -> void:
	_build_mesh()
	reset_boss(Vector3(200, 0, 0))


func _build_mesh() -> void:
	var m_gun := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.65, 0.4)
	var m_ink := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.3)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.45, 0.55)
	var m_ember := Pal.mat(Pal.AMBER, Pal.AMBER, 0.75)
	_core_mat = Pal.unique_mat(Pal.EYE_RED, Pal.EYE_RED, 1.3, 0.2, 0.0, false, 1.0, true)

	# Fase 1: Panser 6x6 Anoa Siege Chassis
	_siege_shell = Node3D.new(); add_child(_siege_shell)
	ProceduralBuilder.add_box(_siege_shell, Vector3(44, 18, 76), m_gun, Vector3(0, 19, 0))
	for z_ax in [-25.0, -2.0, 27.0]:
		for sx in [-20.5, 20.5]:
			ProceduralBuilder.add_cyl(_siege_shell, 10, 10, 7.5, Pal.mat(Pal.RUBBER), Vector3(sx, 10, z_ax), Vector3(0, 0, 90), 12)

	# Rangka Personal Combat
	_personal_rig = Node3D.new(); add_child(_personal_rig)
	ProceduralBuilder.add_box(_personal_rig, Vector3(24, 28, 18), m_ink, Vector3(0, 24, 0))
	ProceduralBuilder.add_box(_personal_rig, Vector3(14, 11, 14), m_steel, Vector3(0, 42, 0))
	ProceduralBuilder.add_box(_personal_rig, Vector3(10, 2.5, 3), _core_mat, Vector3(0, 42, 7.2), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_personal_rig, Vector3(9, 20, 9), m_gun, Vector3(-8, 10, 0))
	ProceduralBuilder.add_box(_personal_rig, Vector3(9, 20, 9), m_gun, Vector3(8, 10, 0))
	_core_shutter = ProceduralBuilder.add_box(_personal_rig, Vector3(14, 14, 4), m_steel, Vector3(0, 26, 10))
	ProceduralBuilder.add_sphere(_personal_rig, 5.8, _core_mat, Vector3(0, 26, 7), Vector3.ONE, 10, 6, false)

	_blade_l = Node3D.new(); _blade_l.position = Vector3(-16, 30, 4); _personal_rig.add_child(_blade_l)
	ProceduralBuilder.add_box(_blade_l, Vector3(2.8, 30, 2.0), m_ember, Vector3(0, -14, 0), Vector3.ZERO, false)
	_blade_r = Node3D.new(); _blade_r.position = Vector3(16, 30, 4); _personal_rig.add_child(_blade_r)
	ProceduralBuilder.add_box(_blade_r, Vector3(2.8, 30, 2.0), m_ember, Vector3(0, -14, 0), Vector3.ZERO, false)

	_sweep_beam = ProceduralBuilder.add_box(self, Vector3(12, 3, 520), Pal.unique_mat(Pal.PLASMA_BLUE, Pal.PLASMA_BLUE, 1.8, 0.2, 0.0, true, 0.78, true), Vector3(0, 10, 260), Vector3.ZERO, false)
	_sweep_beam.visible = false


func setup_anchors(anchor_positions: Array[Vector3]) -> void:
	for a in _anchors:
		(a["node"] as Node).queue_free()
	_anchors.clear()
	for pos in anchor_positions:
		var root := Node3D.new()
		root.position = pos
		get_parent().add_child(root)
		var mat := Pal.unique_mat(Pal.PLASMA_BLUE, Pal.PLASMA_BLUE, 1.0, 0.3, 0.1)
		ProceduralBuilder.add_cyl(root, 7.0, 9.0, 20.0, mat, Vector3(0, 10, 0), Vector3.ZERO, 10)
		root.visible = false
		_anchors.append({"node": root, "mat": mat, "hp": 1000.0, "alive": false})


func _cfg() -> Dictionary:
	return Config.campaign().get("bosses", {}).get("mahapatih", {})


func reset_boss(start_pos: Vector3) -> void:
	var c := _cfg()
	global_position = start_pos
	max_hp = float(c.get("siegeHp", 15000.0))
	hp = max_hp
	phase = "dormant"
	_state = "gap"
	_timer = 1.5
	_siege_shell.visible = true
	_siege_shell.position = Vector3.ZERO
	_personal_rig.visible = false
	_personal_rig.position = Vector3.ZERO
	_personal_rig.rotation = Vector3.ZERO
	_sweep_beam.visible = false
	visible = false
	for a in _anchors:
		(a["node"] as Node3D).visible = false
		a["alive"] = false
	for m in _mortars:
		(m["mesh"] as Node).queue_free()
		(m["ring"] as Node).queue_free()
	_mortars.clear()


func activate_boss() -> void:
	visible = true
	phase = "siege"
	var c := _cfg()
	max_hp = float(c.get("siegeHp", 15000.0))
	hp = max_hp
	_siege_shell.visible = true
	_personal_rig.visible = false
	boss_hp_changed.emit(hp, max_hp, "M-0 MAHAPATIH — SIEGE CHASSIS")


func step(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	_update_mortars(dt, player_pos, fx)
	var c := _cfg()

	if phase == "transition":
		_trans_t -= dt
		if _trans_t <= 0.0:
			_finish_transition(c)
		return

	if phase == "dying":
		_death_t += dt
		_personal_rig.position.y = lerpf(_personal_rig.position.y, -10.0, clampf(dt * 1.4, 0.0, 1.0))
		_personal_rig.rotation.x = lerpf(_personal_rig.rotation.x, 1.25, clampf(dt * 1.6, 0.0, 1.0))
		if _death_t >= float(c.get("deathSec", 8.0)):
			phase = "dead"
			AchievementManager.record_boss("mahapatih")
			boss_wrecked.emit(self)
		return

	if phase in ["dormant", "dead"]:
		return

	var to_p := Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z)
	var dist := to_p.length()

	if phase == "hardline":
		var hc: Dictionary = c.get("hardline", {})
		_sweep_ang = wrapf(_sweep_ang + float(hc.get("sweepRadPerSec", 0.85)) * dt, -PI, PI)
		_sweep_beam.visible = true
		_sweep_beam.rotation.y = _sweep_ang
		# Uji tabrakan sinar sapuan biru
		var beam_dir := Vector2(sin(_sweep_ang), cos(_sweep_ang))
		var proj := to_p.dot(beam_dir)
		if proj > 0.0 and proj < 500.0:
			var perp := absf(to_p.x * (-beam_dir.y) + to_p.y * beam_dir.x)
			if perp < float(hc.get("sweepWidth", 14.0)):
				_burst_cd -= dt
				if _burst_cd <= 0.0:
					_burst_cd = float(hc.get("sweepHitCooldownSec", 0.8))
					player_hit_requested.emit(float(hc.get("sweepDamage", 24.0)), to_p.normalized(), true)
		_timer -= dt
		if _timer <= 0.0:
			_timer = float(hc.get("barrageGapSec", 2.0))
			_launch_mortar(player_pos, c)
		return

	_sweep_beam.visible = false

	if phase == "core":
		var cc: Dictionary = c.get("core", {})
		_shutter_t -= dt
		if _shutter_t <= 0.0:
			_shutter_open = not _shutter_open
			_shutter_t = float(cc.get("shutterOpenSec" if _shutter_open else "shutterClosedSec", 2.5))
		_core_shutter.position.x = lerpf(_core_shutter.position.x, 14.0 if _shutter_open else 0.0, clampf(dt * 8.0, 0.0, 1.0))

	# Locomotion agile + arena clamp
	_orbit_t += dt
	if _orbit_t > float(c.get("motion", {}).get("orbitPeriodSec", 3.6)):
		_orbit_t = 0.0
		_orbit_sign = -_orbit_sign

	if _state == "gap":
		rotation.y = lerp_angle(rotation.y, atan2(to_p.x, to_p.y), clampf(dt * 4.5, 0.0, 1.0))
		var spd := float(c.get("moveSpeed", 56.0)) if phase == "siege" else float(c.get("combat", {}).get("speed", 78.0))
		var move_dir := to_p.normalized() if dist > 110.0 else Vector2(-to_p.y, to_p.x).normalized() * _orbit_sign
		global_position.x += move_dir.x * spd * dt
		global_position.z += move_dir.y * spd * dt
		_clamp_arena()
		_timer -= dt
		if _timer <= 0.0:
			_choose_attack(dist, to_p, c)
	elif _state == "charge_warn" or _state == "lunge_warn":
		_timer -= dt
		if _timer <= 0.0:
			_state = "charge_go"
			_timer = 0.85
	elif _state == "charge_go":
		_timer -= dt
		global_position.x += _charge_dir.x * 260.0 * dt
		global_position.z += _charge_dir.y * 260.0 * dt
		_clamp_arena()
		if dist < 44.0:
			player_hit_requested.emit(float(c.get("charge", {}).get("damage", 60.0)), _charge_dir, false)
			_end_atk(c)
		elif _timer <= 0.0:
			_end_atk(c)
	elif _state == "blade":
		_timer -= dt
		_blade_l.rotation.x = -1.6 * sin(_timer * 12.0)
		_blade_r.rotation.x = 1.6 * sin(_timer * 12.0)
		if _timer <= 0.0:
			_blade_l.rotation.x = 0.0
			_blade_r.rotation.x = 0.0
			if dist <= float(c.get("blade", {}).get("radius", 35.0)) + 16.0:
				player_hit_requested.emit(float(c.get("blade", {}).get("damage", 55.0)), to_p.normalized(), false)
			_end_atk(c)
	elif _state == "turret":
		_burst_cd -= dt
		if _burst_cd <= 0.0 and _burst_left > 0:
			_burst_cd = float(c.get("turret", {}).get("intervalSec", 0.1))
			_burst_left -= 1
			var orig := global_position + Vector3(0, 26, 0)
			fx.spawn_enemy_bullet(orig, (Vector3(player_pos.x, orig.y, player_pos.z) - orig).normalized(), 2.0, float(c.get("turret", {}).get("damage", 10.0)))
			AudioManager.play_sfx("tank_mg", 0.4)
		if _burst_left <= 0:
			_end_atk(c)
	elif _state == "mortar":
		_burst_cd -= dt
		if _burst_cd <= 0.0 and _burst_left > 0:
			_burst_cd = float(c.get("artillery", {}).get("burstGapSec", 0.5))
			_burst_left -= 1
			_launch_mortar(player_pos, c)
		if _burst_left <= 0:
			_end_atk(c)


func _choose_attack(dist: float, to_p: Vector2, c: Dictionary) -> void:
	if phase == "siege":
		var r := randi() % 3
		if r == 0:
			_state = "mortar"
			_burst_left = int(c.get("artillery", {}).get("burst", 3))
			_burst_cd = 0.0
		elif r == 1:
			_state = "turret"
			_burst_left = int(c.get("turret", {}).get("burst", 14))
			_burst_cd = 0.0
		else:
			_state = "charge_warn"
			_timer = float(c.get("charge", {}).get("telegraphSec", 0.9))
			_charge_dir = to_p.normalized()
	else:
		if dist < 56.0:
			_state = "blade"
			_timer = 0.55
		elif randf() < 0.5:
			_state = "lunge_warn"
			_timer = float(c.get("lunge", {}).get("telegraphSec", 0.75))
			_charge_dir = to_p.normalized()
		else:
			_state = "turret"
			_burst_left = 10
			_burst_cd = 0.0


func _end_atk(c: Dictionary) -> void:
	_state = "gap"
	var gap := float(c.get("attackGapSec", 1.7))
	if phase == "core":
		gap *= float(c.get("enrageGapMul", 0.78))
	_timer = gap


func _clamp_arena() -> void:
	if arena_bounds.size.x > 0.0:
		global_position.x = clampf(global_position.x, arena_bounds.position.x + 48.0, arena_bounds.end.x - 48.0)
		global_position.z = clampf(global_position.z, arena_bounds.position.y + 48.0, arena_bounds.end.y - 48.0)
	if avoid_center.z > 0.0:
		var d := Vector2(global_position.x - avoid_center.x, global_position.z - avoid_center.y)
		if d.length() < avoid_center.z and d.length_squared() > 0.01:
			var n := d.normalized() * avoid_center.z
			global_position.x = avoid_center.x + n.x
			global_position.z = avoid_center.y + n.y


func _launch_mortar(player_pos: Vector3, c: Dictionary) -> void:
	AudioManager.play_sfx("tank_mortar", 0.55)
	var shell := ProceduralBuilder.add_sphere(get_parent(), 2.4, Pal.mat(Pal.HAZARD, Pal.AMBER, 1.3), global_position + Vector3(0, 24, 0), Vector3(1, 1.6, 1), 8, 5, false)
	var ring := ProceduralBuilder.add_ring(get_parent(), 20.0, 24.0, Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.0, 0.3, 0.0, true, 0.65, true), Vector3(player_pos.x, 0.5, player_pos.z), 24)
	_mortars.append({
		"mesh": shell, "ring": ring, "start": global_position + Vector3(0, 24, 0),
		"target": Vector3(player_pos.x, 0.5, player_pos.z), "t": 0.0, "dur": 1.65,
		"lock_sec": float(c.get("artillery", {}).get("lockSec", 0.5)),
		"dmg": float(c.get("artillery", {}).get("damage", 55.0)),
		"rad": float(c.get("artillery", {}).get("radius", 24.0)),
	})


func _update_mortars(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	for i in range(_mortars.size() - 1, -1, -1):
		var m: Dictionary = _mortars[i]
		m["t"] = float(m["t"]) + dt
		var dur := float(m["dur"])
		if dur - float(m["t"]) > float(m["lock_sec"]):
			m["target"] = Vector3(player_pos.x, 0.5, player_pos.z)
		var tgt: Vector3 = m["target"]
		(m["ring"] as Node3D).global_position = tgt
		var k := clampf(float(m["t"]) / dur, 0.0, 1.0)
		var pos := (m["start"] as Vector3).lerp(tgt, k)
		pos.y += sin(k * PI) * 84.0
		(m["mesh"] as Node3D).global_position = pos
		if k >= 1.0:
			var rad := float(m["rad"])
			fx.spawn_explosion(tgt, rad, 0.0, Color.html("#ff5518"), true, "tank_blast")
			var to_p := Vector2(player_pos.x - tgt.x, player_pos.z - tgt.z)
			if to_p.length() <= rad:
				player_hit_requested.emit(float(m["dmg"]), to_p.normalized(), false)
			(m["mesh"] as Node).queue_free()
			(m["ring"] as Node).queue_free()
			_mortars.remove_at(i)


func bullet_hit_test(p0: Vector3, p1: Vector3, dmg: float) -> bool:
	if phase in ["dormant", "transition", "dying", "dead"]:
		return false

	if phase == "hardline":
		for a in _anchors:
			if not bool(a["alive"]):
				continue
			var n: Node3D = a["node"]
			if NavGrid2D.seg_point_dist_sq(n.global_position.x, n.global_position.z, p0.x, p0.z, p1.x, p1.z) <= 225.0:
				a["hp"] = float(a["hp"]) - dmg
				if float(a["hp"]) <= 0.0:
					a["alive"] = false
					n.visible = false
					AudioManager.play_sfx("explode", 0.85)
				_check_anchors()
				return true

	var d2 := NavGrid2D.seg_point_dist_sq(global_position.x, global_position.z, p0.x, p0.z, p1.x, p1.z)
	if d2 > 1024.0:
		return false

	if phase == "hardline":
		return true # Perisai kabel kebal sampai semua 4 anchor hancur
	if phase == "core" and not _shutter_open:
		return true # Shutter tertutup memblok peluru

	var c := _cfg()
	hp = maxf(0.0, hp - dmg)
	if hp <= 0.0:
		if phase == "siege":
			_begin_transition("combat", 2.0)
		elif phase == "combat":
			_begin_transition("hardline", 2.0)
		elif phase == "core":
			phase = "dying"
			_death_t = 0.0
			AudioManager.play_sfx("tank_explode", 0.95)
	boss_hp_changed.emit(hp, max_hp, _subtitle())
	return true


func _begin_transition(target: String, dur: float) -> void:
	phase = "transition"
	_next_phase = target
	_trans_t = dur
	_state = "gap"
	AudioManager.play_sfx("tank_blast", 0.85)
	phase_changed.emit("transition")


func _finish_transition(c: Dictionary) -> void:
	phase = _next_phase
	if phase == "combat":
		_siege_shell.visible = false
		_personal_rig.visible = true
		max_hp = float(c.get("combatHp", 15000.0))
		hp = max_hp
	elif phase == "hardline":
		var ahp := float(c.get("hardline", {}).get("anchorHp", 1000.0))
		for a in _anchors:
			a["hp"] = ahp
			a["alive"] = true
			(a["node"] as Node3D).visible = true
		_timer = 1.5
	elif phase == "core":
		_sweep_beam.visible = false
		max_hp = float(c.get("coreHp", 15000.0))
		hp = max_hp
		_shutter_open = true
		_shutter_t = float(c.get("core", {}).get("shutterOpenSec", 3.0))
	phase_changed.emit(phase)
	boss_hp_changed.emit(hp, max_hp, _subtitle())


func _check_anchors() -> void:
	for a in _anchors:
		if bool(a["alive"]):
			return
	_sweep_beam.visible = false
	_begin_transition("core", 1.8)


func _subtitle() -> String:
	match phase:
		"siege": return "M-0 MAHAPATIH — SIEGE CHASSIS"
		"combat": return "M-0 MAHAPATIH — TERMINATION PROTOCOL"
		"hardline": return "M-0 MAHAPATIH — SEVER 4 HARDLINE ANCHORS"
		"core": return "M-0 MAHAPATIH — CORE " + ("EXPOSED" if _shutter_open else "SHIELDED")
		_: return "M-0 MAHAPATIH"
