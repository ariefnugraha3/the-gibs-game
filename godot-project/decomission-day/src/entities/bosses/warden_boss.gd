class_name NusantaraWardenBoss
extends Node3D

## Boss Nusantara Warden Stage 11: hexapod 6 kaki selebar 19m, perisai arah depan,
## fase Jam 1 (3 Capacitor 600 HP) & Jam 2 (2 Coupling 800 HP), railgun, stomp,
## burst volley, sector sweep, whirlwind pursuit, dan destruksi bertahap.

signal boss_hp_changed(hp: float, max_hp: float, subtitle: String)
signal jam_started(jam_no: int)
signal jam_cleared(jam_no: int)
signal boss_landed()
signal boss_wrecked(boss: NusantaraWardenBoss)
signal player_hit_requested(dmg: float, push_dir: Vector2)

var hp := 15000.0
var max_hp := 15000.0
var phase := "dormant" # dormant | descent | combat1 | jam1 | combat2 | jam2 | combat3 | dying | dead
var _state := "gap"
var _timer := 1.8

var _core_mat: StandardMaterial3D
var _shield_mesh: MeshInstance3D
var _legs: Array[Node3D] = []
var _capacitors: Array[Dictionary] = []
var _couplings: Array[Dictionary] = []
var _warn_ring: MeshInstance3D
var _rail_beam: MeshInstance3D

var _descent_t := 0.0
var _descent_hover := 1.1
var _descent_sec := 3.2
var _descent_h := 130.0
var _home_pos := Vector3.ZERO
var _death_t := 0.0
var _whirl_tick := 0.0


func _ready() -> void:
	_build_mesh()
	reset_boss(_home_pos)


func _build_mesh() -> void:
	var m_armor := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.65, 0.4)
	var m_dark := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.3)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.5, 0.5)
	_core_mat = Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 0.9, 0.3, 0.1)

	ProceduralBuilder.add_cyl(self, 16, 20, 14, m_armor, Vector3(0, 22, 0), Vector3.ZERO, 12)
	ProceduralBuilder.add_sphere(self, 11, _core_mat, Vector3(0, 32, 0), Vector3.ONE, 12, 8, false)
	_shield_mesh = ProceduralBuilder.add_box(self, Vector3(3.0, 22, 30), Pal.unique_mat(Pal.TECH, Pal.TECH, 0.7, 0.2, 0.0, true, 0.35, true), Vector3(-22, 22, 0), Vector3.ZERO, false)

	for i in 6:
		var a := float(i) * TAU / 6.0
		var leg := Node3D.new()
		leg.position = Vector3(cos(a) * 18.0, 18.0, sin(a) * 18.0)
		leg.rotation.y = -a
		add_child(leg)
		ProceduralBuilder.add_box(leg, Vector3(26, 6, 8), m_armor, Vector3(13, 0, 0), Vector3(0, 0, -14))
		ProceduralBuilder.add_box(leg, Vector3(22, 5, 7), m_dark, Vector3(28, -9, 0), Vector3(0, 0, -68))
		ProceduralBuilder.add_box(leg, Vector3(14, 4, 11), m_steel, Vector3(33, -17, 0))
		_legs.append(leg)

	for i in 3:
		var a := float(i) * TAU / 3.0
		var cnode := Node3D.new()
		cnode.position = Vector3(cos(a) * 22.0, 28.0, sin(a) * 22.0)
		add_child(cnode)
		var mat := Pal.unique_mat(Pal.AMBER, Pal.AMBER, 0.9)
		ProceduralBuilder.add_cyl(cnode, 4.5, 5.2, 12.0, mat, Vector3.ZERO, Vector3.ZERO, 10, false)
		cnode.visible = false
		_capacitors.append({"node": cnode, "mat": mat, "hp": 600.0, "alive": false})

	for i in 2:
		var z_off := -16.0 if i == 0 else 16.0
		var k_node := Node3D.new()
		k_node.position = Vector3(18.0, 20.0, z_off)
		add_child(k_node)
		var mat := Pal.unique_mat(Pal.TECH, Pal.TECH, 0.9)
		ProceduralBuilder.add_box(k_node, Vector3(14, 8, 9), mat, Vector3.ZERO, Vector3.ZERO, false)
		k_node.visible = false
		_couplings.append({"node": k_node, "mat": mat, "hp": 800.0, "alive": false})

	_warn_ring = ProceduralBuilder.add_ring(self, 0.78, 1.0, Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.1, 0.2, 0.0, true, 0.55, true), Vector3(0, 2.0, 0), 32)
	_warn_ring.visible = false
	_rail_beam = ProceduralBuilder.add_box(self, Vector3(11.0, 3.0, 420.0), Pal.unique_mat(Pal.AMBER, Pal.AMBER, 1.6, 0.2, 0.0, true, 0.85, true), Vector3(0, 12, 210), Vector3.ZERO, false)
	_rail_beam.visible = false


