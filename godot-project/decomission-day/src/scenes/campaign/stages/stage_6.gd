extends CampaignStageBase

## Stage 6 — Terminal Bandung & Markas Operasi Bandung (2 Chapter):
## Chapter 1 (Arrival): Cari kunci akses di rak gudang, buka gerbang pembangkit, pulihkan 2 generator (FIELD REPAIR adv), lalu keluar ke Utara-Timur.
## Chapter 2 (Bandung HQ): Masuk kantor administratif, temukan kunci akses, Signal Trace di Server Terminal, upload tertahan 92% -> lockdown & hancurkan 2 fabricator -> ekstraksi selatan.

const S6_MAP := [
	"##################################################",
	"#..........................................FFFF..#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#.......................................#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#...###.......###.......###.......###...#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"#.......................................#........#",
	"###..#######################################..####",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"###..##########################..................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"#.............................#..................#",
	"##########################S#######################",
]

const HQ_MAP := [
	"##################################################",
	"#........#.............................#.........#",
	"#........#.............................#.........#",
	"#........#.............................#.........#",
	"#........#.............................#.........#",
	"#........##..#################.........#.........#",
	"#............................#.........#.........#",
	"#............................#...................#",
	"#............................#.........#.........#",
	"#............................#.........#.........#",
	"#.....................#......#.........#.........#",
	"#.....................#......#.........#.........#",
	"#.....................#......#.........#.........#",
	"#.....................###..#######################",
	"#.....................#..........................#",
	"#.....................#..........................#",
	"#.....................#..........................#",
	"#.....................#..........................#",
	"#.....................#....##############........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#.....................#....#............#........#",
	"#######################....##########..##........#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#.........###..###################################",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......=.............#.................#",
	"#.........#......=.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#.............#.................#",
	"#.........#......#......S......#.................#",
	"#######################====#######################",
]

var _map: AsciiMapBuilder.BuiltMap
var _env: Node3D
var _phase := "key" # Ch1: key | gens | exit | Ch2: hq_key | hq_trace | hq_upload | hq_lockdown | hq_exfil | complete
var _has_key := false
var _locked_door: Dictionary = {}
var _key_pos := Vector3.ZERO
var _key_node: Node3D
var _gens: Array[Dictionary] = []
var _exit_pos := Vector3.ZERO
var _exit_mk: MeshInstance3D

# Chapter 2 state
var _hq_trace_pos := Vector3.ZERO
var _hq_upload_pos := Vector3.ZERO
var _hq_exfil_pos := Vector3.ZERO
var _hq_trace_mk: MeshInstance3D
var _hq_upload_mk: MeshInstance3D
var _hq_exfil_mk: MeshInstance3D
var _hq_machines: Array[SpawnMachine] = []
var _upload_pct := 0.0
var _rearm_t := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 6
	if chapter >= 2:
		_enter_chapter_hq()
	else:
		_enter_chapter_arrival()


func _reset_env(title: String) -> void:
	if _env and is_instance_valid(_env):
		_env.queue_free()
	for r in host.robots:
		if is_instance_valid(r): r.queue_free()
	host.robots.clear()
	for m in host.machines:
		if is_instance_valid(m): m.queue_free()
	host.machines.clear()
	for c in host.crates:
		if is_instance_valid(c): c.queue_free()
	host.crates.clear()
	for b in host.barrels:
		if is_instance_valid(b): b.queue_free()
	host.barrels.clear()
	_gens.clear()
	_hq_machines.clear()

	_env = Node3D.new(); _env.name = title; add_child(_env)
	CityscapeBuilder.build_skyline_ring(_env, Vector3.ZERO, 740.0, 1450.0, 32)


