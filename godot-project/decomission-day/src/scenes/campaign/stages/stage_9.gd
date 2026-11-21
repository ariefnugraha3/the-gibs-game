extends CampaignStageBase

## Stage 9 — Bandara Internasional Kertajati (3 Chapter):
## Chapter 1 (Front): Serbuan jalan tol & pelataran terminal (barikade mobil & klaster 20+ barel peledak).
## Chapter 2 (Interior): Lobi Check-In -> Konkurs Menunggu (alarm memicu penyintas check-in mengejar).
## Chapter 3 (Runway): Lindungi pompa bahan bakar & pesawat berat dari saboteur sambil mengisi tangki, lalu lepas landas!

const INT_MAP := [
	"#################################",
	"#.............#.................#",
	"#.............#.................#",
	"#.............=.................#",
	"#.............=.................#",
	"#.............#.................#",
	"#....d...d....#....d.......d....#",
	"#.............#.................#",
	"#.............#.................#",
	"#######..############..##########",
	"#...............................#",
	"#...............................#",
	"#......s......s.......s......s..#",
	"#...............................#",
	"#...............................#",
	"####..################..#########",
	"#...............#...............#",
	"#...............=...............#",
	"#...............#...............#",
	"#....m.....m....#....m.....m....#",
	"#...............................#",
	"#...............................#",
	"#################################",
]

var _env: Node3D
var _map: AsciiMapBuilder.BuiltMap
var _blockers: Array[Dictionary] = []

# Ch1
var _ch1_exit := Vector3(520, 0, 0)
var _ch1_mk: MeshInstance3D
# Ch2
var _ch2_alarmed := false
var _ch2_exit := Vector3.ZERO
var _ch2_mk: MeshInstance3D
# Ch3
var _phase3 := "fueling" # fueling | board | takeoff | complete
var _pump_pos := Vector3(85, 0, -35)
var _plane_pos := Vector3(135, 0, -35)
var _pump_hp := 2000.0
var _pump_max := 2000.0
var _plane_hp := 3000.0
var _plane_max := 3000.0
var _fuel_pct := 0.0
var _wave_t := 2.0
var _plane_node: Node3D
var _board_mk: MeshInstance3D
var _takeoff_t := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 9
	if chapter == 2:
		_enter_interior()
	elif chapter >= 3:
		_enter_runway()
	else:
		_enter_front()


func _clear_chapter(name_tag: String) -> void:
	if _env and is_instance_valid(_env):
		_env.queue_free()
	for arr in [host.robots, host.machines, host.crates, host.barrels, host.pickups]:
		for item in arr:
			if is_instance_valid(item): item.queue_free()
		arr.clear()
	host.nav_grid = null
	_blockers.clear()
	_env = Node3D.new(); _env.name = name_tag; add_child(_env)


