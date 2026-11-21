extends CampaignStageBase

## Stage 4 — Jalan Raya & Alun-Alun (Mini-Boss Tank):
## Maju dari parkiran melewati slalom mobil jalan raya menuju Alun-Alun,
## saksikan cutscene penyergapan helikopter & gedung runtuh, lalu hadapi Tank Boss!

const PARK_RECT := Rect2(-430, -135, 190, 270)
const ROAD_RECT := Rect2(-240, -56, 610, 112)
const SQ_RECT := Rect2(370, -180, 350, 360)

var _phase := "advance" # advance | heli_ambush | tank | outro | complete
var _gate_open := false
var _gate_node: Node3D
var _smash_node: Node3D
var _blockers: Array[Dictionary] = []
var _tank: TankBoss = null
var _heli_node: Node3D
var _cutscene_t := 0.0
var _cutscene_lines: Array = []
var _line_idx := -1
var _outro_lines: Array = []


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 4
	ProceduralBuilder.setup_lighting(host.world_root, "night")

	var env := Node3D.new(); env.name = "Stage4Env"; add_child(env)
	CityscapeBuilder.build_skyline_ring(env, Vector3.ZERO, 820.0, 1550.0, 34)

	var m_asphalt := Pal.mat(Pal.ASPHALT)
	var m_pave := Pal.mat(Pal.CONCRETE)
	var m_grass := Pal.mat(Pal.PARK_GRASS)
	var m_wall := Pal.mat(Pal.GUNMETAL)

	# Parkiran, Jalan Raya 2-lajur, dan Alun-Alun
	ProceduralBuilder.add_box(env, Vector3(190, 2, 270), m_asphalt, Vector3(-335, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(610, 2, 112), m_asphalt, Vector3(65, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(350, 2, 360), m_pave, Vector3(545, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(220, 0.3, 220), m_grass, Vector3(545, 0.15, 0), Vector3.ZERO, false)

	# Garis marka jalan raya
	var lx := -220.0
	while lx < 350.0:
		ProceduralBuilder.add_box(env, Vector3(16, 0.2, 1.4), Pal.mat(Pal.AMBER), Vector3(lx, 0.12, 0), Vector3.ZERO, false)
		lx += 36.0

	# Kendaraan slalom di jalan raya
	for v_spec in [
		["sedan", -170, -24, 10], ["suv", -80, 22, -12], ["sedan", 25, -20, 4],
		["suv", 125, 25, 18], ["sedan", 220, -22, -8], ["pickup", 295, 18, 0],
	]:
		var veh := PropFactory.build_vehicle(v_spec[0])
		veh.position = Vector3(v_spec[1], 0, v_spec[2])
		veh.rotation.y = deg_to_rad(v_spec[3])
		env.add_child(veh)
		_blockers.append(NavGrid2D.make_blocker(v_spec[1], v_spec[2], 14.0, 7.2, 10.0, false, deg_to_rad(v_spec[3])))

	# Gerbang Alun-Alun & gedung runtuh S4_SMASH
	_gate_node = Node3D.new(); _gate_node.position = Vector3(370, 0, 0); env.add_child(_gate_node)
	ProceduralBuilder.add_box(_gate_node, Vector3(4, 18, 112), Pal.mat(Pal.HAZARD, Pal.HAZARD, 0.4), Vector3(0, 9, 0))

	_smash_node = Node3D.new(); _smash_node.position = Vector3(545, 0, -172); env.add_child(_smash_node)
	ProceduralBuilder.add_box(_smash_node, Vector3(70, 44, 24), m_wall, Vector3(0, 22, 0))

	# Helikopter untuk cutscene tankIntro
	_heli_node = Node3D.new(); _heli_node.position = Vector3(545, 95, -260); _heli_node.visible = false; env.add_child(_heli_node)
	ProceduralBuilder.add_box(_heli_node, Vector3(12, 7, 26), Pal.mat(Pal.GUNMETAL), Vector3.ZERO)
	ProceduralBuilder.add_box(_heli_node, Vector3(44, 0.8, 3.2), Pal.mat(Pal.STEEL), Vector3(0, 5.0, 0))

	for pos in [Vector3(-300, 0, -70), Vector3(-20, 0, 38), Vector3(180, 0, -35), Vector3(460, 0, -110), Vector3(620, 0, 110)]:
		host.spawn_crate(pos)
	for pos in [Vector3(-120, 0, -28), Vector3(75, 0, 30), Vector3(260, 0, -18), Vector3(500, 0, 90)]:
		host.spawn_barrel(pos)

	for p in [
		["C", -270, -40], ["B", -190, 32], ["C", -90, -30], ["B", 15, 28],
		["A", 110, -28], ["B", 200, 26], ["C", 285, -20], ["A", 325, 16],
	]:
		host.spawn_robot(p[0], Vector3(p[1], 0, p[2]), "highway", true)

	host.player.global_position = Vector3(-375, 0, 0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 4 // FIGHT EAST TO ALUN-ALUN", 2.8)


func step_stage(dt: float, dt_real: float) -> void:
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle":
			if host.top_cam.is_point_in_view(r.global_position, 22.0):
				r.state = "chasing"

	if _phase == "advance":
		if not _gate_open:
			var alive := 0
			for r in host.robots:
				if is_instance_valid(r) and r.state != "dead":
					alive += 1
			if alive == 0:
				_gate_open = true
				_gate_node.visible = false
				AudioManager.play_sfx("unlock", 0.9)
				host.hud.show_stage_msg("ALUN-ALUN GATE OPEN — ADVANCE EAST!", 2.8)
		elif host.player.global_position.x > 460.0:
			_start_heli_ambush()
	elif _phase == "heli_ambush":
		_step_heli_ambush(dt_real)
	elif _phase == "tank":
		if _tank and is_instance_valid(_tank) and not _tank.is_dead:
			_tank.step_boss(dt, host.player.global_position)
			host.hud.show_boss_hud("IRON JUGGERNAUT TANK", _tank.hp, _tank.max_hp)
			host.fx.step(0.0, Callable())
		if _tank and _tank.is_dead:
			_phase = "outro"
			_cutscene_t = 0.0
			_line_idx = -1
			_outro_lines = Config.dialogue_list("campaign.tankOutro.lines")
			host.hud.hide_boss_hud()
			host.hud.show_stage_msg("TANK DESTROYED!", 2.5)
	elif _phase == "outro":
		_cutscene_t += dt_real
		if not _outro_lines.is_empty():
			var idx := mini(_outro_lines.size() - 1, int(_cutscene_t / 3.0))
			if idx != _line_idx:
				_line_idx = idx
				var d: Dictionary = _outro_lines[idx]
				host.hud.show_radio_dialogue(str(d.get("speaker", "GIBRAN")), str(d.get("text", "")))
		if _cutscene_t >= maxf(3.0, float(_outro_lines.size()) * 3.0):
			host.hud.hide_radio_dialogue()
			_phase = "complete"
			host.complete_stage(4)


func _start_heli_ambush() -> void:
	_phase = "heli_ambush"
	_cutscene_t = 0.0
	_line_idx = -1
	_cutscene_lines = Config.dialogue_list("campaign.tankIntro.lines")
	GameState.cinematic_active = true
	host.hud.set_cine_bars(true)
	_heli_node.visible = true
	host.top_cam.set_cine_focus(Vector2(545, -35), false)
	AudioManager.stop_music()


func _step_heli_ambush(dt: float) -> void:
	_cutscene_t += dt
	_heli_node.position = Vector3(545.0 + sin(_cutscene_t * 1.4) * 35.0, 58.0, lerpf(-220.0, -40.0, clampf(_cutscene_t / 5.0, 0.0, 1.0)))

	if _smash_node.visible and _cutscene_t >= 2.6:
		_smash_node.visible = false
		host.fx.spawn_explosion(Vector3(545, 16, -172), 45.0, 0.0, Color.html("#ff7030"), true, "explode")
		host.top_cam.add_shake(2.4)

	if not _cutscene_lines.is_empty():
		var idx := mini(_cutscene_lines.size() - 1, int(_cutscene_t / 2.6))
		if idx != _line_idx:
			_line_idx = idx
			var d: Dictionary = _cutscene_lines[idx]
			host.hud.show_radio_dialogue(str(d.get("speaker", "PILOT")), str(d.get("text", "")))

	if _cutscene_t >= 8.0:
		skip_cinematic()


func skip_cinematic() -> void:
	if _phase != "heli_ambush":
		return
	_heli_node.visible = false
	_smash_node.visible = false
	GameState.cinematic_active = false
	host.hud.set_cine_bars(false)
	host.hud.hide_radio_dialogue()
	host.top_cam.set_cine_focus(null, false)
	host.top_cam.cam_bounds = Rect2(SQ_RECT.position.x + 25.0, SQ_RECT.position.y + 25.0, SQ_RECT.size.x - 50.0, SQ_RECT.size.y - 50.0)
	_phase = "tank"
	_spawn_tank_boss()


func _spawn_tank_boss() -> void:
	_tank = TankBoss.new()
	host.world_root.add_child(_tank)
	_tank.global_position = Vector3(640, 0, 0)
	_tank.shoot_requested.connect(func(o, d, s, dmg):
		host.fx.spawn_enemy_bullet(o, d, s, dmg, 0.0, false, true)
	)
	_tank.laser_fired.connect(func(_o, _end, dmg):
		if GameState.damage_player(dmg):
			host.hud.flash_damage()
	)
	_tank.missiles_salvo.connect(func(orig: Vector3, target: Vector3, count: int, dmg: float):
		for i in count:
			var tgt := target + Vector3(randf_range(-28, 28), 0, randf_range(-28, 28))
			host.fx.spawn_explosion(tgt, 22.0, dmg, Color.html("#ff5522"), true, "explode")
			if i == 0:
				AudioManager.play_sfx("missile_launch", 0.75)
	)
	_tank.defeated.connect(func():
		AchievementManager.record_boss("tank")
		AudioManager.stop_music()
	)
	AudioManager.start_boss_music()


func handle_player_bullet(b: Dictionary) -> bool:
	if _phase == "tank" and _tank and is_instance_valid(_tank) and not _tank.is_dead:
		var p1: Vector3 = b["prev"]
		var p2: Vector3 = b["pos"]
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, _tank.global_position.x, _tank.global_position.z) <= 22.0 * 22.0:
			b["alive"] = false
			if not bool(b.get("probe_only", false)):
				GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
				_tank.take_damage(float(b.get("dmg", 0.0)))
				host.fx.spawn_burst(p2, 5, false)
			return true
	return false


func handle_explosion(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	if not is_enemy and _phase == "tank" and _tank and is_instance_valid(_tank) and not _tank.is_dead:
		if Vector2(center.x - _tank.global_position.x, center.z - _tank.global_position.z).length() <= radius + 20.0:
			_tank.take_damage(dmg)


func get_objective_text() -> String:
	match _phase:
		"advance": return "STAGE 4 // ADVANCE THROUGH HIGHWAY TO ALUN-ALUN" if not _gate_open else "STAGE 4 // ENTER ALUN-ALUN SQUARE"
		"heli_ambush": return "STAGE 4 // AMBUSH"
		"tank": return "STAGE 4 // DESTROY IRON JUGGERNAUT TANK"
		_: return "STAGE 4 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "advance":
		return [{"x": 545.0, "z": 0.0, "color": Pal.AMBER, "size": 5.0, "clamp": true}]
	if _phase == "tank" and _tank and not _tank.is_dead:
		return [{"x": _tank.global_position.x, "z": _tank.global_position.z, "color": Pal.HAZARD, "size": 5.5, "clamp": true}]
	return []


func is_walkable(x: float, z: float) -> bool:
	var r := 4.5
	if Rect2(PARK_RECT.position + Vector2(r, r), PARK_RECT.size - Vector2(r * 2, r * 2)).has_point(Vector2(x, z)):
		return true
	if Rect2(ROAD_RECT.position + Vector2(r, r), ROAD_RECT.size - Vector2(r * 2, r * 2)).has_point(Vector2(x, z)):
		return true
	if _gate_open and Rect2(SQ_RECT.position + Vector2(r, r), SQ_RECT.size - Vector2(r * 2, r * 2)).has_point(Vector2(x, z)):
		return true
	return false


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	var res := NavGrid2D.resolve_blockers(pos, radius, feet_y, _blockers)
	pos = res["pos"]
	if not _gate_open and pos.x > 362.0 - radius:
		pos.x = 362.0 - radius
	return pos
