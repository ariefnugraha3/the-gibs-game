extends CampaignStageBase

## Stage 1 — Menara Kantor Atas (50x50):
## Navigasi lantai gelap di balik barikade, buka akses pintu NAC lewat bank komputer '@',
## selesaikan ICE BREACH pada superkomputer, tahan gelombang alarm, dan ekstraksi lewat tangga awal.

const S1_MAP := [
	"##################################################",
	"#.......#....................#.........#.........#",
	"#.......#....................#.........#.........#",
	"#...................#........#...................#",
	"#...................#........#.........#.........#",
	"#.......#...........#........#.........#.........#",
	"#.......#...........#........#.........#.........#",
	"###..########...############.#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#............................#.........#.........#",
	"#............................#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"#.......#............#.......#.........#.........#",
	"###..####......#.....###############..###..#######",
	"#.......#......#.....#.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#.......#####..#..####.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#.......#......#.................................#",
	"#..............#.................................#",
	"#..............#.....#.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#.......#......#.....#.......#...................#",
	"#################################..###############",
	"#......................................#.........#",
	"#................................................#",
	"#................................................#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"###..#############################################",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"##################################################",
]

const S1_DOORS := [
	{"c0": 20, "r0": 1, "c1": 20, "r1": 2, "dir": "ew"},
	{"c0": 8, "r0": 3, "c1": 8, "r1": 4, "dir": "ew"},
	{"c0": 3, "r0": 7, "c1": 4, "r1": 7, "dir": "ns", "broken": true},
	{"c0": 13, "r0": 7, "c1": 15, "r1": 7, "dir": "ns", "broken": true},
	{"c0": 8, "r0": 11, "c1": 8, "r1": 12, "dir": "ew"},
	{"c0": 21, "r0": 11, "c1": 21, "r1": 12, "dir": "ew"},
	{"c0": 3, "r0": 17, "c1": 4, "r1": 17, "dir": "ns"},
	{"c0": 36, "r0": 17, "c1": 37, "r1": 17, "dir": "ns"},
	{"c0": 41, "r0": 17, "c1": 42, "r1": 17, "dir": "ns"},
	{"c0": 13, "r0": 20, "c1": 14, "r1": 20, "dir": "ns"},
	{"c0": 16, "r0": 20, "c1": 17, "r1": 20, "dir": "ns"},
	{"c0": 21, "r0": 23, "c1": 21, "r1": 24, "dir": "ew"},
	{"c0": 29, "r0": 23, "c1": 29, "r1": 24, "dir": "ew"},
	{"c0": 8, "r0": 24, "c1": 8, "r1": 25, "dir": "ew"},
	{"c0": 33, "r0": 29, "c1": 34, "r1": 29, "dir": "ns"},
	{"c0": 39, "r0": 31, "c1": 39, "r1": 32, "dir": "ew"},
	{"c0": 3, "r0": 39, "c1": 4, "r1": 39, "dir": "ns"},
	{"c0": 39, "r0": 43, "c1": 39, "r1": 45, "dir": "ew", "locked": true},
]

var _map: AsciiMapBuilder.BuiltMap
var _phase := "reach_access" # reach_access | reach_comp | extract | complete
var _nac_door: Dictionary = {}
var _access_pos := Vector3.ZERO
var _comp_pos := Vector3.ZERO
var _exit_pos := Vector3.ZERO
var _access_marker: MeshInstance3D
var _comp_marker: MeshInstance3D
var _exit_marker: MeshInstance3D
var _rearm_t := 0.0
var _radio_queue: Array = []
var _radio_t := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 1
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")

	var env := Node3D.new(); env.name = "Stage1Env"; add_child(env)
	_map = AsciiMapBuilder.build(env, S1_MAP, {
		"door_spans": S1_DOORS,
		"floor_color": Color.html("#22262e"),
		"wall_color": Color.html("#2d323c"),
		"wall_accent": Pal.TECH_DIM,
	})
	host.nav_grid = _map.nav
	_nac_door = _map.door_at(39, 44)

	# Barikade interior membelah jalur (sesuai S1_BARRICADES)
	for c in range(9, 21):
		_place_barricade(env, c, 13)
	for r in range(18, 25):
		_place_barricade(env, 39, r)
	for c in range(30, 40):
		_place_barricade(env, c, 25)
	_map.nav.build(_map.x0, _map.z0, _map.cell, _map.cols, _map.rows, func(wx: float, wz: float) -> bool:
		var cr := _map.world_to_cell(wx, wz)
		if _map.char_at(cr.x, cr.y) == "#":
			return false
		var res := NavGrid2D.resolve_blockers(Vector3(wx, 0, wz), 3.2, 0.0, _map.blockers)
		return (res["pos"] as Vector3).distance_to(Vector3(wx, 0, wz)) < 0.2
	)

	# Props landmark
	var st_mesh := PropFactory.build_stairwell(false)
	st_mesh.position = _map.cell_pos(3, 2)
	env.add_child(st_mesh)

	var lift := PropFactory.build_lift_bank()
	lift.position = _map.cell_pos(9, 18)
	env.add_child(lift)

	for r in range(30, 39, 2):
		var term := PropFactory.build_terminal(Pal.AMBER)
		term["root"].position = _map.cell_pos(48, r)
		term["root"].rotation.y = -PI * 0.5
		env.add_child(term["root"])

	var sup_term := PropFactory.build_terminal(Pal.TECH)
	sup_term["root"].position = _map.cell_pos(44, 41)
	sup_term["root"].scale = Vector3(1.5, 1.4, 1.4)
	env.add_child(sup_term["root"])

	_access_pos = _map.cell_pos(47, 34)
	_comp_pos = _map.cell_pos(44, 43)
	_exit_pos = _map.cell_pos(3, 2)

	_access_marker = PropFactory.build_stand_marker(Pal.AMBER, 13.0, 13.0)
	_access_marker.position = _access_pos + Vector3(0, 0.3, 0); env.add_child(_access_marker)

	_comp_marker = PropFactory.build_stand_marker(Pal.TECH, 13.0, 13.0)
	_comp_marker.position = _comp_pos + Vector3(0, 0.3, 0); _comp_marker.visible = false; env.add_child(_comp_marker)

	_exit_marker = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 24.0, 18.0)
	_exit_marker.position = _exit_pos + Vector3(0, 0.3, 0); _exit_marker.visible = false; env.add_child(_exit_marker)

	# Crates, barrels, dan patroli robot
	for pair in [[12, 4], [25, 10], [43, 5], [14, 22], [6, 34], [32, 36], [42, 46]]:
		host.spawn_crate(_map.cell_pos(pair[0], pair[1]))
	for pair in [[18, 9], [34, 15], [25, 22], [18, 34], [35, 36]]:
		host.spawn_barrel(_map.cell_pos(pair[0], pair[1]))

	var patrol := [
		["C", 14, 3], ["C", 24, 5], ["C", 34, 10], ["B", 44, 11],
		["C", 15, 18], ["B", 26, 18], ["C", 5, 25], ["B", 24, 33],
		["A", 35, 34], ["B", 44, 35], ["C", 14, 43], ["B", 28, 43], ["A", 43, 45],
	]
	for p in patrol:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "patrol", true)

	host.player.global_position = _map.cell_pos(4, 5)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 1 // TOWER INFILTRATION", 2.6)


