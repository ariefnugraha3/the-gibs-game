class_name SurvivalMode
extends Node3D

## Mode Survival (Pertahanan Taman Monas):
## Cutscene pembuka monasIntro -> gelombang robot tak terbatas (kelas C/B/A & Giant Boss tiap kelipatan 5),
## robot melompati pagar perimeter, menargetkan Monas / Player, event kabut Monas,
## Field Shop di antara gelombang (termasuk Repair & Reinforce Monas), dan animasi runtuhnya Monas.

var world_root: Node3D
var monas_world: MonasWorld
var top_cam: TopDownCamera
var player: PlayerController
var fx: EffectsPool
var hud: GameHUD
var shop: FieldShopModal

var _robots: Array[RobotEnemy] = []
var _leaping: Dictionary = {} # instance_id -> {"sx":float,"sz":float,"lx":float,"lz":float,"t":float,"dur":float,"y0":float,"y1":float,"arc_h":float}
var _crates: Array[LootCrate] = []
var _barrels: Array[ExplosiveBarrel] = []
var _pickups: Array[PickupDrop] = []

var _wave_num := 1
var _to_spawn := 0
var _spawn_timer := 0.0
var _spawn_interval := 1.8
var _max_concurrent := 20
var _between_waves := false

var _monas_hp := 5000.0
var _monas_max_hp := 5000.0
var _monas_down := false
var _death_done := false
var _death_slow_t := 0.0

# Event Kabut Monas
var _fog_active := false
var _fog_t := 0.0
var _fog_dur := 0.0
var _fog_warn_t := 0.0
var _fog_opacity := 0.0

# Cutscene Pembuka
var _intro_active := false
var _intro_t := 0.0
var _intro_lines: Array = []
var _intro_idx := -1


func _ready() -> void:
	GameState.mode = "survival"
	GameState.configure_player()
	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.cinematic_active = false
	GameState.score = 0
	GameState.stats = {"kills": 0, "shots": 0, "hits": 0}
	GameState.ui_dirty.emit()

	world_root = Node3D.new()
	world_root.name = "WorldRoot"
	add_child(world_root)
	ProceduralBuilder.setup_lighting(world_root, "night")

	monas_world = MonasWorld.new()
	world_root.add_child(monas_world)
	monas_world.build(false)

	top_cam = TopDownCamera.new()
	world_root.add_child(top_cam)

	fx = EffectsPool.new()
	world_root.add_child(fx)
	fx.player_bullet_hit_check.connect(_on_player_bullet_hit)
	fx.enemy_bullet_hit_check.connect(_on_enemy_bullet_hit)
	fx.explosion_damage_check.connect(_on_explosion_damage)

	player = PlayerController.new()
	world_root.add_child(player)
	player.attach_camera(top_cam)
	player.ground_height_fn = Callable(monas_world, "ground_height")
	player.resolve_fn = Callable(self, "_resolve_player_world")
	player.fired_weapon.connect(_on_player_fired)
	player.melee_swung.connect(_on_player_melee)
	player.player_died.connect(_on_player_died)

	hud = GameHUD.new()
	add_child(hud)
	hud.resume_requested.connect(_on_resume)
	hud.restart_requested.connect(_restart_survival)
	hud.exit_requested.connect(func(): SceneRouter.go_to_menu())
	hud.skip_cutscene_requested.connect(_skip_intro)
	if hud.touch_controls:
		hud.touch_controls.bind_player(player)

	shop = FieldShopModal.new()
	add_child(shop)
	shop.closed_next.connect(_on_shop_closed)

	SceneRouter.survival_wave_skip_requested.connect(_on_cheat_skip_wave)

	_reset_match()