func _cfg() -> Dictionary:
	return Config.campaign().get("bosses", {}).get("warden", {})


func reset_boss(home: Vector3) -> void:
	_home_pos = home
	var c := _cfg()
	max_hp = float(c.get("hp", 15000.0))
	hp = max_hp
	phase = "dormant"
	_state = "gap"
	_timer = float(c.get("attackGapSec", 1.8))
	global_position = home
	scale = Vector3.ONE * 0.72
	visible = false
	_warn_ring.visible = false
	_rail_beam.visible = false
	for cap in _capacitors:
		(cap["node"] as Node3D).visible = false
		cap["alive"] = false
	for coup in _couplings:
		(coup["node"] as Node3D).visible = false
		coup["alive"] = false


func activate_drop() -> void:
	var c := _cfg()
	var desc: Dictionary = c.get("descent", {})
	_descent_h = float(desc.get("heightUnits", 130.0))
	_descent_hover = float(desc.get("hoverSec", 1.1))
	_descent_sec = float(desc.get("sec", 3.2))
	_descent_t = 0.0
	phase = "descent"
	visible = true
	global_position = _home_pos + Vector3(0, _descent_h, 0)


func begin_combat() -> void:
	phase = "combat1"
	_state = "gap"
	_timer = 1.2
	boss_hp_changed.emit(hp, max_hp, "NUSANTARA WARDEN")


func is_vulnerable() -> bool:
	return phase in ["combat1", "combat2", "combat3"]


