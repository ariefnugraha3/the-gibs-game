extends CampaignStageBase

## Stage 2 — Kantor Menuju Lift Evakuasi (50x50):
## Kumpulkan komponen suku cadang di Gudang Selatan (wire, chip, valve),
## selesaikan minigame FIELD REPAIR di Generator Ruang Timur-Laut untuk menyalakan Lift Barat.

const S2_MAP := [
	"##################################################",
	"#.......#........#.....................#.........#",
	"#.......#........#.....................#.........#",
	"#.......#........#.........#...........#.........#",
	"#.......#..................#...........#.........#",
	"#.......#..................#...........#.........#",
	"#.......#........#####################.####..#####",
	"#.............................#........#.........#",
	"#.............................#........#.........#",
	"######..#.....................#........#.........#",
	"#.......#.....................#........#.........#",
	"#......................................#.........#",
	"#......................................#.........#",
	"#.......#.....................#........#.........#",
	"#.......#.....................#........#.........#",
	"#.......#....#................#........#.........#",
	"#.......#....#................#........#.........#",
	"#.......#....#................#........#.........#",
	"#.......#....###########################.........#",
	"#.......#....#.........................#.........#",
	"#..###########.........................#.........#",
	"#............#.............#...........#.........#",
	"#............#.............#...........#.........#",
	"#..........................#...........#.........#",
	"#..........................#...........#.........#",
	"#............#.............#...........#.........#",
	"#............#.............#...........#.........#",
	"#............#.............#.....................#",
	"#............#.............#.....................#",
	"############################################..####",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"#................................................#",
	"##################################################",
]

const S2_DOORS := [
	{"c0": 43, "r0": 6, "c1": 44, "r1": 6, "dir": "ns"},
	{"c0": 17, "r0": 4, "c1": 17, "r1": 5, "dir": "ew"},
	{"c0": 6, "r0": 9, "c1": 7, "r1": 9, "dir": "ns", "broken": true},
	{"c0": 8, "r0": 11, "c1": 8, "r1": 12, "dir": "ew"},
	{"c0": 30, "r0": 11, "c1": 30, "r1": 12, "dir": "ew"},
	{"c0": 27, "r0": 19, "c1": 27, "r1": 20, "dir": "ew"},
	{"c0": 1, "r0": 20, "c1": 2, "r1": 20, "dir": "ns"},
	{"c0": 13, "r0": 23, "c1": 13, "r1": 24, "dir": "ew"},
	{"c0": 39, "r0": 27, "c1": 39, "r1": 28, "dir": "ew"},
	{"c0": 44, "r0": 29, "c1": 45, "r1": 29, "dir": "ns"},
]

var _map: AsciiMapBuilder.BuiltMap
var _phase := "collect" # collect | restore | done | complete
var _parts_nodes: Array[Dictionary] = []
var _parts_collected := 0
var _installed_parts := 0
var _gen_pos := Vector3.ZERO
var _lift_pos := Vector3.ZERO
var _gen_marker: MeshInstance3D
var _lift_marker: MeshInstance3D
var _rearm_t := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 2
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")

	var env := Node3D.new(); env.name = "Stage2Env"; add_child(env)
	_map = AsciiMapBuilder.build(env, S2_MAP, {
		"door_spans": S2_DOORS,
		"floor_color": Color.html("#22252d"),
		"wall_color": Color.html("#2e333e"),
		"wall_accent": Pal.AMBER_DIM,
	})
	host.nav_grid = _map.nav

	# Rak gudang di S2_SHELF_COLS
	for col in [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45]:
		for row in [35, 39, 43]:
			var rp := _map.cell_pos(col, row)
			var shelf := PropFactory.build_furniture("rack", _map.cell * 0.85, 11.0, _map.cell * 1.4)
			shelf.position = rp
			env.add_child(shelf)
			_map.blockers.append(NavGrid2D.make_blocker(rp.x, rp.z, _map.cell * 0.44, _map.cell * 0.72, 14.0))

	var lift := PropFactory.build_lift_bank()
	lift.position = _map.cell_pos(9.5, 17.0)
	lift.rotation.y = PI * 0.5
	env.add_child(lift)

	var gen := PropFactory.build_generator()
	gen.position = _map.cell_pos(44, 1.8)
	env.add_child(gen)

	_gen_pos = _map.cell_pos(44, 3)
	_lift_pos = _map.cell_pos(10.5, 17.0)

	_gen_marker = PropFactory.build_stand_marker(Pal.AMBER, 13.0, 13.0)
	_gen_marker.position = _gen_pos + Vector3(0, 0.3, 0); _gen_marker.visible = false; env.add_child(_gen_marker)

	_lift_marker = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 18.0, 22.0)
	_lift_marker.position = _lift_pos + Vector3(0, 0.3, 0); _lift_marker.visible = false; env.add_child(_lift_marker)

	# 3 Komponen di gudang
	var part_locs := [
		["Wiring Harness", Vector2i(11, 37)],
		["Control Chip", Vector2i(27, 41)],
		["Pressure Valve", Vector2i(39, 45)],
	]
	for pl in part_locs:
		var wp := _map.cell_pos(pl[1].x, pl[1].y)
		var mesh := ProceduralBuilder.add_box(env, Vector3(4.0, 2.6, 4.0), Pal.mat(Pal.AMBER, Pal.AMBER, 0.9, 0.25, 0.6), wp + Vector3(0, 2.2, 0), Vector3(0, 45, 0), false)
		_parts_nodes.append({"name": pl[0], "pos": wp, "node": mesh, "taken": false})

	for pair in [[22, 3], [35, 3], [16, 14], [24, 24], [7, 35], [23, 35], [35, 43]]:
		host.spawn_crate(_map.cell_pos(pair[0], pair[1]))
	for pair in [[12, 12], [26, 15], [34, 22], [15, 38], [31, 38], [43, 36]]:
		host.spawn_barrel(_map.cell_pos(pair[0], pair[1]))

	for p in [
		["C", 20, 4], ["C", 34, 4], ["B", 18, 13], ["C", 25, 13],
		["B", 18, 24], ["C", 33, 24], ["B", 11, 34], ["A", 23, 36],
		["B", 35, 36], ["C", 19, 44], ["A", 35, 44],
	]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "guard", true)

	host.player.global_position = _map.cell_pos(5, 2)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 2 // SCAVENGE PARTS IN SOUTH WAREHOUSE", 2.8)