func _reset_match() -> void:
	for arr in [_robots, _crates, _barrels, _pickups]:
		for item in arr:
			if item and is_instance_valid(item):
				item.queue_free()
		arr.clear()
	_leaping.clear()
	fx.clear_all()

	var sv: Dictionary = Config.section("survival")
	_monas_max_hp = float(sv.get("monasMaxHp", 5000.0))
	_monas_hp = _monas_max_hp
	_monas_down = false
	_death_done = false
	_death_slow_t = 0.0
	_fog_active = false
	_fog_opacity = 0.0
	monas_world.set_fog_canopy(0.0)
	if monas_world.monas_top:
		monas_world.monas_top.rotation = Vector3.ZERO
	monas_world.collapse_active = false

	GameState.configure_player()
	GameState.score = 0
	GameState.stats = {"kills": 0, "shots": 0, "hits": 0}
	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.set_death_slow_scale(1.0)
	player.reset_state()
	player.global_position = Vector3(-220.0, 0.0, 0.0)
	top_cam.reset_death_cam()
	top_cam.snap_to(player.global_position)
	hud.hide_boss_hud()
	hud.hide_radio_dialogue()
	hud.set_cine_fade(0.0)

	_spawn_props()

	if SceneRouter.pending_survival_intro:
		SceneRouter.pending_survival_intro = false
		_start_intro()
	else:
		_begin_gameplay_wave(1)


func _spawn_props() -> void:
	var n_crates := int(Config.section("crates").get("count", 16))
	for i in n_crates:
		var p := _random_park_point(65.0)
		var c := LootCrate.new()
		world_root.add_child(c)
		c.global_position = p
		c.broken.connect(_on_crate_broken)
		_crates.append(c)

	var n_barrels := int(Config.section("barrels").get("count", 12))
	for i in n_barrels:
		var p := _random_park_point(75.0)
		var b := ExplosiveBarrel.new()
		world_root.add_child(b)
		b.global_position = p
		b.exploded.connect(_on_barrel_exploded)
		_barrels.append(b)


func _random_park_point(min_from_monas: float) -> Vector3:
	for _try in 16:
		var x := randf_range(-MonasWorld.PARK_HX + 55.0, MonasWorld.PARK_HX - 55.0)
		var z := randf_range(-MonasWorld.PARK_HZ + 55.0, MonasWorld.PARK_HZ - 55.0)
		if Vector2(x, z).length() > min_from_monas:
			return Vector3(x, monas_world.ground_height(x, z), z)
	return Vector3(-160.0, 0.0, 90.0)


func _start_intro() -> void:
	_intro_active = true
	_intro_t = 0.0
	_intro_idx = -1
	_intro_lines = Config.dialogue_list("monasIntro")
	GameState.cinematic_active = true
	hud.set_cine_bars(true)
	top_cam.set_cine_focus(Vector2(0, 0), true)
	top_cam.cam_look_y = 26.0
	AudioManager.stop_music()


func _skip_intro() -> void:
	if not _intro_active:
		return
	_intro_active = false
	GameState.cinematic_active = false
	hud.set_cine_bars(false)
	hud.hide_radio_dialogue()
	top_cam.set_cine_focus(null, false)
	top_cam.cam_look_y = null
	top_cam.snap_to(player.global_position)
	_begin_gameplay_wave(1)


func _begin_gameplay_wave(n: int) -> void:
	AudioManager.start_battle_music()
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	_start_wave(n)


func _start_wave(n: int) -> void:
	var sv: Dictionary = Config.section("survival")
	_wave_num = maxi(1, n)
	_between_waves = false
	_to_spawn = int(sv.get("robotsPerWaveBase", 15)) + (_wave_num - 1) * int(sv.get("robotsPerWaveStep", 5))
	_spawn_timer = 0.25
	_spawn_interval = maxf(float(sv.get("spawnIntervalMin", 0.5)), float(sv.get("spawnIntervalBase", 1.8)) - float(_wave_num - 1) * float(sv.get("spawnIntervalStep", 0.1)))
	_max_concurrent = mini(int(sv.get("maxRobotsCap", 45)), int(sv.get("maxRobotsBase", 20)) + (_wave_num - 1) * int(sv.get("maxRobotsStep", 3)))

	if _wave_num % 5 == 0:
		_spawn_wave_robot("boss")

	var fog_from := int(sv.get("monasFogFromWave", 4))
	if _wave_num >= fog_from and not _fog_active:
		var ch := minf(float(sv.get("monasFogChanceMax", 0.5)), float(sv.get("monasFogChanceBase", 0.15)) + float(_wave_num - fog_from) * float(sv.get("monasFogChancePerWave", 0.08)))
		if randf() < ch:
			_fog_active = true
			_fog_warn_t = float(sv.get("monasFogWarningSec", 4.0))
			_fog_dur = float(sv.get("monasFogDurationSec", 35.0))
			_fog_t = 0.0
			hud.show_stage_msg("MONAS FOG INCOMING — SEEK THE OBELISK!", 3.0)

	hud.show_stage_msg("WAVE %d" % _wave_num, 2.0)