func step(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	var c := _cfg()
	if phase == "descent":
		_descent_t += dt
		if _descent_t <= _descent_hover:
			global_position = _home_pos + Vector3(0, _descent_h, 0)
		else:
			var fall_k := clampf((_descent_t - _descent_hover) / maxf(0.1, _descent_sec - _descent_hover), 0.0, 1.0)
			global_position.y = _home_pos.y + _descent_h * (1.0 - pow(fall_k, 1.9))
			if fall_k >= 1.0:
				global_position = _home_pos
				phase = "combat1"
				AudioManager.play_sfx("tank_blast", 0.9)
				boss_landed.emit()
		return

	if phase == "dying":
		_death_t += dt
		var dur := float(c.get("deathSec", 8.0))
		for i in _legs.size():
			_legs[i].position.y = lerpf(_legs[i].position.y, 10.0, clampf(dt * 1.5, 0.0, 1.0))
		if _death_t >= dur:
			phase = "dead"
			AchievementManager.record_boss("warden")
			boss_wrecked.emit(self)
		return

	if phase in ["dormant", "dead"]:
		return

	var to_p := Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z)
	var dist := to_p.length()
	var target_yaw := atan2(to_p.x, to_p.y) + PI * 0.5
	rotation.y = lerp_angle(rotation.y, target_yaw, clampf(dt * float(c.get("turnRadPerSec", 1.0)) * 1.5, 0.0, 1.0))

	if _state == "whirlwind":
		var ww: Dictionary = c.get("whirlwind", {})
		rotation.y += float(ww.get("spinRadPerSec", 18.0)) * dt
		if dist > 8.0:
			var dir2 := to_p.normalized()
			global_position.x += dir2.x * float(ww.get("chaseSpeed", 60.0)) * dt
			global_position.z += dir2.y * float(ww.get("chaseSpeed", 60.0)) * dt
		_whirl_tick -= dt
		if _whirl_tick <= 0.0 and dist <= float(ww.get("radius", 66.5)):
			_whirl_tick = float(ww.get("tickSec", 0.25))
			player_hit_requested.emit(float(ww.get("damagePerSec", 20.0)) * _whirl_tick, to_p.normalized())
		_timer -= dt
		if _timer <= 0.0:
			_warn_ring.visible = false
			_state = "gap"
			_timer = float(c.get("attackGapSec", 1.8))
		return

	# Pergerakan pelan saat combat normal
	if _state == "gap" and dist > 75.0:
		var move_dir := to_p.normalized()
		global_position.x += move_dir.x * float(c.get("moveSpeed", 30.0)) * dt
		global_position.z += move_dir.y * float(c.get("moveSpeed", 30.0)) * dt

	match _state:
		"gap":
			_timer -= dt
			if _timer <= 0.0:
				var choices := ["rail", "stomp", "burst", "sector"]
				if phase == "combat3":
					choices.append("whirlwind")
				_start_attack(choices[randi() % choices.size()], player_pos, c)
		"rail_warn":
			_timer -= dt
			if _timer <= 0.0:
				_rail_beam.visible = false
				var orig := global_position + Vector3(0, 18, 0)
				var d := (Vector3(player_pos.x, orig.y, player_pos.z) - orig).normalized()
				fx.spawn_enemy_bullet(orig, d, 3.8, float(c.get("rail", {}).get("damage", 55.0)), 0.0, false, true)
				AudioManager.play_sfx("tank_mortar", 0.7)
				_end_atk(c)
		"stomp_warn":
			_timer -= dt
			if _timer <= 0.0:
				_warn_ring.visible = false
				var sr := float(c.get("stomp", {}).get("radius", 33.4)) * (2.0 if phase == "combat3" else 1.0)
				fx.spawn_explosion(global_position + Vector3(0, 2, 0), sr, 0.0, Color.html("#ff6028"), true, "tank_blast")
				if dist <= sr:
					player_hit_requested.emit(float(c.get("stomp", {}).get("damage", 45.0)), to_p.normalized())
				_end_atk(c)
		"burst_warn":
			_timer -= dt
			if _timer <= 0.0:
				var bc: Dictionary = c.get("burst", {})
				var cnt := int(bc.get("count", 9))
				var orig := global_position + Vector3(0, 18, 0)
				for i in cnt:
					var ang := (float(i) / float(cnt)) * TAU
					fx.spawn_enemy_bullet(orig, Vector3(cos(ang), 0, sin(ang)), 2.2, float(bc.get("damage", 18.0)))
				AudioManager.play_sfx("robot_shot", 0.7)
				_end_atk(c)
		"sector_warn":
			_timer -= dt
			if _timer <= 0.0:
				_warn_ring.visible = false
				var sc: Dictionary = c.get("sector", {})
				fx.spawn_explosion(global_position + Vector3(0, 3, 0), 85.0, 0.0, Color.html("#b3402e"), true, "tank_blast")
				if dist < 140.0:
					player_hit_requested.emit(float(sc.get("damage", 50.0)), to_p.normalized())
				_end_atk(c)


func _start_attack(kind: String, player_pos: Vector3, c: Dictionary) -> void:
	match kind:
		"rail":
			_state = "rail_warn"
			_timer = float(c.get("rail", {}).get("telegraphSec", 0.9))
			_rail_beam.visible = true
			_rail_beam.look_at(Vector3(player_pos.x, _rail_beam.global_position.y, player_pos.z), Vector3.UP)
		"stomp":
			_state = "stomp_warn"
			_timer = float(c.get("stomp", {}).get("telegraphSec", 0.8))
			var sr := float(c.get("stomp", {}).get("radius", 33.4)) * (2.0 if phase == "combat3" else 1.0)
			_warn_ring.scale = Vector3.ONE * sr
			_warn_ring.visible = true
		"burst":
			_state = "burst_warn"
			_timer = float(c.get("burst", {}).get("telegraphSec", 0.7))
		"sector":
			_state = "sector_warn"
			_timer = float(c.get("sector", {}).get("telegraphSec", 1.1))
			_warn_ring.scale = Vector3.ONE * 95.0
			_warn_ring.visible = true
		"whirlwind":
			_state = "whirlwind"
			_timer = float(c.get("whirlwind", {}).get("durationSec", 10.0))
			_warn_ring.scale = Vector3.ONE * float(c.get("whirlwind", {}).get("radius", 66.5))
			_warn_ring.visible = true