func _enter_front() -> void:
	chapter = 1
	ProceduralBuilder.setup_lighting(host.world_root, "night")
	_clear_chapter("Stage9Front")

	ProceduralBuilder.add_box(_env, Vector3(1150, 2, 240), Pal.mat(Pal.ASPHALT), Vector3(40, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_env, Vector3(120, 26, 200), Pal.mat(Pal.GUNMETAL), Vector3(580, 13, 0))
	for i in 12:
		var vx := -420.0 + float(i) * 76.0
		var vz := randf_range(-52.0, 52.0)
		var v := PropFactory.build_vehicle(["sedan", "suv", "pickup"][i % 3])
		v.position = Vector3(vx, 0, vz); v.rotation.y = deg_to_rad(randf_range(-20, 20))
		_env.add_child(v)
		_blockers.append(NavGrid2D.make_blocker(vx, vz, 14.0, 7.2, 10.0))

	# Klaster barel peledak & horde depan bandara
	for bx in range(-360, 440, 55):
		for k in 2:
			host.spawn_barrel(Vector3(float(bx) + float(k) * 14.0, 0, randf_range(-44.0, 44.0)))
	for cx in range(-320, 420, 120):
		host.spawn_crate(Vector3(float(cx), 0, randf_range(-48.0, 48.0)))
	for rx in range(-340, 460, 42):
		var cls := "A" if rx > 280 else ("B" if rx > 0 else "C")
		host.spawn_robot(cls, Vector3(float(rx), 0, randf_range(-48.0, 48.0)), "front", true)

	_ch1_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 24.0, 24.0)
	_ch1_mk.position = _ch1_exit + Vector3(0, 0.3, 0); _env.add_child(_ch1_mk)

	host.player.global_position = Vector3(-490, 0, 0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 9 CH1 // BREACH KERTAJATI FORECOURT", 2.8)


func _enter_interior() -> void:
	chapter = 2
	_ch2_alarmed = false
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")
	_clear_chapter("Stage9Interior")

	_map = AsciiMapBuilder.build(_env, INT_MAP, {
		"door_spans": [
			{"c0": 7, "r0": 9, "c1": 8, "r1": 9, "dir": "ns"},
			{"c0": 21, "r0": 9, "c1": 22, "r1": 9, "dir": "ns"},
			{"c0": 4, "r0": 15, "c1": 5, "r1": 15, "dir": "ns"},
			{"c0": 22, "r0": 15, "c1": 23, "r1": 15, "dir": "ns"},
		],
		"floor_color": Color.html("#242933"),
		"wall_color": Color.html("#313845"),
		"wall_accent": Pal.AMBER_DIM,
	})
	host.nav_grid = _map.nav
	_ch2_exit = _map.cell_pos(28.0, 2.5)
	_ch2_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 20.0, 18.0)
	_ch2_mk.position = _ch2_exit + Vector3(0, 0.3, 0); _ch2_mk.visible = false; _env.add_child(_ch2_mk)

	for pr in [[10, 18], [24, 18], [14, 12], [8, 4], [24, 4]]:
		host.spawn_crate(_map.cell_pos(pr[0], pr[1]))
	for pr in [[12, 14], [20, 11], [19, 5]]:
		host.spawn_barrel(_map.cell_pos(pr[0], pr[1]))

	for p in [["C", 8, 17], ["C", 24, 17], ["B", 11, 13], ["B", 22, 13]]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "checkin", true)

	host.player.global_position = _map.cell_pos(6.0, 20.5)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 9 CH2 // CLEAR CHECK-IN & CONCOURSE TO RUNWAY", 2.8)


func _enter_runway() -> void:
	chapter = 3
	_phase3 = "fueling"
	_pump_hp = float(Config.stage_cfg(9).get("fuelDefense", {}).get("pumpHp", 2000.0))
	_pump_max = _pump_hp
	_plane_hp = float(Config.stage_cfg(9).get("fuelDefense", {}).get("aircraftHp", 3000.0))
	_plane_max = _plane_hp
	_fuel_pct = 0.0
	_wave_t = 1.5
	ProceduralBuilder.setup_lighting(host.world_root, "night")
	_clear_chapter("Stage9Runway")

	ProceduralBuilder.add_box(_env, Vector3(1100, 2, 340), Pal.mat(Pal.ASPHALT), Vector3(150, -1, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_env, Vector3(950, 0.2, 6.0), Pal.mat(Pal.WHITE), Vector3(220, 0.12, -35), Vector3.ZERO, false)

	# Pompa bahan bakar
	var pump := Node3D.new(); pump.position = _pump_pos; _env.add_child(pump)
	ProceduralBuilder.add_box(pump, Vector3(14, 10, 10), Pal.mat(Pal.AMBER, Pal.AMBER, 0.3), Vector3(0, 5, 0))
	_blockers.append(NavGrid2D.make_blocker(_pump_pos.x, _pump_pos.z, 7.5, 5.5, 12.0))

	# Pesawat angkut militer berat
	_plane_node = Node3D.new(); _plane_node.position = _plane_pos; _env.add_child(_plane_node)
	var m_body := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.55, 0.45)
	var m_dark := Pal.mat(Pal.GUNMETAL)
	ProceduralBuilder.add_box(_plane_node, Vector3(72, 14, 16), m_body, Vector3(0, 9, 0))
	ProceduralBuilder.add_box(_plane_node, Vector3(20, 2.5, 76), m_body, Vector3(4, 12, 0))
	ProceduralBuilder.add_box(_plane_node, Vector3(12, 16, 4), m_dark, Vector3(-30, 18, 0))
	for ez in [-22.0, -11.0, 11.0, 22.0]:
		ProceduralBuilder.add_cyl(_plane_node, 3.2, 3.2, 9.0, m_dark, Vector3(10, 10, ez), Vector3(0, 0, 90), 10)

	_board_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 22.0, 22.0)
	_board_mk.position = _plane_pos + Vector3(-20, 0.3, 22); _board_mk.visible = false; _env.add_child(_board_mk)

	for pair in [[30, -15], [40, 25], [140, 20]]:
		host.spawn_crate(Vector3(pair[0], 0, pair[1]))
	for pair in [[60, -70], [120, -75], [95, 25]]:
		host.spawn_barrel(Vector3(pair[0], 0, pair[1]))

	host.player.global_position = Vector3(-40, 0, 15)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 9 CH3 // DEFEND PUMP & AIRCRAFT WHILE REFUELING!", 3.2)