func step_stage(dt: float, _dt_real: float) -> void:
	_map.step_doors(dt, host.player.global_position, host.robots)
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle":
			if host.top_cam.is_point_in_view(r.global_position, 14.0):
				r.state = "chasing"

	if _rearm_t > 0.0:
		_rearm_t -= dt

	var p: Vector3 = host.player.global_position
	for pt in _parts_nodes:
		if not bool(pt["taken"]):
			var n: MeshInstance3D = pt["node"]
			n.rotation.y += dt * 2.4
			if Vector2(p.x - pt["pos"].x, p.z - pt["pos"].z).length() < 11.0:
				pt["taken"] = true
				n.visible = false
				_parts_collected += 1
				AudioManager.play_sfx("pickup", 0.85)
				host.hud.show_pickup("%s ACQUIRED (%d/3)" % [pt["name"], _parts_collected], Pal.AMBER)
				if _parts_collected >= 3:
					_phase = "restore"
					_gen_marker.visible = true
					host.hud.show_stage_msg("ALL PARTS FOUND — RESTORE NE GENERATOR!", 2.8)

	if _phase == "restore" and _rearm_t <= 0.0 and Vector2(p.x - _gen_pos.x, p.z - _gen_pos.z).length() < 12.0:
		_rearm_t = 999.0
		host.open_field_repair("FIELD REPAIR // BACKUP GENERATOR", false, _installed_parts, func(ok: bool, inst: int):
			_installed_parts = maxi(_installed_parts, inst)
			if ok:
				_phase = "done"
				_gen_marker.visible = false
				_lift_marker.visible = true
				AudioManager.play_sfx("unlock", 0.9)
				host.hud.show_stage_msg("GENERATOR ONLINE — REACH WEST LIFT BANK!", 3.0)
				_spawn_reinforcements()
			else:
				_rearm_t = 2.0
		)
	elif _phase == "done" and Vector2(p.x - _lift_pos.x, p.z - _lift_pos.z).length() < 16.0:
		_phase = "complete"
		host.complete_stage(2)


func _spawn_reinforcements() -> void:
	for pair in [[18, 12], [24, 15], [34, 22], [18, 25], [14, 34]]:
		host.spawn_robot("B" if pair[0] > 20 else "C", _map.cell_pos(pair[0], pair[1]), "reinf", false)


func get_objective_text() -> String:
	match _phase:
		"collect": return "STAGE 2 // WAREHOUSE PARTS %d/3" % _parts_collected
		"restore": return "STAGE 2 // REPAIR GENERATOR (NE ROOM)"
		"done": return "STAGE 2 // BOARD ELEVATOR LIFT"
		_: return "STAGE 2 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "collect":
		var out: Array[Dictionary] = []
		for pt in _parts_nodes:
			if not bool(pt["taken"]):
				out.append({"x": pt["pos"].x, "z": pt["pos"].z, "color": Pal.AMBER, "size": 4.0, "clamp": true})
		return out
	if _phase == "restore":
		return [{"x": _gen_pos.x, "z": _gen_pos.z, "color": Pal.AMBER, "size": 4.8, "clamp": true}]
	return [{"x": _lift_pos.x, "z": _lift_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	return _map.is_walkable(x, z)


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	return _map.resolve(pos, radius, feet_y)


func is_bullet_blocked(b: Dictionary) -> bool:
	return _map.bullet_blocked(b["prev"], b["pos"])
