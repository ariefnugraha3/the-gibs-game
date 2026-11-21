extends CampaignStageBase

## Stage 3 — Pabrik Robot & Ruang Fabrikasi (40x40):
## Hack 3 terminal urutan via ICE BREACH untuk membuka Pintu Blast Selatan,
## hancurkan 2 mesin fabrikasi yang muncul di ruang selatan, lalu capai pintu keluar.

const S3_MAP := [
	"########################################",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#..........#........#",
	"#......#...........#####..#######......#",
	"#......................................#",
	"#......................................#",
	"#########.....#..............#..########",
	"#.............#..............#..#......#",
	"#.............#..............#..#......#",
	"#.......#.....#..............#..#......#",
	"#.......#..............................#",
	"#.......#..............................#",
	"#.......#.....#..............#..#......#",
	"#.......#.....#..............#..#......#",
	"#.......#.....#..............#..#......#",
	"############..#..............#..########",
	"#......................................#",
	"#......................................#",
	"#..........#....................#......#",
	"#..........#....................#......#",
	"#..........#....................#......#",
	"#..........#....................#......#",
	"#..........#....................#......#",
	"#..........#....................#......#",
	"##################....##################",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"#......................................#",
	"##################....##################",
]

const S3_DOORS := [
	{"c0": 24, "r0": 8, "c1": 25, "r1": 8, "dir": "ns"},
	{"c0": 32, "r0": 9, "c1": 32, "r1": 10, "dir": "ew"},
	{"c0": 8, "r0": 12, "c1": 8, "r1": 13, "dir": "ew"},
	{"c0": 32, "r0": 15, "c1": 32, "r1": 16, "dir": "ew"},
	{"c0": 12, "r0": 20, "c1": 13, "r1": 20, "dir": "ns"},
	{"c0": 18, "r0": 29, "c1": 21, "r1": 29, "dir": "ns", "locked": true},
]

var _map: AsciiMapBuilder.BuiltMap
var _phase := "hack" # hack | machines | done | complete
var _blast_door: Dictionary = {}
var _term_seq: Array[Dictionary] = []
var _term_idx := 0
var _machines: Array[SpawnMachine] = []
var _exit_pos := Vector3.ZERO
var _exit_marker: MeshInstance3D
var _rearm_t := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 3
	ProceduralBuilder.setup_lighting(host.world_root, "indoor")

	var env := Node3D.new(); env.name = "Stage3Env"; add_child(env)
	_map = AsciiMapBuilder.build(env, S3_MAP, {
		"door_spans": S3_DOORS,
		"floor_color": Color.html("#1f242c"),
		"wall_color": Color.html("#2d333d"),
		"wall_accent": Pal.HAZARD_DIM,
	})
	host.nav_grid = _map.nav
	_blast_door = _map.door_at(19, 29)

	var lift := PropFactory.build_lift_bank()
	lift.position = _map.cell_pos(10, 15)
	env.add_child(lift)

	_exit_pos = _map.cell_pos(19.5, 38.0)
	_exit_marker = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 30.0, 18.0)
	_exit_marker.position = _exit_pos + Vector3(0, 0.3, 0); _exit_marker.visible = false; env.add_child(_exit_marker)

	# 5 Terminal fisik -> acak 3 yang aktif
	var term_defs := [
		{"room": "Room C", "c": 24, "r": 1, "sc": 24.5, "sr": 2.5},
		{"room": "Room D", "c": 34, "r": 1, "sc": 34.5, "sr": 2.5},
		{"room": "West Wing", "c": 3, "r": 12, "sc": 3.5, "sr": 13.5},
		{"room": "East Wing", "c": 35, "r": 12, "sc": 35.5, "sr": 13.5},
		{"room": "Supply", "c": 2, "r": 28, "sc": 2.5, "sr": 26.8},
	]
	var idxs := [0, 1, 2, 3, 4]
	idxs.shuffle()
	var need := mini(5, int(Config.stage_cfg(3).get("hackRequired", 3)))
	var chosen := idxs.slice(0, need)

	for i in term_defs.size():
		var td: Dictionary = term_defs[i]
		var t := PropFactory.build_terminal(Pal.EYE_RED)
		t["root"].position = _map.cell_pos(td["c"], td["r"])
		env.add_child(t["root"])
		if i in chosen:
			var stand := _map.cell_pos(td["sc"], td["sr"])
			var mk := PropFactory.build_stand_marker(Pal.EXIT_GREEN, 12.0, 12.0)
			mk.position = stand + Vector3(0, 0.3, 0); mk.visible = false; env.add_child(mk)
			_term_seq.append({"room": td["room"], "pos": stand, "mat": t["screen_mat"], "marker": mk})

	_refresh_terminal_colors()

	# 2 Mesin pembuat robot (aktif setelah Pintu Blast terbuka)
	for mpos in [[3.5, 33.5], [36.5, 33.5]]:
		var m: SpawnMachine = host.spawn_machine(_map.cell_pos(mpos[0], mpos[1]), 8.0, 3, 6)
		m.active = false
		_machines.append(m)

	for pair in [[14, 5], [26, 6], [6, 23], [22, 24], [19, 34]]:
		host.spawn_crate(_map.cell_pos(pair[0], pair[1]))
	for pair in [[15, 14], [25, 16], [19, 25], [10, 34], [29, 34]]:
		host.spawn_barrel(_map.cell_pos(pair[0], pair[1]))

	for p in [["C", 22, 4], ["B", 34, 5], ["C", 5, 14], ["B", 35, 14], ["B", 18, 23], ["A", 26, 25]]:
		host.spawn_robot(p[0], _map.cell_pos(p[1], p[2]), "guard", true)

	host.player.global_position = _map.cell_pos(10, 16)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 3 // HACK TERMINALS TO UNLOCK BLAST DOOR", 2.8)