func step_stage(dt: float, _dt_real: float) -> void:
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 16.0):
			r.state = "chasing"

	if chapter == 1:
		if Vector2(host.player.global_position.x - _ch1_exit.x, host.player.global_position.z - _ch1_exit.z).length() < 24.0:
			_enter_interior()
	elif chapter == 2:
		_map.step_doors(dt, host.player.global_position, host.robots)
		var p: Vector3 = host.player.global_position
		if not _ch2_alarmed and p.z < _map.cell_pos(0, 9).z:
			_ch2_alarmed = true
			for r in host.robots:
				if is_instance_valid(r): r.state = "chasing"
			for sp in [[6, 3], [16, 4], [25, 3], [27, 7]]:
				host.spawn_robot("A" if sp[0] > 20 else "B", _map.cell_pos(sp[0], sp[1]), "concourse", false)
			host.hud.show_stage_msg("CONCOURSE ALARM — ELIMINATE ALL HOSTILES!", 2.8)
		if _ch2_alarmed:
			var alive := 0
			for r in host.robots:
				if is_instance_valid(r) and r.state != "dead": alive += 1
			if alive == 0:
				_ch2_mk.visible = true
				if Vector2(p.x - _ch2_exit.x, p.z - _ch2_exit.z).length() < 20.0:
					_enter_runway()
	elif chapter == 3:
		if _phase3 == "fueling":
			var rate := 100.0 / maxf(10.0, float(Config.stage_cfg(9).get("fuelingDurationSec", 35.0)))
			_fuel_pct = minf(100.0, _fuel_pct + rate * dt)
			host.hud.show_progress_bar("AIRCRAFT REFUELING", _fuel_pct)
			host.hud.show_boss_hud("FUEL PUMP %.0f  |  AIRCRAFT %.0f" % [_pump_hp, _plane_hp], _plane_hp, _plane_max)

			_wave_t -= dt
			if _wave_t <= 0.0 and host.robots.size() < 12:
				_wave_t = 3.6
				var sx := randf_range(-40.0, 260.0)
				var sz := 95.0 if randf() < 0.6 else -95.0
				var rob: RobotEnemy = host.spawn_robot("B" if randf() < 0.45 else "C", Vector3(sx, 0, sz), "saboteur", false)
				rob.is_saboteur = true
				rob.saboteur_target = "pump" if randf() < 0.5 else "aircraft"
				rob.structure_clawed.connect(func(sb: RobotEnemy, dmg: float):
					if sb.saboteur_target == "pump":
						_pump_hp = maxf(0.0, _pump_hp - dmg)
					else:
						_plane_hp = maxf(0.0, _plane_hp - dmg)
					if _pump_hp <= 0.0 or _plane_hp <= 0.0:
						host.trigger_stage_defeat("AIRCRAFT DESTROYED ON RUNWAY")
				)

			# Beri extra_target pada saboteur di loop manual? RobotEnemy sudah punya AI ngejar player atau monas, saboteur bisa langsung merusak jika dekat!
			for r in host.robots:
				if is_instance_valid(r) and r.state != "dead" and r.is_saboteur:
					var tp := _pump_pos if r.saboteur_target == "pump" else _plane_pos
					if Vector2(r.global_position.x - tp.x, r.global_position.z - tp.z).length() < 26.0:
						r.structure_clawed.emit(r, r.attack * dt * 0.8)

			if _fuel_pct >= 100.0:
				_phase3 = "board"
				host.hud.hide_progress_bar()
				host.hud.hide_boss_hud()
				_board_mk.visible = true
				AudioManager.play_sfx("unlock", 0.9)
				host.hud.show_stage_msg("TANK FULL — BOARD THE TRANSPORT AIRCRAFT!", 3.0)
		elif _phase3 == "board":
			var p: Vector3 = host.player.global_position
			var bp := _board_mk.global_position
			if Vector2(p.x - bp.x, p.z - bp.z).length() < 18.0:
				_phase3 = "takeoff"
				_takeoff_t = 0.0
				GameState.cinematic_active = true
				host.player.avatar.visible = false
				host.hud.set_cine_bars(true)
				host.hud.show_stage_msg("CLEARED FOR TAKEOFF — DEPARTING JAVA!", 3.2)
		elif _phase3 == "takeoff":
			_takeoff_t += dt
			_plane_node.position.x += _takeoff_t * 75.0 * dt
			if _takeoff_t > 1.8:
				_plane_node.position.y += (_takeoff_t - 1.8) * 32.0 * dt
				_plane_node.rotation.z = clampf((_takeoff_t - 1.8) * 0.14, 0.0, 0.22)
			host.player.global_position = _plane_node.position
			if _takeoff_t >= 3.8:
				_phase3 = "complete"
				host.complete_stage(9)