func _enter_chapter_arrival() -> void:
	chapter = 1
	_phase = "key"
	_has_key = false
	ProceduralBuilder.setup_lighting(host.world_root, "night")
	_reset_env("Stage6Arrival")

	_map = AsciiMapBuilder.build(_env, S6_MAP, {
		"door_spans": [
			{"c0": 3, "r0": 35, "c1": 4, "r1": 35, "dir": "ns"},
			{"c0": 3, "r0": 43, "c1": 4, "r1": 43, "dir": "ns"},
			{"c0": 44, "r0": 35, "c1": 45, "r1": 35, "dir": "ns", "locked": true},
		],
		"floor_color": Color.html("#22262e"),
		"wall_color": Color.html("#313742"),
		"wall_accent": Pal.TECH_DIM,
	})
	host.nav_grid = _map.nav
	_locked_door = _map.door_at(44, 35)
	PropFactory.set_door_locked(_locked_door, true)

	_key_pos = _map.cell_pos(2, 7)
	_key_node = Node3D.new(); _key_node.position = _key_pos; _env.add_child(_key_node)
	ProceduralBuilder.add_box(_key_node, Vector3(3.5, 1.2, 5.2), Pal.mat(Pal.AMBER, Pal.AMBER, 1.1, 0.2, 0.4, false, 1.0, true), Vector3(0, 2.5, 0), Vector3.ZERO, false)

	for i in 2:
		var gx := 34.0 + float(i) * 8.0
		var gp := _map.cell_pos(gx, 41.0)
		var gmesh := PropFactory.build_generator(); gmesh.position = gp; _env.add_child(gmesh)
		var stand := _map.cell_pos(gx, 43.2)
		var mk := PropFactory.build_stand_marker(Pal.TECH, 12.0, 12.0)
		mk.position = stand + Vector3(0, 0.3, 0); _env.add_child(mk)
		_gens.append({"pos": stand, "done": false, "marker": mk, "installed": 0})

	_exit_pos = _map.cell_pos(44.5, 1.8)
	_exit_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 22.0, 14.0)
	_exit_mk.position = _exit_pos + Vector3(0, 0.3, 0); _exit_mk.visible = false; _env.add_child(_exit_mk)

	for pr in [[10, 4], [24, 14], [14, 24], [16, 40], [36, 20]]:
		host.spawn_crate(_map.cell_pos(pr[0], pr[1]))
	for pr in [[8, 12], [22, 22], [32, 12], [12, 38], [38, 30]]:
		host.spawn_barrel(_map.cell_pos(pr[0], pr[1]))
	for p in [["C", 14, 38], ["B", 16, 20], ["C", 28, 12], ["B", 10, 8], ["A", 34, 22], ["B", 42, 42]]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "arr", true)

	host.player.global_position = _map.cell_pos(26, 47)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 6 CH1 // FIND SECURITY KEY TO POWER ROOM", 2.8)


func _enter_chapter_hq() -> void:
	chapter = 2
	_phase = "hq_key"
	_has_key = false
	_upload_pct = 0.0
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")
	_reset_env("Stage6HQ")

	_map = AsciiMapBuilder.build(_env, HQ_MAP, {
		"door_spans": [
			{"c0": 11, "r0": 5, "c1": 12, "r1": 5, "dir": "ns"},
			{"c0": 25, "r0": 13, "c1": 26, "r1": 13, "dir": "ns", "locked": true},
			{"c0": 37, "r0": 28, "c1": 38, "r1": 28, "dir": "ns"},
			{"c0": 13, "r0": 35, "c1": 14, "r1": 35, "dir": "ns"},
		],
		"floor_color": Color.html("#1e232b"),
		"wall_color": Color.html("#2b323e"),
		"wall_accent": Pal.TECH,
	})
	host.nav_grid = _map.nav
	_locked_door = _map.door_at(25, 13)
	PropFactory.set_door_locked(_locked_door, true)

	_key_pos = _map.cell_pos(16, 4)
	_key_node = Node3D.new(); _key_node.position = _key_pos; _env.add_child(_key_node)
	ProceduralBuilder.add_box(_key_node, Vector3(3.5, 1.2, 5.2), Pal.mat(Pal.AMBER, Pal.AMBER, 1.1, 0.2, 0.4, false, 1.0, true), Vector3(0, 2.5, 0), Vector3.ZERO, false)

	var term_t := PropFactory.build_terminal(Pal.TECH); term_t["root"].position = _map.cell_pos(38, 22); _env.add_child(term_t["root"])
	var up_t := PropFactory.build_terminal(Pal.AMBER); up_t["root"].position = _map.cell_pos(45, 5); _env.add_child(up_t["root"])

	_hq_trace_pos = _map.cell_pos(36.5, 22.0)
	_hq_upload_pos = _map.cell_pos(45.0, 7.0)
	_hq_exfil_pos = _map.cell_pos(24.5, 47.0)

	_hq_trace_mk = PropFactory.build_stand_marker(Pal.TECH, 13.0, 13.0); _hq_trace_mk.position = _hq_trace_pos + Vector3(0, 0.3, 0); _hq_trace_mk.visible = false; _env.add_child(_hq_trace_mk)
	_hq_upload_mk = PropFactory.build_stand_marker(Pal.AMBER, 13.0, 13.0); _hq_upload_mk.position = _hq_upload_pos + Vector3(0, 0.3, 0); _hq_upload_mk.visible = false; _env.add_child(_hq_upload_mk)
	_hq_exfil_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 20.0, 16.0); _hq_exfil_mk.position = _hq_exfil_pos + Vector3(0, 0.3, 0); _hq_exfil_mk.visible = false; _env.add_child(_hq_exfil_mk)

	for mpos in [[15, 31], [34, 31]]:
		var m: SpawnMachine = host.spawn_machine(_map.cell_pos(mpos[0], mpos[1]), 7.5, 3, 6)
		m.active = false
		_hq_machines.append(m)

	for pr in [[15, 16], [30, 16], [24, 32], [43, 39], [6, 20]]:
		host.spawn_crate(_map.cell_pos(pr[0], pr[1]))
	for pr in [[10, 10], [32, 10], [22, 31], [40, 17]]:
		host.spawn_barrel(_map.cell_pos(pr[0], pr[1]))
	for p in [["C", 14, 24], ["B", 34, 24], ["B", 16, 8], ["A", 42, 16], ["C", 24, 31]]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "hq", true)

	host.player.global_position = _hq_exfil_pos
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 6 CH2 // BANDUNG HQ — RECOVER ROOT ACCESS", 2.8)


