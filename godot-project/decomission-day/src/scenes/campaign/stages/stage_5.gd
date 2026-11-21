extends CampaignStageBase

## Stage 5 — Stasiun Kereta & Kereta Ekspres Menuju Bandung:
## Babak 1: Hack ruang sinyal (SIGNAL TRACE) & pulihkan panel daya (FIELD REPAIR) di depot, lalu naiki kereta.
## Babak 2: Pertempuran di atas gerbong bergerak melawan konvoi paralel & Boss Lokomotif Bersenjata.

const DEPOT_MAP := [
	"..............................",
	"..............................",
	"..............................",
	"..............................",
	"##############################",
	"#............................#",
	"#.HH.........................#",
	"#............................#",
	"#............................#",
	"####..######..######..###==###",
	"#AAAA#.......................#",
	"#AAAA=.......................#",
	"#AAAA=.......................#",
	"#AAAA#.......................#",
	"#AAAA#.......................#",
	"#AAAA#.......................#",
	"#AAAA#.......................#",
	"#AAAA#.......................#",
	"#AAAA#.................#######",
	"#AAAA#.................#....H#",
	"#AAAA#.................=....H#",
	"#AAAA#.................=....H#",
	"#AAAA#.................#....H#",
	"#ASSA#.......................#",
	"##############################",
]

var _map: AsciiMapBuilder.BuiltMap
var _phase := "hack_signal" # hack_signal | repair_power | board_train | journey | boss | arrive | complete
var _depot_root: Node3D
var _journey_root: Node3D
var _train_root: Node3D
var _scenery_chunks: Array[Node3D] = []

var _sig_pos := Vector3.ZERO
var _rep_pos := Vector3.ZERO
var _board_pos := Vector3.ZERO
var _sig_mk: MeshInstance3D
var _rep_mk: MeshInstance3D
var _board_mk: MeshInstance3D
var _rearm_t := 0.0
var _rep_installed := 0