func _process(delta: float) -> void:
	var dt_real := minf(delta, 0.05)
	GameState.update_time_scale(dt_real)
	var t_scale := GameState.global_time_scale()
	var dt := dt_real * t_scale

	if _intro_active:
		_step_intro(dt_real)
		hud.update_runtime(player.stamina, "MONAS DEFENSE — BRIEFING", player.global_position, _build_landmarks())
		return

	if GameState.is_game_over or GameState.is_paused:
		return

	if _monas_down:
		if monas_world.step_monas_collapse(dt_real, top_cam, fx):
			_trigger_survival_game_over("MONAS HAS FALLEN")
		fx.step(dt_real, Callable())
		top_cam.follow(Vector3.ZERO, dt_real)
		return

	if float(GameState.player.get("hp", 0.0)) <= 0.0:
		_death_slow_t += dt_real
		var zoom_k := clampf(_death_slow_t / 1.4, 0.0, 1.0)
		top_cam.set_death_cam(lerpf(1.0, 0.55, zoom_k), _death_slow_t * 0.85, 0.35 * zoom_k)
		top_cam.follow(player.global_position, dt_real)
		fx.step(dt, Callable())
		if _death_slow_t >= 1.8 and not _death_done:
			_death_done = true
			_trigger_survival_game_over("KIA IN ACTION")
		return

	player.step(dt, dt_real)
	top_cam.follow(player.global_position, dt_real)
	fx.step(dt, Callable(self, "_is_bullet_blocked"))

	_step_fog(dt)
	_step_wave_spawner(dt)
	_step_robots(dt)
	_step_pickups(dt)
	_update_survival_hud()


func _step_intro(dt: float) -> void:
	_intro_t += dt
	var monas_cfg: Dictionary = Config.campaign().get("monasIntro", {})
	var dur := float(monas_cfg.get("durationSec", 10.0))
	var k := clampf(_intro_t / maxf(1.0, dur), 0.0, 1.0)
	if k < 0.55:
		top_cam.set_cine_focus(Vector2(lerpf(0.0, -110.0, k / 0.55), lerpf(0.0, -40.0, k / 0.55)), false)
		top_cam.cam_look_y = lerpf(48.0, 14.0, k / 0.55)
	else:
		var t2 := (k - 0.55) / 0.45
		top_cam.set_cine_focus(Vector2(lerpf(-110.0, player.global_position.x, t2), lerpf(-40.0, player.global_position.z, t2)), false)
		top_cam.cam_look_y = lerpf(14.0, 6.0, t2)
	top_cam.follow(player.global_position, dt)

	if not _intro_lines.is_empty():
		var idx := mini(_intro_lines.size() - 1, int(k * float(_intro_lines.size())))
		if idx != _intro_idx:
			_intro_idx = idx
			var entry: Dictionary = _intro_lines[idx]
			hud.show_radio_dialogue(str(entry.get("speaker", "HQ")), str(entry.get("text", "")))

	if k >= 1.0:
		_skip_intro()


func _step_fog(dt: float) -> void:
	if not _fog_active:
		return
	var sv: Dictionary = Config.section("survival")
	if _fog_warn_t > 0.0:
		_fog_warn_t -= dt
		return
	_fog_t += dt
	var fade := float(sv.get("monasFogFadeSec", 3.0))
	if _fog_t < fade:
		_fog_opacity = _fog_t / maxf(0.2, fade)
	elif _fog_t > _fog_dur - fade:
		_fog_opacity = maxf(0.0, (_fog_dur - _fog_t) / maxf(0.2, fade))
	else:
		_fog_opacity = 1.0
	monas_world.set_fog_canopy(_fog_opacity)
	monas_world.drift_fog_canopy(dt)
	if _fog_t >= _fog_dur:
		_fog_active = false
		_fog_opacity = 0.0
		monas_world.set_fog_canopy(0.0)


