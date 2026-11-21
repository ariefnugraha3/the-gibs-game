extends CampaignStageBase

## Stage 8 — Pengejaran Tol Cisumdawu (GRD LTV-45 vs Raiders & Gunship Boss):
## Mengemudikan GRD LTV-45 melintasi 7 lajur tol bergerak (A/D atau Stick Kiri pindah lajur),
## membidik bebas dengan mouse/stick kanan terhadap pickup musuh & peluncur barel,
## lalu menumbangkan Heavy Attack Gunship di babak puncak!

const NUM_LANES := 7
const LANE_SPACING := 18.0
const ROAD_SPEED := 260.0

var _phase := "pursuit" # pursuit | gunship | complete
var _road_chunks: Array[Node3D] = []
var _grd_mesh: Node3D
var _lane_idx := 3 # 0..6 (pusat = 3 -> z=0)
var _cur_x := 0.0
var _cur_z := 0.0
var _lane_cd := 0.0

var _pursuit_t := 0.0
var _enemy_spawn_t := 1.5
var _pickups_hostile: Array[Dictionary] = []
var _highway_barrels: Array[Node3D] = []
var _gunship: GunshipBoss = null


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 8
	ProceduralBuilder.setup_lighting(host.world_root, "night")

	var env := Node3D.new(); env.name = "Stage8Env"; add_child(env)
	ProceduralBuilder.add_box(env, Vector3(1400, 1.0, 420), Pal.mat(Pal.PARK_GRASS), Vector3(0, -1.5, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(1400, 0.8, 150), Pal.mat(Pal.ASPHALT), Vector3(0, -0.4, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(env, Vector3(1400, 5.0, 4.0), Pal.mat(Pal.CONCRETE), Vector3(0, 2.5, -76.0))
	ProceduralBuilder.add_box(env, Vector3(1400, 5.0, 4.0), Pal.mat(Pal.CONCRETE), Vector3(0, 2.5, 76.0))

	for i in 14:
		var ch := Node3D.new()
		ch.position = Vector3(-650.0 + float(i) * 100.0, 0.0, 0.0)
		for ln in range(-2, 4):
			ProceduralBuilder.add_box(ch, Vector3(24, 0.15, 0.8), Pal.mat(Pal.AMBER), Vector3(0, 0.08, float(ln) * LANE_SPACING - LANE_SPACING * 0.5), Vector3.ZERO, false)
		ProceduralBuilder.add_cyl(ch, 1.0, 1.2, 24.0, Pal.mat(Pal.STEEL), Vector3(0, 12.0, -78.0), Vector3.ZERO, 6)
		ProceduralBuilder.add_cyl(ch, 1.0, 1.2, 24.0, Pal.mat(Pal.STEEL), Vector3(0, 12.0, 78.0), Vector3.ZERO, 6)
		env.add_child(ch)
		_road_chunks.append(ch)

	_grd_mesh = PropFactory.build_vehicle("grd")
	host.player.add_child(_grd_mesh)
	host.player.avatar.visible = false
	host.player.custom_control_fn = Callable(self, "custom_player_control")
	host.player.global_position = Vector3.ZERO
	host.top_cam.set_offset(Vector3(0.0, 210.0, 120.0))
	host.top_cam.snap_to(Vector3(35.0, 0.0, 0.0))

	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 8 // CISUMDAWU PURSUIT — STEER W/S/A/D & FIRE!", 3.2)


func exit_stage() -> void:
	if is_instance_valid(host) and is_instance_valid(host.player):
		host.player.custom_control_fn = Callable()
		host.player.avatar.visible = true
	if is_instance_valid(_grd_mesh):
		_grd_mesh.queue_free()


func custom_player_control(dt: float) -> bool:
	_lane_cd = maxf(0.0, _lane_cd - dt)
	var axis_z := Input.get_axis("move_up", "move_down")
	var axis_x := Input.get_axis("move_left", "move_right")
	if host.player.touch_move_vec.length_squared() > 0.04:
		axis_x = host.player.touch_move_vec.x
		axis_z = host.player.touch_move_vec.y

	# A/D maju-mundur di bentangan jalan; W/S atau atas/bawah pindah 7 lajur tol
	_cur_x = clampf(_cur_x + axis_x * 95.0 * dt, -85.0, 65.0)
	if _lane_cd <= 0.0 and absf(axis_z) > 0.45:
		_lane_idx = clampi(_lane_idx + (1 if axis_z > 0.0 else -1), 0, NUM_LANES - 1)
		_lane_cd = 0.22

	var target_z := float(_lane_idx - 3) * LANE_SPACING
	_cur_z = lerpf(_cur_z, target_z, clampf(dt * 10.0, 0.0, 1.0))
	host.player.global_position = Vector3(_cur_x, 0.0, _cur_z)
	_grd_mesh.rotation.y = (target_z - _cur_z) * -0.025
	return true


func step_stage(dt: float, _dt_real: float) -> void:
	for ch in _road_chunks:
		ch.position.x -= ROAD_SPEED * dt
		if ch.position.x < -700.0:
			ch.position.x += 1400.0

	host.top_cam.follow(Vector3(host.player.global_position.x + 35.0, 0.0, 0.0), dt)

	if _phase == "pursuit":
		_pursuit_t += dt
		_enemy_spawn_t -= dt
		if _enemy_spawn_t <= 0.0:
			_enemy_spawn_t = 3.2
			_spawn_raider_pickup()
		if _pursuit_t >= 26.0 and _pickups_hostile.is_empty():
			_phase = "gunship"
			_spawn_gunship_boss()
	elif _phase == "gunship":
		if _gunship and is_instance_valid(_gunship) and not _gunship.is_dead:
			_gunship.step_boss(dt, host.player.global_position)
			host.hud.show_boss_hud("AIRBORNE ASSAULT GUNSHIP", _gunship.hp, _gunship.max_hp)
		elif _gunship and _gunship.is_dead:
			_phase = "complete"
			host.hud.hide_boss_hud()
			host.hud.show_stage_msg("GUNSHIP DOWN — ENTERING KERTAJATI PERIMETER!", 2.8)
			get_tree().create_timer(2.4).timeout.connect(func():
				if is_instance_valid(host):
					host.complete_stage(8)
			)

	_step_raiders(dt)
	_step_barrels(dt)


func _spawn_raider_pickup() -> void:
	var ln := randi() % NUM_LANES
	var pz := float(ln - 3) * LANE_SPACING
	var node := PropFactory.build_vehicle("pickup", Pal.HAZARD)
	node.position = Vector3(260.0, 0.0, pz)
	node.rotation.y = PI
	add_child(node)
	_pickups_hostile.append({"node": node, "hp": 220.0, "lane_z": pz, "shoot_t": 1.2, "barrel_t": 2.4, "target_x": randf_range(85.0, 145.0)})


func _step_raiders(dt: float) -> void:
	for i in range(_pickups_hostile.size() - 1, -1, -1):
		var pk: Dictionary = _pickups_hostile[i]
		var n: Node3D = pk["node"]
		n.position.x = lerpf(n.position.x, float(pk["target_x"]), clampf(dt * 2.5, 0.0, 1.0))
		pk["shoot_t"] = float(pk["shoot_t"]) - dt
		pk["barrel_t"] = float(pk["barrel_t"]) - dt
		if float(pk["shoot_t"]) <= 0.0:
			pk["shoot_t"] = 1.6
			var orig := n.global_position + Vector3(-12.0, 8.0, 0.0)
			var dir: Vector3 = (host.player.global_position + Vector3(0, 6.0, 0) - orig).normalized()
			host.fx.spawn_enemy_bullet(orig, dir, 2.2, 8.0, 0.0, false, true)
		if float(pk["barrel_t"]) <= 0.0:
			pk["barrel_t"] = 3.5
			var br := ProceduralBuilder.add_cyl(self, 3.2, 3.2, 7.0, Pal.mat(Pal.HAZARD, Pal.AMBER, 0.6), n.global_position + Vector3(-16, 3.5, 0), Vector3(90, 0, 0), 10)
			_highway_barrels.append(br)


func _step_barrels(dt: float) -> void:
	var pp: Vector3 = host.player.global_position
	for i in range(_highway_barrels.size() - 1, -1, -1):
		var br: Node3D = _highway_barrels[i]
		br.position.x -= ROAD_SPEED * 0.72 * dt
		br.rotation.y += dt * 4.0
		if Vector2(br.position.x - pp.x, br.position.z - pp.z).length() < 14.0:
			host.fx.spawn_explosion(br.position, 14.0, 18.0, Color.html("#ff5522"), true, "explode")
			br.queue_free()
			_highway_barrels.remove_at(i)
		elif br.position.x < -300.0:
			br.queue_free()
			_highway_barrels.remove_at(i)


func _spawn_gunship_boss() -> void:
	_gunship = GunshipBoss.new()
	add_child(_gunship)
	_gunship.global_position = Vector3(135.0, 56.0, 0.0)
	_gunship.shoot_requested.connect(func(o, d, s, dmg):
		host.fx.spawn_enemy_bullet(o, d, s, dmg, 0.0, false, true)
	)
	_gunship.laser_hit.connect(func(center: Vector3, dmg: float):
		if Vector2(center.x - host.player.global_position.x, center.z - host.player.global_position.z).length() < 24.0:
			if GameState.damage_player(dmg):
				host.hud.flash_damage()
	)
	_gunship.bomb_strike.connect(func(tgt: Vector3, dmg: float):
		host.fx.spawn_explosion(tgt, 20.0, dmg, Color.html("#ff4422"), true, "explode")
	)
	_gunship.defeated.connect(func():
		AchievementManager.record_boss("gunship")
	)
	AudioManager.start_boss_music()


func handle_player_bullet(b: Dictionary) -> bool:
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var dmg := float(b.get("dmg", 0.0))
	var probe := bool(b.get("probe_only", false))

	for i in range(_pickups_hostile.size() - 1, -1, -1):
		var pk: Dictionary = _pickups_hostile[i]
		var n: Node3D = pk["node"]
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, n.global_position.x, n.global_position.z) <= 14.0 * 14.0:
			b["alive"] = false
			if not probe:
				GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
				pk["hp"] = float(pk["hp"]) - dmg
				host.fx.spawn_burst(p2, 4, false)
				if float(pk["hp"]) <= 0.0:
					host.fx.spawn_explosion(n.global_position, 22.0, 0.0, Color.html("#ff6020"), false, "explode")
					GameState.add_score(150)
					n.queue_free()
					_pickups_hostile.remove_at(i)
			return true

	if _phase == "gunship" and _gunship and is_instance_valid(_gunship) and not _gunship.is_dead:
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, _gunship.global_position.x, _gunship.global_position.z) <= 28.0 * 28.0:
			b["alive"] = false
			if not probe:
				GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
				_gunship.take_damage(dmg)
				host.fx.spawn_burst(p2, 5, false)
			return true
	return false


func get_objective_text() -> String:
	if _phase == "gunship":
		return "STAGE 8 // DESTROY ASSAULT GUNSHIP"
	return "STAGE 8 // OUTRUN RAIDERS ON CISUMDAWU"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "gunship" and _gunship and not _gunship.is_dead:
		return [{"x": _gunship.global_position.x, "z": _gunship.global_position.z, "color": Pal.HAZARD, "size": 5.5, "clamp": true}]
	return []