func _end_atk(c: Dictionary) -> void:
	_state = "gap"
	var gap := float(c.get("attackGapSec", 1.8))
	if phase == "combat3":
		gap *= float(c.get("enrageGapMul", 0.8))
	_timer = gap


func bullet_hit_test(p0: Vector3, p1: Vector3, dmg: float) -> bool:
	if phase in ["dormant", "descent", "dying", "dead"]:
		return false

	# Uji weak-point saat Jam 1 (Capacitors) & Jam 2 (Couplings)
	if phase == "jam1":
		for cap in _capacitors:
			if not bool(cap["alive"]):
				continue
			var n: Node3D = cap["node"]
			if NavGrid2D.seg_point_dist_sq(n.global_position.x, n.global_position.z, p0.x, p0.z, p1.x, p1.z) <= 144.0:
				cap["hp"] = float(cap["hp"]) - dmg
				if float(cap["hp"]) <= 0.0:
					cap["alive"] = false
					n.visible = false
					AudioManager.play_sfx("explode", 0.8)
				_check_jam_clear(1)
				return true
	elif phase == "jam2":
		for coup in _couplings:
			if not bool(coup["alive"]):
				continue
			var n: Node3D = coup["node"]
			if NavGrid2D.seg_point_dist_sq(n.global_position.x, n.global_position.z, p0.x, p0.z, p1.x, p1.z) <= 196.0:
				coup["hp"] = float(coup["hp"]) - dmg
				if float(coup["hp"]) <= 0.0:
					coup["alive"] = false
					n.visible = false
					AudioManager.play_sfx("explode", 0.8)
				_check_jam_clear(2)
				return true

	var d2 := NavGrid2D.seg_point_dist_sq(global_position.x, global_position.z, p0.x, p0.z, p1.x, p1.z)
	if d2 > 676.0:
		return false

	if not is_vulnerable():
		return true # consumed by jammed shield

	var c := _cfg()
	hp = maxf(0.0, hp - dmg)
	var p2_hp := max_hp * float(c.get("phase2HpFrac", 0.75))
	var p3_hp := max_hp * float(c.get("phase3HpFrac", 0.5))

	if phase == "combat1" and hp <= p2_hp:
		hp = p2_hp
		_enter_jam(1)
	elif phase == "combat2" and hp <= p3_hp:
		hp = p3_hp
		_enter_jam(2)
	elif phase == "combat3" and hp <= 0.0:
		hp = 0.0
		phase = "dying"
		_death_t = 0.0
		_warn_ring.visible = false
		_rail_beam.visible = false
		AudioManager.play_sfx("tank_explode", 0.95)

	boss_hp_changed.emit(hp, max_hp, _hud_sub())
	return true


func _enter_jam(no: int) -> void:
	var c := _cfg()
	if no == 1:
		phase = "jam1"
		var cap_hp := float(c.get("capacitors", {}).get("hp", 600.0))
		for cap in _capacitors:
			cap["hp"] = cap_hp
			cap["alive"] = true
			(cap["node"] as Node3D).visible = true
	else:
		phase = "jam2"
		var coup_hp := float(c.get("couplings", {}).get("hp", 800.0))
		for coup in _couplings:
			coup["hp"] = coup_hp
			coup["alive"] = true
			(coup["node"] as Node3D).visible = true
	jam_started.emit(no)
	boss_hp_changed.emit(hp, max_hp, _hud_sub())


func _check_jam_clear(no: int) -> void:
	if no == 1:
		for cap in _capacitors:
			if bool(cap["alive"]):
				return
		phase = "combat2"
		jam_cleared.emit(1)
	else:
		for coup in _couplings:
			if bool(coup["alive"]):
				return
		phase = "combat3"
		jam_cleared.emit(2)
	boss_hp_changed.emit(hp, max_hp, _hud_sub())


func _hud_sub() -> String:
	match phase:
		"jam1": return "NUSANTARA WARDEN — DESTROY 3 CAPACITORS"
		"jam2": return "NUSANTARA WARDEN — SEVER 2 COUPLINGS"
		"combat3": return "NUSANTARA WARDEN — OVERDRIVE"
		_: return "NUSANTARA WARDEN"