func _step_wave_spawner(dt: float) -> void:
	if _between_waves:
		return
	var alive_count := _alive_robots_count()
	if _to_spawn > 0 and alive_count < _max_concurrent:
		_spawn_timer -= dt
		if _spawn_timer <= 0.0:
			_spawn_timer = _spawn_interval
			_to_spawn -= 1
			_spawn_wave_robot(_roll_robot_class())
	elif _to_spawn <= 0 and alive_count == 0:
		_between_waves = true
		shop.open_shop("survival", _wave_num, "START WAVE %d" % (_wave_num + 1), {
			"heal": Callable(self, "_shop_heal_monas"),
			"strengthen": Callable(self, "_shop_strengthen_monas"),
		})


func _roll_robot_class() -> String:
	var sv: Dictionary = Config.section("survival")
	var cb := minf(float(sv.get("classBMaxChance", 0.35)), maxf(0.0, float(_wave_num - int(sv.get("classBFromWave", 2))) * float(sv.get("classBChancePerWave", 0.06))))
	var ca := minf(float(sv.get("classAMaxChance", 0.2)), maxf(0.0, float(_wave_num - int(sv.get("classAFromWave", 4))) * float(sv.get("classAChancePerWave", 0.04))))
	var r := randf()
	if r < ca:
		return "A"
	if r < ca + cb:
		return "B"
	return "C"


func _spawn_wave_robot(cls: String) -> void:
	var side := randi() % 4
	var sx := 0.0
	var sz := 0.0
	var lx := 0.0
	var lz := 0.0
	match side:
		0:
			sx = randf_range(-MonasWorld.PARK_HX + 25.0, MonasWorld.PARK_HX - 25.0)
			sz = -MonasWorld.PARK_HZ - 35.0; lx = sx; lz = -MonasWorld.PARK_HZ + 28.0
		1:
			sx = randf_range(-MonasWorld.PARK_HX + 25.0, MonasWorld.PARK_HX - 25.0)
			sz = MonasWorld.PARK_HZ + 35.0; lx = sx; lz = MonasWorld.PARK_HZ - 28.0
		2:
			sz = randf_range(-MonasWorld.PARK_HZ + 25.0, MonasWorld.PARK_HZ - 25.0)
			sx = -MonasWorld.PARK_HX - 35.0; lz = sz; lx = -MonasWorld.PARK_HX + 28.0
		_:
			sz = randf_range(-MonasWorld.PARK_HZ + 25.0, MonasWorld.PARK_HZ - 25.0)
			sx = MonasWorld.PARK_HX + 35.0; lz = sz; lx = MonasWorld.PARK_HX - 28.0

	var rob := RobotEnemy.new()
	world_root.add_child(rob)
	rob.setup(cls, Vector3(sx, 0.0, sz), 0, "survival_w%d" % _wave_num, false)
	rob.monas_committed = randf() < float(Config.section("survival").get("monasChance", 0.4))
	rob.robot_killed.connect(_on_robot_killed)
	rob.robot_shoot_requested.connect(_on_robot_shoot)
	rob.player_clawed.connect(_on_robot_claw_player)
	rob.monas_gnawed.connect(_on_robot_gnaw_monas)
	_robots.append(rob)

	_leaping[rob.get_instance_id()] = {
		"sx": sx, "sz": sz, "lx": lx, "lz": lz,
		"t": 0.0, "dur": 1.1, "y0": 0.0, "y1": monas_world.ground_height(lx, lz),
		"arc_h": MonasWorld.FENCE_H + 14.0,
	}


