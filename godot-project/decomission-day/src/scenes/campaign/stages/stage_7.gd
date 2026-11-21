extends CampaignStageBase

## Stage 7 — Jalan Layang Pasupati & Gerbang Tol Pasteur:
## Sepanjang ~1.5 km melintasi jembatan layang penuh mobil telantar, barel peledak,
## hujan mortir di zona tengah, serta 3 mesin fabrikator di Gerbang Tol sebelum menaiki GRD LTV-45.

const BRIDGE_HALF_W := 46.0
const BRIDGE_LEN := 1350.0 # x: -650 -> +700

var _phase := "bridge" # bridge | toll | board | complete
var _blockers: Array[Dictionary] = []
var _mortars: Array[Dictionary] = []
var _mortar_cd := 2.4
var _toll_machines: Array[SpawnMachine] = []
var _toll_woken := false
var _grd_pos := Vector3(640.0, 0.0, 0.0)
var _grd_mk: MeshInstance3D


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 7
	ProceduralBuilder.setup_lighting(host.world_root, "night")

	var env := Node3D.new(); env.name = "Stage7Env"; add_child(env)
	CityscapeBuilder.build_skyline_ring(env, Vector3.ZERO, 900.0, 1650.0, 36)

	var m_deck := Pal.mat(Pal.ASPHALT)
	var m_rail := Pal.mat(Pal.CONCRETE)
	var m_steel := Pal.mat(Pal.STEEL)

	# Dek jembatan layang & penghalang tepi
	ProceduralBuilder.add_box(env, Vector3(BRIDGE_LEN + 120.0, 3.0, BRIDGE_HALF_W * 2.0), m_deck, Vector3(25.0, -1.5, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(BRIDGE_LEN + 120.0, 5.0, 3.0), m_rail, Vector3(25.0, 2.5, -BRIDGE_HALF_W - 1.5))
	ProceduralBuilder.add_box(env, Vector3(BRIDGE_LEN + 120.0, 5.0, 3.0), m_rail, Vector3(25.0, 2.5, BRIDGE_HALF_W + 1.5))

	# Lampu jalan & pilar bawah jembatan
	var lx := -600.0
	while lx <= 660.0:
		ProceduralBuilder.add_box(env, Vector3(14, 0.2, 1.4), Pal.mat(Pal.AMBER), Vector3(lx, 0.1, 0), Vector3.ZERO, false)
		ProceduralBuilder.add_cyl(env, 5.5, 6.5, 36.0, m_rail, Vector3(lx, -20.0, 0), Vector3.ZERO, 8, false)
		lx += 90.0

	# Kanopi Gerbang Tol Pasteur di ujung timur
	ProceduralBuilder.add_box(env, Vector3(36, 4.0, 98), m_steel, Vector3(540.0, 20.0, 0))
	for pz in [-34.0, 0.0, 34.0]:
		ProceduralBuilder.add_box(env, Vector3(22, 20.0, 8.0), m_rail, Vector3(540.0, 10.0, pz))
		_blockers.append(NavGrid2D.make_blocker(540.0, pz, 11.0, 4.2, 20.0))

	# Kendaraan terbengkalai membentuk labirin slalom
	var v_kinds := ["sedan", "suv", "pickup"]
	var vx := -520.0
	var idx := 0
	while vx < 460.0:
		var lane_z: float = [-24.0, 4.0, 24.0][idx % 3]
		var yaw := deg_to_rad(randf_range(-16.0, 16.0))
		var v := PropFactory.build_vehicle(v_kinds[idx % 3])
		v.position = Vector3(vx, 0.0, lane_z)
		v.rotation.y = yaw
		env.add_child(v)
		_blockers.append(NavGrid2D.make_blocker(vx, lane_z, 14.0, 7.2, 10.0, false, yaw))
		if idx % 2 == 0:
			host.spawn_barrel(Vector3(vx + 22.0, 0.0, -lane_z * 0.5))
		if idx % 3 == 0:
			host.spawn_crate(Vector3(vx + 38.0, 0.0, 22.0 if lane_z < 0.0 else -22.0))
		vx += 68.0
		idx += 1

	# 3 Mesin fabrikator gerbang tol
	for tz in [-26.0, 0.0, 26.0]:
		var m: SpawnMachine = host.spawn_machine(Vector3(585.0, 0.0, tz), 7.5, 2, 5)
		m.active = false
		_toll_machines.append(m)

	# Kendaraan taktis GRD LTV-45 menunggu setelah tol
	var grd := PropFactory.build_vehicle("grd")
	grd.position = _grd_pos
	env.add_child(grd)
	_grd_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 24.0, 20.0)
	_grd_mk.position = _grd_pos + Vector3(0, 0.3, 0); _grd_mk.visible = false; env.add_child(_grd_mk)

	for rx in range(-480, 480, 95):
		host.spawn_robot("C" if rx < 0 else "B", Vector3(float(rx), 0.0, randf_range(-26.0, 26.0)), "bridge", true)

	host.player.global_position = Vector3(-600.0, 0.0, 0.0)
	host.top_cam.snap_to(host.player.global_position)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 7 // PUSH ACROSS PASUPATI FLYOVER", 3.0)