func step_stage(dt: float, _dt_real: float) -> void:
	_map.step_doors(dt, host.player.global_position, host.robots)
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 14.0):
			r.state = "chasing"

	if _rearm_t > 0.0:
		_rearm_t -= dt

	var p: Vector3 = host.player.global_position
	if chapter == 1:
		if _key_node and _key_node.visible:
			_key_node.rotation.y += dt * 2.2
			if Vector2(p.x - _key_pos.x, p.z - _key_pos.z).length() < 11.0:
				_key_node.visible = false
				_has_key = true
				PropFactory.set_door_locked(_locked_door, false)
				_phase = "gens"
				AudioManager.play_sfx("pickup", 0.85)
				host.hud.show_stage_msg("KEY FOUND — REPAIR BOTH SUBSTATION GENERATORS!", 2.8)
		elif _phase == "gens" and _rearm_t <= 0.0:
			var all_done := true
			for i in _gens.size():
				var g: Dictionary = _gens[i]
				if not bool(g["done"]):
					all_done = false
					if Vector2(p.x - g["pos"].x, p.z - g["pos"].z).length() < 12.0:
						_rearm_t = 999.0
						host.open_field_repair("FIELD REPAIR // STATION GEN %d" % (i + 1), true, int(g["installed"]), func(ok: bool, inst: int):
							g["installed"] = maxi(int(g["installed"]), inst)
							if ok:
								g["done"] = true
								g["marker"].visible = false
								AudioManager.play_sfx("unlock", 0.85)
								for s in [[42, 22], [28, 18]]:
									host.spawn_robot("B", _map.cell_pos(s[0], s[1]), "gen_wave", false)
							_rearm_t = 2.0
						)
						break
			if all_done:
				_phase = "exit"
				_exit_mk.visible = true
				host.hud.show_stage_msg("POWER RESTORED — ADVANCE TO BANDUNG HQ!", 2.8)
		elif _phase == "exit" and Vector2(p.x - _exit_pos.x, p.z - _exit_pos.z).length() < 18.0:
			_enter_chapter_hq()
	else:
		if _phase == "hq_key" and _key_node and _key_node.visible:
			_key_node.rotation.y += dt * 2.2
			if Vector2(p.x - _key_pos.x, p.z - _key_pos.z).length() < 11.0:
				_key_node.visible = false
				PropFactory.set_door_locked(_locked_door, false)
				_phase = "hq_trace"
				_hq_trace_mk.visible = true
				AudioManager.play_sfx("pickup", 0.85)
				host.hud.show_stage_msg("SECURITY KEY ACQUIRED — ACCESS SIGNAL TERMINAL!", 2.8)
		elif _phase == "hq_trace" and _rearm_t <= 0.0 and Vector2(p.x - _hq_trace_pos.x, p.z - _hq_trace_pos.z).length() < 12.0:
			_rearm_t = 999.0
			host.open_signal_trace("SIGNAL TRACE // HQ RELAY", func(ok: bool):
				if ok:
					_phase = "hq_upload"
					_hq_trace_mk.visible = false
					_hq_upload_mk.visible = true
					host.hud.show_stage_msg("SERVER READY — INITIATE UPLOAD AT NE TERMINAL!", 2.8)
				_rearm_t = 2.0
			)
		elif _phase == "hq_upload":
			if Vector2(p.x - _hq_upload_pos.x, p.z - _hq_upload_pos.z).length() < 14.0:
				_upload_pct = minf(92.0, _upload_pct + dt * 22.0)
				host.hud.show_progress_bar("UPLOADING KILL-SWITCH", _upload_pct)
				if _upload_pct >= 92.0:
					_phase = "hq_lockdown"
					_hq_upload_mk.visible = false
					host.hud.hide_progress_bar()
					for m in _hq_machines:
						m.activate_machine(1.5)
					host.hud.show_stage_msg("92% STALL — ACCESS DENIED BY IKN! DESTROY LOCKDOWN FABRICATORS!", 3.5)
					host.hud.show_radio_dialogue("HQ ANALYST", "The core node relocated to Kalimantan IKN! Clear both fabricators and pull out!")
		elif _phase == "hq_lockdown":
			var wrecked_all := true
			for m in _hq_machines:
				if is_instance_valid(m) and not m.wrecked:
					wrecked_all = false
					break
			if wrecked_all:
				_phase = "hq_exfil"
				_hq_exfil_mk.visible = true
				host.hud.hide_radio_dialogue()
				host.hud.show_stage_msg("LOCKDOWN BROKEN — EXFIL SOUTH!", 2.8)
		elif _phase == "hq_exfil" and Vector2(p.x - _hq_exfil_pos.x, p.z - _hq_exfil_pos.z).length() < 16.0:
			_phase = "complete"
			host.complete_stage(6)