func _step_robots(dt: float) -> void:
	var aggro_r := float(Config.section("survival").get("monasAggroMeters", 5.0)) * Config.CAMP_M
	for i in range(_robots.size() - 1, -1, -1):
		var r: RobotEnemy = _robots[i]
		if not is_instance_valid(r):
			_robots.remove_at(i)
			continue
		var rid := r.get_instance_id()
		if _leaping.has(rid) and r.state != "dead":
			var jp: Dictionary = _leaping[rid]
			jp["t"] = float(jp["t"]) + dt
			var k := clampf(float(jp["t"]) / float(jp["dur"]), 0.0, 1.0)
			var nx := lerpf(float(jp["sx"]), float(jp["lx"]), k)
			var nz := lerpf(float(jp["sz"]), float(jp["lz"]), k)
			var ny := lerpf(float(jp["y0"]), float(jp["y1"]), k) + sin(k * PI) * float(jp["arc_h"])
			r.global_position = Vector3(nx, ny, nz)
			r.rotation.y = atan2(float(jp["lx"]) - float(jp["sx"]), float(jp["lz"]) - float(jp["sz"]))
			if k >= 1.0:
				_leaping.erase(rid)
			continue

		var extra: Variant = null
		var d_player := Vector2(player.global_position.x - r.global_position.x, player.global_position.z - r.global_position.z).length()
		if r.monas_committed and (r.monas_locked or d_player > aggro_r):
			var d_m := Vector2(-r.global_position.x, -r.global_position.z)
			var m_pt := Vector3.ZERO
			if d_m.length_squared() > 0.1:
				var aim_dir := d_m.normalized()
				m_pt = Vector3(-aim_dir.x * 26.0, 0.0, -aim_dir.y * 26.0)
			extra = {"kind": "monas", "pos": m_pt}

		r.step_ai(dt, player.global_position, null, Callable(), Callable(self, "_resolve_robot_world"), Callable(self, "_robot_los"), Callable(), extra)
		if is_instance_valid(r) and r.state != "dead":
			r.global_position.y = monas_world.ground_height(r.global_position.x, r.global_position.z, r.global_position.y)


func _step_pickups(dt: float) -> void:
	for i in range(_pickups.size() - 1, -1, -1):
		var p: PickupDrop = _pickups[i]
		if not is_instance_valid(p):
			_pickups.remove_at(i)
			continue
		p.step(dt, player.global_position)


func _update_survival_hud() -> void:
	var alive_left := _to_spawn + _alive_robots_count()
	var obj := "WAVE %d  |  HOSTILES: %d  |  MONAS: %d%%" % [_wave_num, alive_left, roundi((_monas_hp / maxf(1.0, _monas_max_hp)) * 100.0)]
	hud.update_runtime(player.stamina, obj, player.global_position, _build_landmarks())
	hud.show_boss_hud("MONAS INTEGRITY", _monas_hp, _monas_max_hp)


func _build_landmarks() -> Array[Dictionary]:
	var marks: Array[Dictionary] = [{"x": 0.0, "z": 0.0, "color": Pal.AMBER, "size": 5.0, "clamp": true}]
	for r in _robots:
		if is_instance_valid(r) and r.state != "dead":
			marks.append({"x": r.global_position.x, "z": r.global_position.z, "color": Pal.EYE_RED, "size": 2.5 if r.kind != "boss" else 5.0})
	return marks


func _alive_robots_count() -> int:
	var c := 0
	for r in _robots:
		if is_instance_valid(r) and r.state != "dead":
			c += 1
	return c


func _resolve_player_world(pos: Vector3, radius: float, _y: float) -> Vector3:
	pos = monas_world.resolve_body(pos, radius, false)
	for b in _barrels:
		if is_instance_valid(b) and not b.is_dead:
			pos = b.resolve_player(pos, radius)
	for cr in _crates:
		if is_instance_valid(cr) and not cr.is_broken:
			pos = cr.resolve_player(pos, radius)
	return pos


func _resolve_robot_world(pos: Vector3, radius: float, _y: float) -> Vector3:
	return monas_world.resolve_body(pos, radius, false)


func _is_bullet_blocked(b: Dictionary) -> bool:
	return MonasWorld.monas_shot_blocked(b["prev"], b["pos"])


func _robot_los(x1: float, z1: float, x2: float, z2: float) -> bool:
	return not MonasWorld.monas_shot_blocked(Vector3(x1, 7.0, z1), Vector3(x2, 7.0, z2))


func _on_player_fired(w: String, orig: Vector3, dir: Vector3, dmg: float, is_rocket: bool) -> void:
	fx.spawn_player_bullet(w, orig, dir, dmg, is_rocket)