func _refresh_terminal_colors() -> void:
	for i in _term_seq.size():
		var t: Dictionary = _term_seq[i]
		var mat: StandardMaterial3D = t["mat"]
		var mk: MeshInstance3D = t["marker"]
		if i < _term_idx:
			mat.albedo_color = Pal.AMBER; mat.emission = Pal.AMBER; mk.visible = false
		elif i == _term_idx and _phase == "hack":
			mat.albedo_color = Pal.EXIT_GREEN; mat.emission = Pal.EXIT_GREEN; mk.visible = true
		else:
			mat.albedo_color = Pal.EYE_RED; mat.emission = Pal.EYE_RED; mk.visible = false


func step_stage(dt: float, _dt_real: float) -> void:
	_map.step_doors(dt, host.player.global_position, host.robots)
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle":
			if host.top_cam.is_point_in_view(r.global_position, 14.0):
				r.state = "chasing"

	if _rearm_t > 0.0:
		_rearm_t -= dt

	var p: Vector3 = host.player.global_position
	if _phase == "hack" and _term_idx < _term_seq.size() and _rearm_t <= 0.0:
		var cur: Dictionary = _term_seq[_term_idx]
		if Vector2(p.x - cur["pos"].x, p.z - cur["pos"].z).length() < 12.0:
			_rearm_t = 999.0
			host.open_ice_breach("ICE BREACH // %s" % cur["room"], func(ok: bool):
				if ok:
					_term_idx += 1
					_spawn_gate_wave()
					if _term_idx >= _term_seq.size():
						_phase = "machines"
						PropFactory.set_door_locked(_blast_door, false)
						for m in _machines:
							m.activate_machine(2.2)
						host.hud.show_stage_msg("BLAST DOOR OPEN — DESTROY BOTH FABRICATORS!", 3.2)
					_refresh_terminal_colors()
				_rearm_t = 2.0
			)
	elif _phase == "machines":
		var all_wrecked := true
		for m in _machines:
			if is_instance_valid(m) and not m.wrecked:
				all_wrecked = false
				break
		if all_wrecked:
			var alive_bots := 0
			for r in host.robots:
				if is_instance_valid(r) and r.state != "dead":
					alive_bots += 1
			if alive_bots == 0:
				_phase = "done"
				_exit_marker.visible = true
				AudioManager.play_sfx("unlock", 0.9)
				host.hud.show_stage_msg("FABRICATORS CLEARED — EXIT SOUTH!", 2.8)
	elif _phase == "done":
		if Vector2(p.x - _exit_pos.x, p.z - _exit_pos.z).length() < 18.0:
			_phase = "complete"
			host.complete_stage(3)


func _spawn_gate_wave() -> void:
	for i in 4:
		host.spawn_robot("C" if i < 2 else "B", _map.cell_pos(4 + i, 6), "wave", false)
		host.spawn_robot("B" if i < 2 else "A", _map.cell_pos(10 + i * 0.5, 19), "wave", false)


func get_objective_text() -> String:
	match _phase:
		"hack": return "STAGE 3 // HACK TERMINALS (%d/%d)" % [_term_idx, _term_seq.size()]
		"machines": return "STAGE 3 // DESTROY FABRICATORS & CLEAR HALL"
		"done": return "STAGE 3 // PROCEED TO SOUTH EXIT"
		_: return "STAGE 3 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "hack" and _term_idx < _term_seq.size():
		var t: Dictionary = _term_seq[_term_idx]
		return [{"x": t["pos"].x, "z": t["pos"].z, "color": Pal.EXIT_GREEN, "size": 4.8, "clamp": true}]
	if _phase == "machines":
		var out: Array[Dictionary] = []
		for m in _machines:
			if is_instance_valid(m) and not m.wrecked:
				out.append({"x": m.global_position.x, "z": m.global_position.z, "color": Pal.HAZARD, "size": 5.0, "clamp": true})
		return out
	return [{"x": _exit_pos.x, "z": _exit_pos.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	return _map.is_walkable(x, z)


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	return _map.resolve(pos, radius, feet_y)


func is_bullet_blocked(b: Dictionary) -> bool:
	return _map.bullet_blocked(b["prev"], b["pos"])
