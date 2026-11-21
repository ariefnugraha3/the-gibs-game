class_name CampaignHost
extends Node3D

## Host terpusat mode Campaign (Stage 1..12):
## Mengelola TopDownCamera, PlayerController, EffectsPool, GameHUD, keempat modal
## (Field Shop, ICE BREACH, SIGNAL TRACE, FIELD REPAIR), serta entity loop bersama
## agar setiap Stage 1..12 berfokus murni pada level, narasi, mekanik, dan boss-nya.

var world_root: Node3D
var top_cam: TopDownCamera
var player: PlayerController
var fx: EffectsPool
var hud: GameHUD
var shop: FieldShopModal
var ice_breach: IceBreachModal
var signal_trace: SignalTraceModal
var field_repair: FieldRepairModal

var active_stage: CampaignStageBase = null
var current_stage_no := 1
var current_chapter := 1

var robots: Array[RobotEnemy] = []
var machines: Array[SpawnMachine] = []
var crates: Array[LootCrate] = []
var barrels: Array[ExplosiveBarrel] = []
var pickups: Array[PickupDrop] = []
var nav_grid: NavGrid2D = null

var _death_slow_t := 0.0
var _death_done := false
var _ice_cb: Callable = Callable()
var _sig_cb: Callable = Callable()
var _rep_cb: Callable = Callable()


func _ready() -> void:
	GameState.mode = "campaign"
	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.cinematic_active = false

	world_root = Node3D.new()
	world_root.name = "WorldRoot"
	add_child(world_root)

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
	player.walkable_fn = Callable(self, "_walkable_bridge")
	player.resolve_fn = Callable(self, "_resolve_bridge")
	player.ground_height_fn = Callable(self, "_ground_height_bridge")
	player.allows_action_fn = Callable(self, "_allows_action_bridge")
	player.fired_weapon.connect(_on_player_fired)
	player.melee_swung.connect(_on_player_melee)
	player.player_died.connect(_on_player_died)

	hud = GameHUD.new()
	add_child(hud)
	hud.resume_requested.connect(_on_resume)
	hud.restart_requested.connect(_retry_current_stage)
	hud.exit_requested.connect(func(): SceneRouter.go_to_menu())
	hud.skip_cutscene_requested.connect(_on_skip_cinematic)
	if hud.touch_controls:
		hud.touch_controls.bind_player(player)

	shop = FieldShopModal.new(); add_child(shop)
	shop.closed_next.connect(_on_shop_closed)

	ice_breach = IceBreachModal.new(); add_child(ice_breach)
	ice_breach.completed.connect(_on_ice_completed)

	signal_trace = SignalTraceModal.new(); add_child(signal_trace)
	signal_trace.completed.connect(_on_signal_completed)

	field_repair = FieldRepairModal.new(); add_child(field_repair)
	field_repair.completed.connect(_on_repair_completed)

	SceneRouter.stage_jump_requested.connect(load_stage)
	load_stage(SceneRouter.pending_campaign_stage, SceneRouter.pending_campaign_chapter)


func load_stage(stage_no: int, chapter_no: int = 1) -> void:
	current_stage_no = clampi(stage_no, 1, 12)
	current_chapter = maxi(1, chapter_no)
	_clear_stage_entities()

	# Bersihkan pencahayaan lama pada world_root
	for ch in world_root.get_children():
		if ch != top_cam and ch != fx and ch != player:
			ch.queue_free()

	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.cinematic_active = false
	GameState.set_death_slow_scale(1.0)
	_death_slow_t = 0.0
	_death_done = false

	top_cam.reset_offset()
	top_cam.reset_death_cam()
	top_cam.cam_bounds = null
	top_cam.cam_look_y = null
	top_cam.camera_anchor = null
	top_cam.set_cine_focus(null, false)

	player.custom_control_fn = Callable()
	player.custom_combat_fn = Callable()
	player.reset_state()
	hud.set_aircraft_mode(false)
	hud.hide_boss_hud()
	hud.hide_progress_bar()
	hud.hide_radio_dialogue()
	hud.show_caption("")
	hud.set_cine_bars(false)
	hud.set_cine_fade(0.0)
	hud.set_pause_visible(false)

	SaveSystem.save_campaign_stage(current_stage_no)
	AchievementManager.visit_stage(current_stage_no)
	GameState.begin_stage_stats("stage%d" % current_stage_no)

	var path := "res://src/scenes/campaign/stages/stage_%d.gd" % current_stage_no
	var scr: GDScript = load(path)
	active_stage = scr.new() as CampaignStageBase
	active_stage.stage_no = current_stage_no
	world_root.add_child(active_stage)
	active_stage.enter_stage(self, current_chapter)

	if not SceneRouter.is_touch_active() and not GameState.cinematic_active:
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)