func step_stage(dt: float, _dt_real: float) -> void:
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 18.0):
			r.state = "chasing"

	var px: float = host.player.global_position.x
	# Mortir di zona tengah jalan layang (-120 .. 440)
	if px > -120.0 and px < 440.0 and _phase == "bridge":
		_mortar_cd -= dt
		if _mortar_cd <= 0.0:
			_mortar_cd = 2.6
			_spawn_mortar_strike(host.player.global_position + Vector3(randf_range(-16, 16), 0, randf_range(-16, 16)))

	_step_mortars(dt)

	if _phase == "bridge" and px >= 470.0:
		_phase = "toll"
		if not _toll_woken:
			_toll_woken = true
			for m in _toll_machines:
				m.activate_machine(1.2)
			host.hud.show_stage_msg("PASTEUR TOLL PLAZA — DESTROY ALL 3 FABRICATORS!", 3.2)
	elif _phase == "toll":
		var all_dead := true
		for m in _toll_machines:
			if is_instance_valid(m) and not m.wrecked:
				all_dead = false
				break
		if all_dead:
			_phase = "board"
			_grd_mk.visible = true
			AudioManager.play_sfx("unlock", 0.9)
			host.hud.show_stage_msg("TOLL SECURED — BOARD GRD LTV-45!", 2.8)
	elif _phase == "board":
		if Vector2(host.player.global_position.x - _grd_pos.x, host.player.global_position.z - _grd_pos.z).length() < 22.0:
			_phase = "complete"
			host.complete_stage(7)


func _spawn_mortar_strike(target: Vector3) -> void:
	var tx := clampf(target.x, -560.0, 500.0)
	var tz := clampf(target.z, -BRIDGE_HALF_W + 6.0, BRIDGE_HALF_W - 6.0)
	var tpos := Vector3(tx, 0.0, tz)
	var mat := Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 1.2, 0.3, 0.0, true, 0.65, true)
	var ring := ProceduralBuilder.add_ring(self, 12.0, 14.5, mat, tpos + Vector3(0, 0.3, 0), 20)
	var shell := ProceduralBuilder.add_sphere(self, 2.2, Pal.mat(Pal.AMBER, Pal.AMBER, 1.4, 0.3, 0.0, false, 1.0, true), tpos + Vector3(0, 75, 0), Vector3.ONE, 8, 5, false)
	_mortars.append({"pos": tpos, "ring": ring, "shell": shell, "t": 0.0, "dur": 1.6})


func _step_mortars(dt: float) -> void:
	for i in range(_mortars.size() - 1, -1, -1):
		var m: Dictionary = _mortars[i]
		m["t"] = float(m["t"]) + dt
		var k := clampf(float(m["t"]) / float(m["dur"]), 0.0, 1.0)
		m["shell"].position.y = lerpf(75.0, 0.5, k * k)
		if k >= 1.0:
			host.fx.spawn_explosion(m["pos"], 16.0, 26.0, Color.html("#ff5522"), true, "explode")
			m["ring"].queue_free()
			m["shell"].queue_free()
			_mortars.remove_at(i)


func get_objective_text() -> String:
	match _phase:
		"bridge": return "STAGE 7 // CROSS PASUPATI FLYOVER TO PASTEUR TOLL"
		"toll": return "STAGE 7 // DESTROY ALL 3 TOLL FABRICATORS"
		"board": return "STAGE 7 // BOARD GRD LTV-45"
		_: return "STAGE 7 COMPLETE"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "bridge":
		return [{"x": 540.0, "z": 0.0, "color": Pal.AMBER, "size": 5.0, "clamp": true}]
	if _phase == "toll":
		var out: Array[Dictionary] = []
		for m in _toll_machines:
			if is_instance_valid(m) and not m.wrecked:
				out.append({"x": m.global_position.x, "z": m.global_position.z, "color": Pal.HAZARD, "size": 5.0, "clamp": true})
		return out
	return [{"x": _grd_pos.x, "z": _grd_pos.z, "color": Pal.EXIT_GREEN, "size": 5.2, "clamp": true}]


func is_walkable(x: float, z: float) -> bool:
	return x >= -640.0 and x <= 690.0 and absf(z) <= BRIDGE_HALF_W - 4.0


func resolve_world(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	pos.x = clampf(pos.x, -640.0 + radius, 690.0 - radius)
	pos.z = clampf(pos.z, -BRIDGE_HALF_W + radius + 2.0, BRIDGE_HALF_W - radius - 2.0)
	var res := NavGrid2D.resolve_blockers(pos, radius, feet_y, _blockers)
	return res["pos"]