# State Journey & Locomotive Boss
var _loco: LocomotiveBoss = null
var _journey_t := 0.0
var _wave_t := 0.0
var _enemy_consist: Node3D
const TRAIN_RECT := Rect2(-68.0, -14.0, 136.0, 28.0)


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 5
	ProceduralBuilder.setup_lighting(host.world_root, "night")

	_depot_root = Node3D.new(); _depot_root.name = "DepotWorld"; add_child(_depot_root)
	CityscapeBuilder.build_skyline_ring(_depot_root, Vector3.ZERO, 720.0, 1400.0, 32)
	_map = AsciiMapBuilder.build(_depot_root, DEPOT_MAP, {
		"door_spans": [
			{"c0": 4, "r0": 9, "c1": 5, "r1": 9, "dir": "ns"},
			{"c0": 12, "r0": 9, "c1": 13, "r1": 9, "dir": "ns"},
			{"c0": 20, "r0": 9, "c1": 21, "r1": 9, "dir": "ns"},
		],
		"floor_color": Color.html("#23272f"),
		"wall_color": Color.html("#303640"),
	})
	host.nav_grid = _map.nav

	# Peron rel & kereta diam di sisi utara depot
	var track_z := _map.z0 - 34.0
	ProceduralBuilder.add_box(_depot_root, Vector3(680, 1.5, 90), Pal.mat(Pal.ASPHALT), Vector3(0, -0.75, track_z), Vector3.ZERO, false)
	for rz in [-26.0, -42.0]:
		ProceduralBuilder.add_box(_depot_root, Vector3(660, 0.8, 1.4), Pal.mat(Pal.STEEL), Vector3(0, 0.4, track_z + rz), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_depot_root, Vector3(136, 12, 28), Pal.mat(Pal.GUNMETAL), Vector3(0, 6.0, track_z), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_depot_root, Vector3(72, 16, 26), Pal.mat(Pal.HAZARD), Vector3(110, 8.0, track_z), Vector3.ZERO, false)

	var c_term := PropFactory.build_terminal(Pal.TECH)
	c_term["root"].position = _map.cell_pos(28, 20); _depot_root.add_child(c_term["root"])
	var c_gen := PropFactory.build_generator()
	c_gen.position = _map.cell_pos(3, 6); _depot_root.add_child(c_gen)

	_sig_pos = _map.cell_pos(26.5, 20.5)
	_rep_pos = _map.cell_pos(5.5, 7.0)
	_board_pos = _map.cell_pos(15.0, 2.5)

	_sig_mk = PropFactory.build_stand_marker(Pal.AMBER, 13.0, 13.0); _sig_mk.position = _sig_pos + Vector3(0, 0.3, 0); _depot_root.add_child(_sig_mk)
	_rep_mk = PropFactory.build_stand_marker(Pal.TECH, 13.0, 13.0); _rep_mk.position = _rep_pos + Vector3(0, 0.3, 0); _rep_mk.visible = false; _depot_root.add_child(_rep_mk)
	_board_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 22.0, 16.0); _board_mk.position = _board_pos + Vector3(0, 0.3, 0); _board_mk.visible = false; _depot_root.add_child(_board_mk)

	for pr in [[11, 13], [19, 13], [14, 19], [9, 6], [22, 6]]:
		host.spawn_crate(_map.cell_pos(pr[0], pr[1]))
	for pr in [[15, 11], [17, 16], [10, 8], [20, 8]]:
		host.spawn_barrel(_map.cell_pos(pr[0], pr[1]))

	for p in [["C", 11, 14], ["B", 18, 12], ["C", 25, 16], ["B", 12, 7], ["A", 22, 7]]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "depot", true)

	host.player.global_position = _map.cell_pos(2.5, 23.0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 5 // RESTORE DEPOT SIGNALS & BOARD TRAIN", 2.8)


func step_stage(dt: float, _dt_real: float) -> void:
	if _rearm_t > 0.0:
		_rearm_t -= dt

	if _phase in ["hack_signal", "repair_power", "board_train"]:
		_map.step_doors(dt, host.player.global_position, host.robots)
		for r in host.robots:
			if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 14.0):
				r.state = "chasing"

		var p: Vector3 = host.player.global_position
		if _phase == "hack_signal" and _rearm_t <= 0.0 and Vector2(p.x - _sig_pos.x, p.z - _sig_pos.z).length() < 13.0:
			_rearm_t = 999.0
			host.open_signal_trace("SIGNAL TRACE // RAIL SWITCH", func(ok: bool):
				if ok:
					_phase = "repair_power"
					_sig_mk.visible = false
					_rep_mk.visible = true
					AudioManager.play_sfx("unlock", 0.85)
					host.hud.show_stage_msg("TRACK SWITCH LOCKED — REPAIR DEPOT SUBSTATION!", 2.8)
				else:
					_rearm_t = 2.0
			)
		elif _phase == "repair_power" and _rearm_t <= 0.0 and Vector2(p.x - _rep_pos.x, p.z - _rep_pos.z).length() < 13.0:
			_rearm_t = 999.0
			host.open_field_repair("FIELD REPAIR // DEPOT POWER", false, _rep_installed, func(ok: bool, inst: int):
				_rep_installed = maxi(_rep_installed, inst)
				if ok:
					_phase = "board_train"
					_rep_mk.visible = false
					_board_mk.visible = true
					AudioManager.play_sfx("unlock", 0.9)
					host.hud.show_stage_msg("TRAIN POWERED — BOARD AT NORTH PLATFORM!", 2.8)
					for pair in [[10, 7], [16, 7], [22, 7]]:
						host.spawn_robot("B", _map.cell_pos(pair[0], pair[1]), "ambush", false)
				else:
					_rearm_t = 2.0
			)
		elif _phase == "board_train" and Vector2(p.x - _board_pos.x, p.z - _board_pos.z).length() < 18.0:
			_enter_train_journey()

	elif _phase == "journey" or _phase == "boss":
		_step_train_scenery(dt)
		_journey_t += dt
		_wave_t -= dt
		if _phase == "journey":
			if _wave_t <= 0.0:
				_wave_t = 5.5
				var rx := randf_range(-42.0, 42.0)
				host.spawn_robot("B" if randf() < 0.5 else "C", Vector3(rx, 3.0, -10.0), "train_board", false)
			if _journey_t >= 18.0:
				_phase = "boss"
				_spawn_locomotive_boss()
		elif _phase == "boss":
			if _loco and is_instance_valid(_loco) and not _loco.is_dead:
				_loco.step_boss(dt, host.player.global_position)
				host.hud.show_boss_hud("IRON LOCOMOTIVE", _loco.hp, _loco.max_hp)
				# Kereta musuh sejajar di sebelah utara
				_enemy_consist.position.x = lerpf(_enemy_consist.position.x, host.player.global_position.x * 0.25, clampf(dt * 1.6, 0.0, 1.0))
				_loco.global_position.x = _enemy_consist.position.x + 12.0
			elif _loco and _loco.is_dead:
				_phase = "arrive"
				host.hud.hide_boss_hud()
				AudioManager.stop_all_loops()
				host.hud.show_stage_msg("LOCOMOTIVE DERAILED — ARRIVING AT BANDUNG!", 2.8)
				get_tree().create_timer(2.8).timeout.connect(func():
					if is_instance_valid(host) and _phase == "arrive":
						_phase = "complete"
						host.complete_stage(5)
				)