func _on_player_melee(orig: Vector3, dir: Vector3, m_range: float, dmg: float) -> void:
	var arc := float(Config.section("melee").get("arcRad", 2.094)) * 0.5
	var dir2 := Vector2(dir.x, dir.z).normalized()
	for r in _robots:
		if is_instance_valid(r) and r.state != "dead":
			var to := Vector2(r.global_position.x - orig.x, r.global_position.z - orig.z)
			if to.length() <= m_range and (to.length() < 4.0 or dir2.angle_to(to.normalized()) <= arc):
				r.take_damage(dmg, true)
				fx.spawn_burst(r.global_position + Vector3(0, 6, 0), 6, false)
	for cr in _crates:
		if is_instance_valid(cr) and not cr.is_broken and Vector2(cr.global_position.x - orig.x, cr.global_position.z - orig.z).length() <= m_range:
			cr.take_damage(dmg)
	for b in _barrels:
		if is_instance_valid(b) and not b.is_dead and Vector2(b.global_position.x - orig.x, b.global_position.z - orig.z).length() <= m_range:
			b.take_damage(dmg)


func _on_player_bullet_hit(b: Dictionary) -> void:
	if not bool(b.get("alive", true)):
		return
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var dmg := float(b.get("dmg", 0.0))
	var probe := bool(b.get("probe_only", false))

	for r in _robots:
		if not is_instance_valid(r) or r.state == "dead":
			continue
		var rad := 4.5 * r.scl
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, r.global_position.x, r.global_position.z) <= rad * rad:
			b["alive"] = false
			if not probe:
				GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
				r.take_damage(dmg, true)
				fx.spawn_burst(p2, 5, false)
			return

	for br in _barrels:
		if not is_instance_valid(br) or br.is_dead:
			continue
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, br.global_position.x, br.global_position.z) <= 20.0:
			b["alive"] = false
			if not probe:
				br.take_damage(dmg)
			return

	for cr in _crates:
		if not is_instance_valid(cr) or cr.is_broken:
			continue
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, cr.global_position.x, cr.global_position.z) <= 28.0:
			b["alive"] = false
			if not probe:
				cr.take_damage(dmg)
			return


func _on_enemy_bullet_hit(b: Dictionary) -> void:
	if not bool(b.get("alive", true)):
		return
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var m_dmg := float(b.get("monas_dmg", 0.0))
	if m_dmg > 0.0 and Vector2(p2.x, p2.z).length() <= 24.0:
		b["alive"] = false
		_damage_monas(m_dmg)
		return
	var pr := float(GameState.player.get("radius", 5.0))
	if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, player.global_position.x, player.global_position.z) <= pr * pr:
		b["alive"] = false
		if GameState.damage_player(float(b.get("dmg", 5.0))):
			hud.flash_damage()
			fx.spawn_burst(player.global_position + Vector3(0, 6, 0), 5, true)