func _clear_stage_entities() -> void:
	if active_stage and is_instance_valid(active_stage):
		active_stage.exit_stage()
		active_stage.queue_free()
		active_stage = null
	for arr in [robots, machines, crates, barrels, pickups]:
		for item in arr:
			if item and is_instance_valid(item):
				item.queue_free()
		arr.clear()
	nav_grid = null
	fx.clear_all()
	AudioManager.stop_all_loops()


func _process(delta: float) -> void:
	var dt_real := minf(delta, 0.05)
	GameState.update_time_scale(dt_real)
	var t_scale := GameState.global_time_scale()
	var dt := dt_real * t_scale

	if GameState.is_paused or GameState.is_game_over or not active_stage:
		return

	if float(GameState.player.get("hp", 0.0)) <= 0.0 and current_stage_no != 10:
		_death_slow_t += dt_real
		var zk := clampf(_death_slow_t / 1.4, 0.0, 1.0)
		top_cam.set_death_cam(lerpf(1.0, 0.55, zk), _death_slow_t * 0.85, 0.35 * zk)
		top_cam.follow(player.global_position, dt_real)
		fx.step(dt, Callable())
		if _death_slow_t >= 1.8 and not _death_done:
			_death_done = true
			trigger_stage_defeat("KIA IN ACTION")
		return

	GameState.update_stage_stats(dt_real)
	player.step(dt, dt_real)
	top_cam.cam_look_y = active_stage.cam_look_height()
	top_cam.follow(player.global_position, dt_real)
	fx.step(dt, Callable(active_stage, "is_bullet_blocked"))

	_step_machines(dt)
	_step_robots(dt)
	_step_pickups(dt)
	active_stage.step_stage(dt, dt_real)

	var marks: Array[Dictionary] = active_stage.get_radar_landmarks()
	for r in robots:
		if is_instance_valid(r) and r.state != "dead":
			marks.append({"x": r.global_position.x, "z": r.global_position.z, "color": Pal.EYE_RED, "size": 2.4})
	hud.update_runtime(player.stamina, active_stage.get_objective_text(), player.global_position, marks)


func _step_machines(dt: float) -> void:
	for m in machines:
		if not is_instance_valid(m) or m.wrecked:
			continue
		var alive_from := 0
		for r in robots:
			if is_instance_valid(r) and r.state != "dead" and r.encounter == "mach_%d" % m.get_instance_id():
				alive_from += 1
		m.step(dt, alive_from)


func _step_robots(dt: float) -> void:
	for i in range(robots.size() - 1, -1, -1):
		var r: RobotEnemy = robots[i]
		if not is_instance_valid(r):
			robots.remove_at(i)
			continue
		r.step_ai(
			dt,
			player.global_position,
			nav_grid,
			Callable(self, "_walkable_bridge"),
			Callable(self, "_resolve_bridge")
		)


func _step_pickups(dt: float) -> void:
	for i in range(pickups.size() - 1, -1, -1):
		var p: PickupDrop = pickups[i]
		if not is_instance_valid(p):
			pickups.remove_at(i)
			continue
		p.step(dt, player.global_position)


# === SPAWN HELPERS FOR STAGES ===

func spawn_robot(cls: String, pos: Vector3, encounter: String = "", start_idle: bool = false) -> RobotEnemy:
	var r := RobotEnemy.new()
	world_root.add_child(r)
	r.setup(cls, pos, current_stage_no, encounter, start_idle)
	r.robot_killed.connect(_on_robot_killed)
	r.robot_shoot_requested.connect(_on_robot_shoot)
	r.player_clawed.connect(_on_robot_claw)
	robots.append(r)
	return r


func spawn_machine(pos: Vector3, batch_interval: float = 8.0, batch_count: int = 3, max_alive: int = 8) -> SpawnMachine:
	var m := SpawnMachine.new()
	world_root.add_child(m)
	m.global_position = pos
	m.batch_interval = batch_interval
	m.batch_count = batch_count
	m.max_alive = max_alive
	m.spawn_robot_requested.connect(func(sm: SpawnMachine, sp: Vector3, cls: String):
		spawn_robot(cls, sp, "mach_%d" % sm.get_instance_id(), false)
	)
	machines.append(m)
	return m


func spawn_crate(pos: Vector3) -> LootCrate:
	var c := LootCrate.new()
	world_root.add_child(c)
	c.global_position = pos
	c.broken.connect(_on_crate_broken)
	crates.append(c)
	return c


func spawn_barrel(pos: Vector3) -> ExplosiveBarrel:
	var b := ExplosiveBarrel.new()
	world_root.add_child(b)
	b.global_position = pos
	b.exploded.connect(_on_barrel_exploded)
	barrels.append(b)
	return b


