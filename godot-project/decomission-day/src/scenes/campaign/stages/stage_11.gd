extends CampaignStageBase

## Stage 11 — IKN Kalimantan (3 Chapter: Forest Insertion, City Roads Network, Root Chamber):
## Ch1: Terjun payung -> jalan hutan 800m, pikap bersenjata, dan tembakan mortir.
## Ch2: Jaringan jalan raya IKN dengan 2 bundaran & 13 barikade beton menuju Gerbang Root.
## Ch3: Koridor Root (2 fabrikator menyala saat masuk viewport) -> Pintu ICE BREACH ->
## Ruang Root 2-undakan + Display Terminal -> Upload tertahan 70% -> Cutscene 4-shot Warden Reveal
## (kamera mengikuti tubuh Warden dari atap) -> Boss Nusantara Warden -> Upload 100%!

var _env: Node3D
var _blockers: Array[Dictionary] = []

# Ch1 Forest
var _para_t := 0.0
var _para_node: Node3D
var _ch1_exit := Vector3(760, 0, 0)
var _ch1_pickups: Array[Dictionary] = []
var _mortars: Array[Dictionary] = []
var _mortar_cd := 2.8

# Ch2 City Roads
var _ch2_exit := Vector3(920, 0, 0)

# Ch3 Root Chamber
var _phase3 := "corridor" # corridor | door | to_console | uploading_pre | reveal | warden | uploading_post | complete
var _fabs: Array[SpawnMachine] = []
var _fabs_woken := false
var _hall_door: Dictionary = {}
var _door_stand := Vector3(295, 0, 0)
var _dais_center := Vector3(540, 0, 0)
var _console_stand := Vector3(522, 0, 0)
var _door_mk: MeshInstance3D
var _console_mk: MeshInstance3D
var _rearm_t := 0.0
var _upload_pct := 0.0
var _warden: NusantaraWardenBoss = null

# Cutscene 4-shot Warden Reveal
var _rev_shot := 0
var _rev_t := 0.0
var _follow_look_y := 30.0
var _console_screen_mat: StandardMaterial3D


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 11
	if chapter == 2:
		_enter_city_roads()
	elif chapter >= 3:
		_enter_root_chamber()
	else:
		_enter_forest()


func _clear_chapter(tag: String) -> void:
	if _env and is_instance_valid(_env):
		_env.queue_free()
	for arr in [host.robots, host.machines, host.crates, host.barrels, host.pickups]:
		for item in arr:
			if is_instance_valid(item): item.queue_free()
		arr.clear()
	host.nav_grid = null
	_blockers.clear()
	_ch1_pickups.clear()
	_mortars.clear()
	_fabs.clear()
	_env = Node3D.new(); _env.name = tag; add_child(_env)