func get_objective_text() -> String:
	if chapter == 1:
		return "STAGE 9 CH1 // BREACH KERTAJATI TERMINAL"
	if chapter == 2:
		return "STAGE 9 CH2 // CLEAR CHECK-IN & CONCOURSE" if not _ch2_alarmed else "STAGE 9 CH2 // FIGHT TO RUNWAY APRON"
	return "STAGE 9 CH3 // REFUEL %d%% & DEFEND AIRCRAFT" % roundi(_fuel_pct) if _phase3 == "fueling" else "STAGE 9 CH3 // BOARD AIRCRAFT"


func get_radar_landmarks() -> Array[Dictionary]:
	if chapter == 1:
		return [{"x": _ch1_exit.x, "z": _ch1_exit.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	if chapter == 2:
		return [{"x": _ch2_exit.x, "z": _ch2_exit.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	if _phase3 == "fueling":
		return [{"x": _pump_pos.x, "z": _pump_pos.z, "color": Pal.AMBER, "size": 5.0, "clamp": true}]
	return [{"x": _board_mk.global_position.x, "z": _board_mk.global_position.z, "color": Pal.EXIT_GREEN, "size": 5.2, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	if chapter == 2 and _map:
		return _map.is_walkable(x, z)
	if chapter == 1:
		return x >= -530.0 and x <= 535.0 and absf(z) <= 115.0
	return x >= -350.0 and x <= 550.0 and absf(z) <= 160.0


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	if chapter == 2 and _map:
		return _map.resolve(pos, radius, feet_y)
	var res := NavGrid2D.resolve_blockers(pos, radius, feet_y, _blockers)
	return res["pos"]


func is_bullet_blocked(b: Dictionary) -> bool:
	if chapter == 2 and _map:
		return _map.bullet_blocked(b["prev"], b["pos"])
	return false