func spawn_pickup(kind: String, pos: Vector3, val: int = 25, w_id: String = "rifle") -> PickupDrop:
	var p := PickupDrop.new()
	world_root.add_child(p)
	p.setup(kind, pos, val, w_id)
	pickups.append(p)
	return p


# === MODALS & COMPLETION ===

func complete_stage(stage_no: int) -> void:
	AchievementManager.complete_stage(stage_no)
	AudioManager.stop_all_loops()
	if stage_no >= 12:
		return
	shop.open_shop("campaign", stage_no, "DEPLOY STAGE %d >>" % (stage_no + 1))


func _on_shop_closed() -> void:
	load_stage(mini(12, current_stage_no + 1), 1)


func trigger_stage_defeat(title: String = "KIA IN ACTION") -> void:
	if GameState.is_game_over:
		return
	GameState.is_game_over = true
	AchievementManager.record_death()
	AudioManager.stop_all_loops()
	AudioManager.stop_music()
	hud.set_cine_bars(false)
	hud.show_game_over(false, title, "RETRY STAGE", Callable(self, "_retry_current_stage"))


func _retry_current_stage() -> void:
	load_stage(current_stage_no, 1)


func open_ice_breach(head: String, cb: Callable) -> void:
	_ice_cb = cb
	ice_breach.open_minigame(head)


func _on_ice_completed(ok: bool) -> void:
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	if _ice_cb.is_valid():
		_ice_cb.call(ok)


func open_signal_trace(head: String, cb: Callable) -> void:
	_sig_cb = cb
	signal_trace.open_minigame(head)


func _on_signal_completed(ok: bool) -> void:
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	if _sig_cb.is_valid():
		_sig_cb.call(ok)


func open_field_repair(head: String, adv_only: bool, start_idx: int, cb: Callable) -> void:
	_rep_cb = cb
	field_repair.open_minigame(head, adv_only, start_idx)


func _on_repair_completed(ok: bool, installed: int) -> void:
	if not SceneRouter.is_touch_active():
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	if _rep_cb.is_valid():
		_rep_cb.call(ok, installed)


# === BRIDGES & COMBAT ===

func _walkable_bridge(x: float, z: float, _rad: float = 4.0) -> bool:
	return active_stage.is_walkable(x, z) if active_stage else true


func _resolve_bridge(pos: Vector3, radius: float, feet_y: float) -> Vector3:
	if active_stage:
		pos = active_stage.resolve_world(pos, radius, feet_y)
	for b in barrels:
		if is_instance_valid(b) and not b.is_dead:
			pos = b.resolve_player(pos, radius)
	for cr in crates:
		if is_instance_valid(cr) and not cr.is_broken:
			pos = cr.resolve_player(pos, radius)
	return pos


func _ground_height_bridge(x: float, z: float, cur_y: float) -> float:
	return active_stage.ground_height(x, z, cur_y) if active_stage else 0.0


func _allows_action_bridge(act: String) -> bool:
	return active_stage.allows_action(act) if active_stage else true


func _on_player_fired(w: String, orig: Vector3, dir: Vector3, dmg: float, is_rocket: bool) -> void:
	fx.spawn_player_bullet(w, orig, dir, dmg, is_rocket)


func _on_player_melee(orig: Vector3, dir: Vector3, m_range: float, dmg: float) -> void:
	var arc := float(Config.section("melee").get("arcRad", 2.094)) * 0.5
	var dir2 := Vector2(dir.x, dir.z).normalized()
	for r in robots:
		if is_instance_valid(r) and r.state != "dead":
			var to := Vector2(r.global_position.x - orig.x, r.global_position.z - orig.z)
			if to.length() <= m_range and (to.length() < 4.0 or dir2.angle_to(to.normalized()) <= arc):
				r.take_damage(dmg, true)
				fx.spawn_burst(r.global_position + Vector3(0, 6, 0), 6, false)
	for cr in crates:
		if is_instance_valid(cr) and not cr.is_broken and Vector2(cr.global_position.x - orig.x, cr.global_position.z - orig.z).length() <= m_range:
			cr.take_damage(dmg)
	for b in barrels:
		if is_instance_valid(b) and not b.is_dead and Vector2(b.global_position.x - orig.x, b.global_position.z - orig.z).length() <= m_range:
			b.take_damage(dmg)
	if active_stage:
		active_stage.handle_melee(orig, dir, m_range, dmg)