func _enter_train_journey() -> void:
	_phase = "journey"
	_journey_t = 0.0
	_wave_t = 1.5
	for r in host.robots:
		if is_instance_valid(r):
			r.queue_free()
	host.robots.clear()
	for m in host.crates:
		if is_instance_valid(m): m.queue_free()
	host.crates.clear()
	for b in host.barrels:
		if is_instance_valid(b): b.queue_free()
	host.barrels.clear()
	host.nav_grid = null
	_depot_root.visible = false

	_journey_root = Node3D.new(); _journey_root.name = "JourneyWorld"; add_child(_journey_root)
	# Tanah rel & bentang alam bergerak
	ProceduralBuilder.add_box(_journey_root, Vector3(1200, 1.0, 420), Pal.mat(Pal.PARK_GRASS), Vector3(0, -1.5, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_journey_root, Vector3(1200, 0.6, 120), Pal.mat(Pal.ASPHALT), Vector3(0, -0.3, -24), Vector3.ZERO, false)
	for i in 12:
		var chunk := Node3D.new()
		chunk.position = Vector3(-550.0 + float(i) * 100.0, 0.0, 0.0)
		ProceduralBuilder.add_box(chunk, Vector3(6, 1.0, 110), Pal.mat(Pal.WOOD), Vector3(0, 0.1, -24), Vector3.ZERO, false)
		ProceduralBuilder.add_cyl(chunk, 3.0, 4.0, 18.0, Pal.mat(Pal.LEAF), Vector3(0, 11.0, 75.0), Vector3.ZERO, 8)
		ProceduralBuilder.add_cyl(chunk, 3.0, 4.0, 18.0, Pal.mat(Pal.LEAF), Vector3(0, 11.0, -110.0), Vector3.ZERO, 8)
		_journey_root.add_child(chunk)
		_scenery_chunks.append(chunk)

	# Gerbong datar player (area gerak utama) + gerbong suplai
	_train_root = Node3D.new(); _train_root.name = "PlayerTrain"; _journey_root.add_child(_train_root)
	ProceduralBuilder.add_box(_train_root, Vector3(142, 3.0, 30), Pal.mat(Pal.GUNMETAL), Vector3(0, 1.5, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(_train_root, Vector3(138, 1.4, 2.2), Pal.mat(Pal.STEEL), Vector3(0, 3.5, -14.5))
	ProceduralBuilder.add_box(_train_root, Vector3(138, 1.4, 2.2), Pal.mat(Pal.STEEL), Vector3(0, 3.5, 14.5))
	ProceduralBuilder.add_box(_train_root, Vector3(65, 14, 26), Pal.mat(Pal.AMBER), Vector3(106, 8.0, 0))

	_enemy_consist = Node3D.new(); _enemy_consist.position = Vector3(-15, 0, -56); _journey_root.add_child(_enemy_consist)
	ProceduralBuilder.add_box(_enemy_consist, Vector3(90, 6.0, 26), Pal.mat(Pal.INK), Vector3(-55, 3.0, 0))

	host.spawn_crate(Vector3(-38, 3.0, -4))
	host.spawn_crate(Vector3(38, 3.0, 4))
	host.spawn_barrel(Vector3(0, 3.0, -8))

	host.player.global_position = Vector3(0, 3.0, 0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_loop("train", "train_loop", 0.55)
	host.hud.show_stage_msg("DEFEND THE EXPRESS TRAIN — BANDUNG BOUND!", 3.0)


func _step_train_scenery(dt: float) -> void:
	for c in _scenery_chunks:
		c.position.x -= 240.0 * dt
		if c.position.x < -600.0:
			c.position.x += 1200.0


func _spawn_locomotive_boss() -> void:
	_loco = LocomotiveBoss.new()
	_journey_root.add_child(_loco)
	_loco.global_position = Vector3(-3.0, 0.0, -56.0)
	_loco.turret_fired.connect(func(o, d, s, dmg):
		host.fx.spawn_enemy_bullet(o, d, s, dmg, 0.0, false, true)
	)
	_loco.mortar_salvo.connect(func(target: Vector3, count: int, dmg: float):
		for i in count:
			var t := Vector3(clampf(target.x + randf_range(-24, 24), -58, 58), 3.0, clampf(target.z + randf_range(-9, 9), -10, 10))
			host.fx.spawn_explosion(t, 20.0, dmg, Color.html("#ff5522"), true, "explode")
	)
	_loco.boarders_requested.connect(func(count: int):
		for i in count:
			host.spawn_robot("B" if i % 2 == 0 else "C", Vector3(randf_range(-35, 35), 3.0, -9.0), "boss_board", false)
	)
	_loco.defeated.connect(func():
		AchievementManager.record_boss("locomotive")
	)
	AudioManager.start_boss_music()


func handle_player_bullet(b: Dictionary) -> bool:
	if _phase == "boss" and _loco and is_instance_valid(_loco) and not _loco.is_dead:
		var p1: Vector3 = b["prev"]
		var p2: Vector3 = b["pos"]
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, _loco.global_position.x, _loco.global_position.z) <= 28.0 * 28.0:
			b["alive"] = false
			if not bool(b.get("probe_only", false)):
				GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
				_loco.take_damage(float(b.get("dmg", 0.0)))
				host.fx.spawn_burst(p2, 5, false)
			return true
	return false


func handle_explosion(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	if not is_enemy and _phase == "boss" and _loco and is_instance_valid(_loco) and not _loco.is_dead:
		if Vector2(center.x - _loco.global_position.x, center.z - _loco.global_position.z).length() <= radius + 24.0:
			_loco.take_damage(dmg)


func get_objective_text() -> String:
	match _phase:
		"hack_signal": return "STAGE 5 // SIGNAL TRACE AT EAST CONTROL ROOM"
		"repair_power": return "STAGE 5 // REPAIR NW POWER SUBSTATION"
		"board_train": return "STAGE 5 // BOARD BANDUNG EXPRESS AT NORTH TRACK"
		"journey": return "STAGE 5 // DEFEND MOVING TRAIN"
		"boss": return "STAGE 5 // DESTROY ARMED IRON LOCOMOTIVE"
		_: return "STAGE 5 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "hack_signal":
		return [{"x": _sig_pos.x, "z": _sig_pos.z, "color": Pal.AMBER, "size": 4.8, "clamp": true}]
	if _phase == "repair_power":
		return [{"x": _rep_pos.x, "z": _rep_pos.z, "color": Pal.TECH, "size": 4.8, "clamp": true}]
	if _phase == "board_train":
		return [{"x": _board_pos.x, "z": _board_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	if _phase == "boss" and _loco and not _loco.is_dead:
		return [{"x": _loco.global_position.x, "z": _loco.global_position.z, "color": Pal.HAZARD, "size": 5.5, "clamp": true}]
	return []


func is_walkable(x: float, z: float) -> bool:
	if _phase in ["journey", "boss", "arrive"]:
		return TRAIN_RECT.has_point(Vector2(x, z))
	return _map.is_walkable(x, z)


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	if _phase in ["journey", "boss", "arrive"]:
		pos.x = clampf(pos.x, TRAIN_RECT.position.x + radius, TRAIN_RECT.end.x - radius)
		pos.z = clampf(pos.z, TRAIN_RECT.position.y + radius, TRAIN_RECT.end.y - radius)
		return pos
	return _map.resolve(pos, radius, feet_y)


func ground_height(_x: float, _z: float, _cur_y: float) -> float:
	if _phase in ["journey", "boss", "arrive"]:
		return 3.0
	return 0.0


func is_bullet_blocked(b: Dictionary) -> bool:
	if _phase in ["journey", "boss", "arrive"]:
		return false
	return _map.bullet_blocked(b["prev"], b["pos"])