func _enter_forest() -> void:
	chapter = 1
	_para_t = 0.0
	ProceduralBuilder.setup_lighting(host.world_root, "night")
	_clear_chapter("Stage11Forest")

	ProceduralBuilder.add_box(_env, Vector3(1100, 2, 260), Pal.mat(Pal.PARK_GRASS), Vector3(350, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_env, Vector3(950, 0.4, 52), Pal.mat(Pal.WOOD), Vector3(360, 0.1, 0), Vector3.ZERO, false)

	# Pohon pembatas hutan Kalimantan
	for x in range(-60, 790, 45):
		for sz in [-62.0, 62.0]:
			ProceduralBuilder.add_cyl(_env, 2.2, 3.0, 18.0, Pal.mat(Pal.WOOD), Vector3(x, 9, sz), Vector3.ZERO, 8)
			ProceduralBuilder.add_sphere(_env, 14.0, Pal.mat(Pal.LEAF), Vector3(x, 22, sz), Vector3(1, 0.9, 1), 8, 5)
		if x > 90 and x < 680 and x % 90 == 0:
			var v := PropFactory.build_vehicle("pickup", Pal.HAZARD)
			v.position = Vector3(x, 0, randf_range(-16, 16)); v.rotation.y = PI
			_env.add_child(v)
			_blockers.append(NavGrid2D.make_blocker(v.position.x, v.position.z, 14.0, 7.2, 10.0))
			_ch1_pickups.append({"pos": v.position, "cd": 1.5})

	for rx in range(80, 720, 70):
		host.spawn_robot("B" if rx > 320 else "C", Vector3(rx, 0, randf_range(-18, 18)), "forest", true)
	for cx in range(120, 700, 140):
		host.spawn_crate(Vector3(cx, 0, randf_range(-18, 18)))

	var mk := PropFactory.build_stand_marker(Pal.EXIT_GREEN, 24.0, 24.0)
	mk.position = _ch1_exit + Vector3(0, 0.3, 0); _env.add_child(mk)

	_para_node = ProceduralBuilder.add_sphere(_env, 12.0, Pal.mat(Pal.WHITE), Vector3(-50, 110, 0), Vector3(1.2, 0.6, 1.2), 10, 6)
	host.player.global_position = Vector3(-50, 95, 0)
	GameState.cinematic_active = true
	host.top_cam.snap_to(Vector3(-50, 0, 0))
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 11 CH1 // PARACHUTE INSERTION TO KALIMANTAN", 2.8)


func _enter_city_roads() -> void:
	chapter = 2
	ProceduralBuilder.setup_lighting(host.world_root, "night")
	_clear_chapter("Stage11CityRoads")

	ProceduralBuilder.add_box(_env, Vector3(1200, 2, 340), Pal.mat(Pal.ASPHALT), Vector3(450, -1, 0), Vector3.ZERO, false)
	CityscapeBuilder.build_skyline_ring(_env, Vector3.ZERO, 920.0, 1650.0, 32)

	# 2 Bundaran IKN
	for r_x in [240.0, 620.0]:
		ProceduralBuilder.add_cyl(_env, 56, 58, 3.0, Pal.mat(Pal.PARK_GRASS), Vector3(r_x, 1.5, 0), Vector3.ZERO, 24)
		ProceduralBuilder.add_cyl(_env, 14, 18, 28.0, Pal.mat(Pal.TECH, Pal.TECH, 0.5), Vector3(r_x, 14, 0), Vector3.ZERO, 8)
		_blockers.append(NavGrid2D.make_blocker(r_x, 0, 56.0, 56.0, 20.0))

	# 13 Blokade jalan IKN
	for i in 13:
		var bx := 60.0 + float(i) * 62.0
		var bz := float((i % 3) - 1) * 72.0
		if absf(bx - 240.0) < 65.0 or absf(bx - 620.0) < 65.0:
			bz = 105.0 if i % 2 == 0 else -105.0
		ProceduralBuilder.add_box(_env, Vector3(14, 7, 26), Pal.mat(Pal.CONCRETE), Vector3(bx, 3.5, bz))
		_blockers.append(NavGrid2D.make_blocker(bx, bz, 7.5, 13.5, 10.0))
		if i % 2 == 0:
			host.spawn_barrel(Vector3(bx - 12, 0, bz))
		if i % 3 == 0:
			host.spawn_crate(Vector3(bx + 14, 0, bz))

	for rx in range(80, 880, 62):
		var cls := "A" if rx > 550 else ("B" if rx > 240 else "C")
		host.spawn_robot(cls, Vector3(rx, 0, [-95.0, 95.0, 0.0][rx % 3]), "city", true)

	var mk := PropFactory.build_stand_marker(Pal.EXIT_GREEN, 26.0, 26.0)
	mk.position = _ch2_exit + Vector3(0, 0.3, 0); _env.add_child(mk)

	host.player.global_position = Vector3(-40, 0, 0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 11 CH2 // IKN BOULEVARD TO ROOT BUNKER", 2.8)


func _enter_root_chamber() -> void:
	chapter = 3
	_phase3 = "corridor"
	_fabs_woken = false
	_upload_pct = 0.0
	_rearm_t = 0.0
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")
	_clear_chapter("Stage11RootChamber")

	var m_floor := Pal.mat(Color.html("#1a2028"), Color.BLACK, 0.0, 0.78, 0.15)
	var m_wall := Pal.mat(Pal.GUNMETAL)
	var m_dais := Pal.mat(Pal.STEEL)

	# Koridor Root panjang 300 unit (x: 0..300, z: -48..48) -> Ruang Root (x: 300..780, z: -220..220)
	ProceduralBuilder.add_box(_env, Vector3(310, 2, 100), m_floor, Vector3(150, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_env, Vector3(500, 2, 460), m_floor, Vector3(540, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_env, Vector3(310, 24, 6), m_wall, Vector3(150, 12, -50))
	ProceduralBuilder.add_box(_env, Vector3(310, 24, 6), m_wall, Vector3(150, 12, 50))
	ProceduralBuilder.add_box(_env, Vector3(8, 24, 190), m_wall, Vector3(300, 12, -125))
	ProceduralBuilder.add_box(_env, Vector3(8, 24, 190), m_wall, Vector3(300, 12, 125))

	# Pintu Hall Blast ke Ruang Root
	_hall_door = PropFactory.build_split_door(58.0, 22.0, 4.0, "ew", true, false)
	(_hall_door["root"] as Node3D).position = Vector3(300, 0, 0)
	_env.add_child(_hall_door["root"])
	var t_door := PropFactory.build_terminal(Pal.AMBER)
	t_door["root"].position = Vector3(294, 0, -34); t_door["root"].rotation.y = PI * 0.5; _env.add_child(t_door["root"])

	# 2 Mesin Fabrikator di meter ke-50 koridor (dormant sampai masuk viewport)
	for fz in [-28.0, 28.0]:
		var m: SpawnMachine = host.spawn_machine(Vector3(165.0, 0.0, fz), 8.0, 2, 5)
		m.active = false
		_fabs.append(m)

	# Dais 2 tingkat & Superkomputer 3-Layar di pusat Ruang Root
	ProceduralBuilder.add_cyl(_env, 56, 62, 4.4, m_dais, _dais_center + Vector3(0, 2.2, 0), Vector3.ZERO, 24)
	ProceduralBuilder.add_cyl(_env, 34, 40, 4.4, m_dais, _dais_center + Vector3(0, 6.6, 0), Vector3.ZERO, 24)
	var root_pc := Node3D.new(); root_pc.position = _dais_center + Vector3(14, 8.8, 0); _env.add_child(root_pc)
	ProceduralBuilder.add_box(root_pc, Vector3(18, 28, 36), Pal.mat(Pal.INK), Vector3(0, 14, 0))
	ProceduralBuilder.add_cyl(root_pc, 4.0, 8.0, 42.0, Pal.mat(Pal.AMBER, Pal.AMBER, 0.8), Vector3(0, 40, 0), Vector3.ZERO, 8)
	_console_screen_mat = Pal.unique_mat(Pal.TECH, Pal.TECH, 1.1, 0.2, 0.0, false, 1.0, true)
	ProceduralBuilder.add_box(root_pc, Vector3(1.2, 14, 24), _console_screen_mat, Vector3(-9.5, 18, 0), Vector3.ZERO, false)

	_door_mk = PropFactory.build_stand_marker(Pal.AMBER, 16.0, 16.0); _door_mk.position = _door_stand + Vector3(0, 0.3, 0); _env.add_child(_door_mk)
	_console_mk = PropFactory.build_stand_marker(Pal.TECH, 16.0, 16.0); _console_mk.position = _console_stand + Vector3(0, 9.0, 0); _console_mk.visible = false; _env.add_child(_console_mk)

	for cp in [Vector3(120, 0, -32), Vector3(250, 0, 32), Vector3(440, 0, -90), Vector3(620, 0, 90)]:
		host.spawn_crate(cp)
	for bp in [Vector3(210, 0, 0), Vector3(460, 0, 85), Vector3(620, 0, -85)]:
		host.spawn_barrel(bp)

	# Boss Nusantara Warden (tersembunyi di atap sampai cutscene Reveal!)
	_warden = NusantaraWardenBoss.new()
	host.world_root.add_child(_warden)
	_warden.reset_boss(_dais_center + Vector3(105, 0, 0))
	_warden.player_hit_requested.connect(func(dmg: float, _push: Vector2):
		if GameState.damage_player(dmg):
			host.hud.flash_damage()
	)
	_warden.boss_landed.connect(func():
		host.top_cam.add_shake(2.6)
		AudioManager.play_sfx("explode", 0.9, 0.72)
	)
	_warden.boss_wrecked.connect(func(_w):
		AchievementManager.record_boss("warden")
		AudioManager.stop_music()
		_phase3 = "uploading_post"
		_console_mk.visible = true
		host.hud.hide_boss_hud()
		host.hud.show_stage_msg("WARDEN DESTROYED — FINISH KILL-SWITCH UPLOAD!", 3.2)
	)

	host.player.global_position = Vector3(25, 0, 0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 11 CH3 // REACH THE ROOT CHAMBER GATE", 2.8)


func step_stage(dt: float, dt_real: float) -> void:
	if _rearm_t > 0.0:
		_rearm_t -= dt

	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 16.0):
			r.state = "chasing"

	if chapter == 1:
		if GameState.cinematic_active:
			_para_t += dt_real
			var k := clampf(_para_t / 2.4, 0.0, 1.0)
			host.player.global_position = Vector3(-50, lerpf(95.0, 0.0, k), 0)
			_para_node.position = host.player.global_position + Vector3(0, 18, 0)
			if k >= 1.0:
				_para_node.visible = false
				GameState.cinematic_active = false
			return
		# Pikap bersenjata menembak & mortir
		for pk in _ch1_pickups:
			pk["cd"] = float(pk["cd"]) - dt
			if float(pk["cd"]) <= 0.0 and Vector2(pk["pos"].x - host.player.global_position.x, pk["pos"].z - host.player.global_position.z).length() < 140.0:
				pk["cd"] = 2.0
				var dir: Vector3 = (host.player.global_position + Vector3(0, 6, 0) - (pk["pos"] + Vector3(0, 8, 0))).normalized()
				host.fx.spawn_enemy_bullet(pk["pos"] + Vector3(0, 8, 0), dir, 1.8, 7.0)
		_mortar_cd -= dt
		if _mortar_cd <= 0.0 and host.player.global_position.x > 240.0:
			_mortar_cd = 2.8
			host.fx.spawn_explosion(host.player.global_position + Vector3(randf_range(-14, 14), 0, randf_range(-14, 14)), 14.0, 22.0, Color.html("#ff5522"), true, "explode")
		if Vector2(host.player.global_position.x - _ch1_exit.x, host.player.global_position.z - _ch1_exit.z).length() < 24.0:
			_enter_city_roads()
	elif chapter == 2:
		if Vector2(host.player.global_position.x - _ch2_exit.x, host.player.global_position.z - _ch2_exit.z).length() < 26.0:
			_enter_root_chamber()
	else:
		_step_root_chamber(dt, dt_real)


func _step_root_chamber(dt: float, dt_real: float) -> void:
	PropFactory.update_split_door(_hall_door, dt, host.player.global_position)
	var p: Vector3 = host.player.global_position

	# Aktivasi 2 fabrikator begitu masuk viewport
	if not _fabs_woken:
		for m in _fabs:
			if is_instance_valid(m) and host.top_cam.is_point_in_view(m.global_position, 10.0):
				_fabs_woken = true
				for f in _fabs:
					f.activate_machine(0.0)
				host.hud.show_stage_msg("FABRICATORS ONLINE — FIGHT THROUGH TO THE DOOR!", 2.8)
				break

	if _phase3 == "corridor":
		if _rearm_t <= 0.0 and Vector2(p.x - _door_stand.x, p.z - _door_stand.z).length() < 18.0:
			_rearm_t = 999.0
			host.open_ice_breach("ICE BREACH // ROOT GATE", func(ok: bool):
				if ok:
					PropFactory.set_door_locked(_hall_door, false)
					_door_mk.visible = false
					_console_mk.visible = true
					_phase3 = "to_console"
					AudioManager.play_sfx("unlock", 0.9)
					host.hud.show_stage_msg("ROOT CHAMBER OPEN — UPLOAD KILL-SWITCH AT CENTRAL DAIS!", 3.0)
				_rearm_t = 2.0
			)
	elif _phase3 == "to_console":
		if Vector2(p.x - _console_stand.x, p.z - _console_stand.z).length() < 18.0:
			_phase3 = "uploading_pre"
	elif _phase3 == "uploading_pre":
		_upload_pct = minf(70.0, _upload_pct + dt * 26.0)
		host.hud.show_progress_bar("ROOT KILL-SWITCH UPLOAD", _upload_pct)
		if _upload_pct >= 70.0:
			host.hud.hide_progress_bar()
			_console_screen_mat.albedo_color = Pal.HAZARD; _console_screen_mat.emission = Pal.HAZARD
			_start_warden_reveal()
	elif _phase3 == "reveal":
		_step_warden_reveal(dt_real)
	elif _phase3 == "warden":
		_warden.step(dt, p, host.fx)
		host.hud.show_boss_hud("NUSANTARA WARDEN", _warden.hp, _warden.max_hp)
	elif _phase3 == "uploading_post":
		if Vector2(p.x - _console_stand.x, p.z - _console_stand.z).length() < 22.0:
			_upload_pct = minf(100.0, _upload_pct + dt * 22.0)
			host.hud.show_progress_bar("COMPLETING KILL-SWITCH UPLOAD", _upload_pct)
			_console_screen_mat.albedo_color = Pal.EXIT_GREEN; _console_screen_mat.emission = Pal.EXIT_GREEN
			if _upload_pct >= 100.0:
				_phase3 = "complete"
				host.hud.hide_progress_bar()
				host.complete_stage(11)


func _start_warden_reveal() -> void:
	_phase3 = "reveal"
	_rev_shot = 1
	_rev_t = 0.0
	GameState.cinematic_active = true
	host.hud.set_cine_bars(true)
	AudioManager.stop_music()
	host.top_cam.set_cine_focus(Vector2(_dais_center.x + 10.0, 0.0), true)
	_follow_look_y = 20.0
	host.hud.show_radio_dialogue("ROOT CONSOLE", "HALTED AT 70% — EXTERNAL AUTHORITY OVERRIDE.")


func _step_warden_reveal(dt: float) -> void:
	_rev_t += dt
	if _rev_shot == 1 and _rev_t >= 2.2:
		_rev_shot = 2; _rev_t = 0.0
		host.top_cam.set_cine_focus(Vector2(_dais_center.x + 14.0, 0.0), true)
		_follow_look_y = 26.0
	elif _rev_shot == 2 and _rev_t >= 2.0:
		_rev_shot = 3; _rev_t = 0.0
		_warden.activate_drop()
		host.hud.show_radio_dialogue("GIBRAN", "Something heavy just detached from the gantry!")
	elif _rev_shot == 3:
		_warden.step(dt, host.player.global_position, host.fx)
		# Shot 3 mengikuti pusat badan Warden yang turun!
		var wpos := _warden.global_position
		host.top_cam.set_cine_focus(Vector2(wpos.x, wpos.z), false)
		_follow_look_y = lerpf(_follow_look_y, wpos.y + 24.0, clampf(dt * 7.0, 0.0, 1.0))
		if _warden.phase != "descent":
			_rev_shot = 4; _rev_t = 0.0
			host.hud.show_radio_dialogue("GIBRAN", "This never gets any easier.")
	elif _rev_shot == 4 and _rev_t >= 2.2:
		skip_cinematic()


func skip_cinematic() -> void:
	if _phase3 != "reveal":
		return
	GameState.cinematic_active = false
	host.hud.set_cine_bars(false)
	host.hud.hide_radio_dialogue()
	host.top_cam.set_cine_focus(null, false)
	if _warden.phase == "dormant" or _warden.phase == "descent":
		_warden.global_position = _dais_center + Vector3(105, 0, 0)
		_warden.visible = true
		_warden.begin_combat()
	_console_mk.visible = false
	_phase3 = "warden"
	AudioManager.start_boss_music()


func cam_look_height() -> Variant:
	if _phase3 == "reveal":
		return _follow_look_y
	return null


func handle_player_bullet(b: Dictionary) -> bool:
	if _phase3 == "warden" and _warden and is_instance_valid(_warden):
		return _warden.bullet_hit_test(b["prev"], b["pos"], 0.0 if bool(b.get("probe_only", false)) else float(b.get("dmg", 0.0)))
	return false


func handle_explosion(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	if not is_enemy and _phase3 == "warden" and _warden and _warden.is_vulnerable():
		if Vector2(center.x - _warden.global_position.x, center.z - _warden.global_position.z).length() <= radius + 24.0:
			_warden.bullet_hit_test(center, _warden.global_position, dmg)


func get_objective_text() -> String:
	if chapter == 1:
		return "STAGE 11 CH1 // KALIMANTAN FOREST INSERTION"
	if chapter == 2:
		return "STAGE 11 CH2 // BREACH IKN ROADS TO ROOT CHAMBER"
	match _phase3:
		"corridor": return "STAGE 11 CH3 // BREACH ROOT GATE (ICE BREACH)"
		"to_console", "uploading_pre": return "STAGE 11 CH3 // INITIATE KILL-SWITCH AT CENTRAL DAIS"
		"warden": return "STAGE 11 CH3 // DEFEAT NUSANTARA WARDEN"
		"uploading_post": return "STAGE 11 CH3 // COMPLETE UPLOAD (%d%%)" % roundi(_upload_pct)
		_: return "STAGE 11"


func get_radar_landmarks() -> Array[Dictionary]:
	if chapter == 1: return [{"x": _ch1_exit.x, "z": _ch1_exit.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	if chapter == 2: return [{"x": _ch2_exit.x, "z": _ch2_exit.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	if _phase3 == "corridor": return [{"x": _door_stand.x, "z": _door_stand.z, "color": Pal.AMBER, "size": 4.8, "clamp": true}]
	if _phase3 == "warden": return [{"x": _warden.global_position.x, "z": _warden.global_position.z, "color": Pal.HAZARD, "size": 5.5, "clamp": true}]
	return [{"x": _console_stand.x, "z": _console_stand.z, "color": Pal.TECH, "size": 5.0, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	if chapter == 1: return x >= -80.0 and x <= 820.0 and absf(z) <= 55.0
	if chapter == 2: return x >= -80.0 and x <= 990.0 and absf(z) <= 155.0
	if x < 296.0: return x >= 0.0 and absf(z) <= 44.0
	if x <= 304.0: return not bool(_hall_door.get("locked", true)) and absf(z) <= 26.0
	return x <= 775.0 and absf(z) <= 215.0


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	if chapter == 3 and bool(_hall_door.get("locked", true)) and pos.x > 292.0 - radius and pos.x < 306.0:
		pos.x = 292.0 - radius
	var res := NavGrid2D.resolve_blockers(pos, radius, feet_y, _blockers)
	return res["pos"]


func ground_height(x: float, z: float, _cur_y: float) -> float:
	if chapter == 3:
		var d := Vector2(x - _dais_center.x, z - _dais_center.z).length()
		if d <= 38.0: return 8.8
		if d <= 60.0: return 4.4
	return 0.0