func _on_player_bullet_hit(b: Dictionary) -> void:
	if not bool(b.get("alive", true)):
		return
	if active_stage and active_stage.handle_player_bullet(b):
		return

	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var dmg := float(b.get("dmg", 0.0))
	var probe := bool(b.get("probe_only", false))

	for m in machines:
		if is_instance_valid(m) and not m.wrecked:
			if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, m.global_position.x, m.global_position.z) <= m.hit_radius * m.hit_radius:
				b["alive"] = false
				if not probe:
					GameState.stats["hits"] = int(GameState.stats["hits"]) + 1
					var was_w := m.wrecked
					m.take_damage(dmg)
					if not was_w and m.wrecked:
						fx.spawn_explosion(m.global_position + Vector3(0, 8, 0), 28.0, 0.0, Pal.TECH, false, "explode")
				return

	for r in robots:
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

	for br in barrels:
		if not is_instance_valid(br) or br.is_dead:
			continue
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, br.global_position.x, br.global_position.z) <= 20.0:
			b["alive"] = false
			if not probe:
				br.take_damage(dmg)
			return

	for cr in crates:
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
	if active_stage and active_stage.handle_enemy_bullet(b):
		return
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var pr := float(GameState.player.get("radius", 5.0))
	if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, player.global_position.x, player.global_position.z) <= pr * pr:
		b["alive"] = false
		if GameState.damage_player(float(b.get("dmg", 5.0))):
			hud.flash_damage()
			fx.spawn_burst(player.global_position + Vector3(0, 6, 0), 5, true)


func _on_explosion_damage(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	var r2 := radius * radius
	for m in machines:
		if is_instance_valid(m) and not m.wrecked:
			var d2 := Vector2(m.global_position.x - center.x, m.global_position.z - center.z).length_squared()
			if d2 <= r2:
				var was_w := m.wrecked
				m.take_damage(dmg * 0.9)
				if not was_w and m.wrecked:
					fx.spawn_explosion(m.global_position + Vector3(0, 8, 0), 28.0, 0.0, Pal.TECH, false, "explode")
	for rob in robots:
		if is_instance_valid(rob) and rob.state != "dead":
			var d2 := Vector2(rob.global_position.x - center.x, rob.global_position.z - center.z).length_squared()
			if d2 <= r2:
				var fall := clampf(1.0 - sqrt(d2) / radius, 0.25, 1.0)
				rob.take_damage(dmg * fall, not is_enemy)
	for br in barrels:
		if is_instance_valid(br) and not br.is_dead:
			if Vector2(br.global_position.x - center.x, br.global_position.z - center.z).length_squared() <= r2 * 0.7:
				br.take_damage(dmg)
	for cr in crates:
		if is_instance_valid(cr) and not cr.is_broken:
			if Vector2(cr.global_position.x - center.x, cr.global_position.z - center.z).length_squared() <= r2 * 0.7:
				cr.take_damage(dmg)
	var dp := Vector2(player.global_position.x - center.x, player.global_position.z - center.z).length()
	if dp <= radius:
		var pdmg := (dmg if is_enemy else dmg * 0.15) * clampf(1.0 - dp / radius, 0.25, 1.0)
		if pdmg > 1.0 and GameState.damage_player(pdmg):
			hud.flash_damage()
	if active_stage:
		active_stage.handle_explosion(center, radius, dmg, is_enemy)


func _on_robot_killed(rob: RobotEnemy, by_player: bool) -> void:
	if by_player:
		var dc: Dictionary = Config.section("drops")
		if randf() < float(dc.get("lootDropChance", 0.28)):
			spawn_pickup("loot", rob.global_position, int(dc.get("robotKillBase", 25)))
		if randf() < 0.14:
			spawn_pickup("ammo", rob.global_position + Vector3(3, 0, 0), 1, str(GameState.player.get("current_weapon", "rifle")))
	if active_stage:
		active_stage.on_robot_killed(rob, by_player)


func _on_robot_shoot(orig: Vector3, dir: Vector3, spd: float, dmg: float, monas_dmg: float, target_struct: bool) -> void:
	fx.spawn_enemy_bullet(orig, dir, spd, dmg, monas_dmg, target_struct)


func _on_robot_claw(_rob: RobotEnemy, dmg: float, _push: Vector2) -> void:
	if GameState.damage_player(dmg):
		hud.flash_damage()
		fx.spawn_burst(player.global_position + Vector3(0, 6, 0), 5, true)


func _on_crate_broken(_crate: LootCrate, pos: Vector3, kind: String, val: int) -> void:
	spawn_pickup("loot" if kind == "money" else kind, pos, val, str(GameState.player.get("current_weapon", "rifle")))


func _on_barrel_exploded(_b: ExplosiveBarrel, center: Vector3, radius: float, robot_dmg: float, _pdmg: float) -> void:
	fx.spawn_explosion(center, radius, robot_dmg, Color.html("#ff6020"), true, "explode")


func _on_player_died(_push: Vector2) -> void:
	GameState.set_death_slow_scale(0.32)
	AudioManager.play_sfx("death", 0.8)


func _on_resume() -> void:
	if not SceneRouter.is_touch_active() and not GameState.cinematic_active:
		Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)


func _on_skip_cinematic() -> void:
	if active_stage:
		active_stage.skip_cinematic()