func _place_barricade(parent: Node3D, c: int, r: int) -> void:
	var wp := _map.cell_pos(c, r)
	var b := PropFactory.build_furniture("rubble", _map.cell * 0.88, 7.0, _map.cell * 0.88)
	b.position = wp
	parent.add_child(b)
	_map.blockers.append(NavGrid2D.make_blocker(wp.x, wp.z, _map.cell * 0.45, _map.cell * 0.45, 12.0))


func step_stage(dt: float, _dt_real: float) -> void:
	_map.step_doors(dt, host.player.global_position, host.robots)
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle":
			if host.top_cam.is_point_in_view(r.global_position, 14.0):
				r.state = "chasing"

	if _rearm_t > 0.0:
		_rearm_t -= dt

	if not _radio_queue.is_empty():
		_radio_t -= dt
		if _radio_t <= 0.0:
			var item: Dictionary = _radio_queue.pop_front()
			host.hud.show_radio_dialogue(str(item.get("speaker", "GIBRAN")), str(item.get("text", "")))
			_radio_t = 3.2 if not _radio_queue.is_empty() else 3.6
			if _radio_queue.is_empty():
				get_tree().create_timer(3.6).timeout.connect(func():
					if is_instance_valid(host) and is_instance_valid(host.hud):
						host.hud.hide_radio_dialogue()
				)

	var p: Vector3 = host.player.global_position
	match _phase:
		"reach_access":
			if Vector2(p.x - _access_pos.x, p.z - _access_pos.z).length() < 12.0:
				PropFactory.set_door_locked(_nac_door, false)
				_phase = "reach_comp"
				_access_marker.visible = false
				_comp_marker.visible = true
				AudioManager.play_sfx("unlock", 0.8)
				host.hud.show_stage_msg("NAC SECURITY DOOR UNLOCKED", 2.4)
		"reach_comp":
			if _rearm_t <= 0.0 and Vector2(p.x - _comp_pos.x, p.z - _comp_pos.z).length() < 12.0:
				_rearm_t = 999.0
				host.open_ice_breach("ICE BREACH // NAC SERVER", func(ok: bool):
					if ok:
						_phase = "extract"
						_comp_marker.visible = false
						_exit_marker.visible = true
						_radio_queue = Config.dialogue_list("campaign.stage1.radio").duplicate()
						_radio_t = 0.0
						_spawn_alarm_horde()
						host.hud.show_stage_msg("DATA DOWNLOADED — EXTRACT TO STAIRWELL!", 3.2)
					else:
						_rearm_t = 2.0
				)
		"extract":
			if Vector2(p.x - _exit_pos.x, p.z - _exit_pos.z).length() < 20.0:
				_phase = "complete"
				host.complete_stage(1)


func _spawn_alarm_horde() -> void:
	for pair in [[12, 32], [20, 34], [28, 35], [10, 44], [6, 22], [18, 12]]:
		host.spawn_robot("B" if pair[0] > 18 else "C", _map.cell_pos(pair[0], pair[1]), "alarm", false)


func get_objective_text() -> String:
	match _phase:
		"reach_access": return "STAGE 1 // REACH TERMINAL BANK TO UNLOCK NAC SERVER"
		"reach_comp": return "STAGE 1 // BREACH NAC SUPERCOMPUTER"
		"extract": return "STAGE 1 // EXTRACT VIA ENTRY STAIRWELL"
		_: return "STAGE 1 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "reach_access":
		return [{"x": _access_pos.x, "z": _access_pos.z, "color": Pal.AMBER, "size": 4.5, "clamp": true}]
	if _phase == "reach_comp":
		return [{"x": _comp_pos.x, "z": _comp_pos.z, "color": Pal.TECH, "size": 4.5, "clamp": true}]
	return [{"x": _exit_pos.x, "z": _exit_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	return _map.is_walkable(x, z)


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	return _map.resolve(pos, radius, feet_y)


func is_bullet_blocked(b: Dictionary) -> bool:
	return _map.bullet_blocked(b["prev"], b["pos"])