func get_objective_text() -> String:
	match _phase:
		"key": return "STAGE 6 CH1 // FIND SECURITY KEYCARD"
		"gens": return "STAGE 6 CH1 // REPAIR BOTH GENERATORS"
		"exit": return "STAGE 6 CH1 // EXIT TO BANDUNG HQ"
		"hq_key": return "STAGE 6 CH2 // RECOVER NW WING KEYCARD"
		"hq_trace": return "STAGE 6 CH2 // DECRYPT SERVER RELAY"
		"hq_upload": return "STAGE 6 CH2 // UPLOAD PAYLOAD AT SERVER (%d%%)" % roundi(_upload_pct)
		"hq_lockdown": return "STAGE 6 CH2 // DESTROY LOCKDOWN FABRICATORS"
		"hq_exfil": return "STAGE 6 CH2 // EXFIL SOUTH ENTRANCE"
		_: return "STAGE 6 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	match _phase:
		"key", "hq_key":
			return [{"x": _key_pos.x, "z": _key_pos.z, "color": Pal.AMBER, "size": 4.8, "clamp": true}]
		"gens":
			var out: Array[Dictionary] = []
			for g in _gens:
				if not bool(g["done"]): out.append({"x": g["pos"].x, "z": g["pos"].z, "color": Pal.TECH, "size": 4.8, "clamp": true})
			return out
		"exit":
			return [{"x": _exit_pos.x, "z": _exit_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
		"hq_trace":
			return [{"x": _hq_trace_pos.x, "z": _hq_trace_pos.z, "color": Pal.TECH, "size": 4.8, "clamp": true}]
		"hq_upload":
			return [{"x": _hq_upload_pos.x, "z": _hq_upload_pos.z, "color": Pal.AMBER, "size": 4.8, "clamp": true}]
		"hq_lockdown":
			var out: Array[Dictionary] = []
			for m in _hq_machines:
				if is_instance_valid(m) and not m.wrecked:
					out.append({"x": m.global_position.x, "z": m.global_position.z, "color": Pal.HAZARD, "size": 5.0, "clamp": true})
			return out
		"hq_exfil":
			return [{"x": _hq_exfil_pos.x, "z": _hq_exfil_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	return []


func is_walkable(x: float, z: float) -> bool:
	return _map.is_walkable(x, z)


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	return _map.resolve(pos, radius, feet_y)


func is_bullet_blocked(b: Dictionary) -> bool:
	return _map.bullet_blocked(b["prev"], b["pos"])