func _on_explosion_damage(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	var r2 := radius * radius
	for rob in _robots:
		if is_instance_valid(rob) and rob.state != "dead":
			var d2 := Vector2(rob.global_position.x - center.x, rob.global_position.z - center.z).length_squared()
			if d2 <= r2:
				var fall := clampf(1.0 - sqrt(d2) / radius, 0.25, 1.0)
				rob.take_damage(dmg * fall, not is_enemy)
	for br in _barrels:
		if is_instance_valid(br) and not br.is_dead:
			var d2 := Vector2(br.global_position.x - center.x, br.global_position.z - center.z).length_squared()
			if d2 <= r2 * 0.7:
				br.take_damage(dmg)
	for cr in _crates:
		if is_instance_valid(cr) and not cr.is_broken:
			var d2 := Vector2(cr.global_position.x - center.x, cr.global_position.z - center.z).length_squared()
			if d2 <= r2 * 0.7:
				cr.take_damage(dmg)
	var dp := Vector2(player.global_position.x - center.x, player.global_position.z - center.z).length()
	if dp <= radius:
		var pdmg := (dmg if is_enemy else dmg * 0.15) * clampf(1.0 - dp / radius, 0.25, 1.0)
		if pdmg > 1.0 and GameState.damage_player(pdmg):
			hud.flash_damage()


func _on_robot_killed(rob: RobotEnemy, by_player: bool) -> void:
	_leaping.erase(rob.get_instance_id())
	if by_player:
		var dc: Dictionary = Config.section("drops")
		if randf() < float(dc.get("lootDropChance", 0.28)):
			var p := PickupDrop.new()
			world_root.add_child(p)
			p.setup("loot", rob.global_position, int(dc.get("robotKillBase", 25)) if rob.kind != "boss" else 250)
			_pickups.append(p)
		if randf() < 0.14:
			var am := PickupDrop.new()
			world_root.add_child(am)
			am.setup("ammo", rob.global_position + Vector3(3, 0, 0), 1, str(GameState.player.get("current_weapon", "rifle")))
			_pickups.append(am)


func _on_robot_shoot(orig: Vector3, dir: Vector3, spd: float, dmg: float, monas_dmg: float, target_struct: bool) -> void:
	fx.spawn_enemy_bullet(orig, dir, spd, dmg, monas_dmg, target_struct)


func _on_robot_claw_player(_rob: RobotEnemy, dmg: float, _push: Vector2) -> void:
	if GameState.damage_player(dmg):
		hud.flash_damage()
		fx.spawn_burst(player.global_position + Vector3(0, 6, 0), 5, true)


func _on_robot_gnaw_monas(rob: RobotEnemy, dmg: float) -> void:
	rob.monas_locked = true
	_damage_monas(dmg)


func _damage_monas(dmg: float) -> void:
	if _monas_down:
		return
	_monas_hp = maxf(0.0, _monas_hp - dmg)
	if _monas_hp <= 0.0:
		_monas_down = true
		GameState.cinematic_active = true
		hud.set_cine_bars(true)
		top_cam.set_cine_focus(Vector2.ZERO, false)
		top_cam.cam_look_y = 22.0
		monas_world.start_monas_collapse()


func _on_crate_broken(_crate: LootCrate, pos: Vector3, kind: String, val: int) -> void:
	var p := PickupDrop.new()
	world_root.add_child(p)
	p.setup("loot" if kind == "money" else kind, pos, val, str(GameState.player.get("current_weapon", "rifle")))
	_pickups.append(p)


func _on_barrel_exploded(_b: ExplosiveBarrel, center: Vector3, radius: float, robot_dmg: float, _player_dmg: float) -> void:
	fx.spawn_explosion(center, radius, robot_dmg, Color.html("#ff6020"), true, "explode")


func _shop_heal_monas() -> String:
	if _monas_hp >= _monas_max_hp:
		return "Monument already at 100% integrity"
	_monas_hp = minf(_monas_max_hp, _monas_hp + _monas_max_hp * 0.25)
	return ""


func _shop_strengthen_monas() -> String:
	var sv: Dictionary = Config.section("survival")
	var bonus := float(sv.get("strengthenBonus", 1500.0))
	_monas_max_hp += bonus
	_monas_hp += bonus
	return ""


func _on_shop_closed() -> void:
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	_start_wave(_wave_num + 1)


func _on_player_died(_push_dir: Vector2) -> void:
	GameState.set_death_slow_scale(0.32)
	AudioManager.play_sfx("death", 0.8)


func _trigger_survival_game_over(title: String) -> void:
	GameState.is_game_over = true
	GameState.record_survival_score()
	SaveSystem.update_high_score(GameState.score)
	AchievementManager.record_death()
	AudioManager.stop_music()
	hud.set_cine_bars(false)
	hud.show_game_over(false, title, "RESTART SURVIVAL", Callable(self, "_restart_survival"))


func _restart_survival() -> void:
	hud.set_pause_visible(false)
	GameState.is_game_over = false
	_reset_match()


func _on_resume() -> void:
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)


func _on_cheat_skip_wave(wave_no: int) -> void:
	for r in _robots:
		if is_instance_valid(r):
			r.queue_free()
	_robots.clear()
	_leaping.clear()
	shop.visible = false
	GameState.is_paused = false
	_start_wave(wave_no)
