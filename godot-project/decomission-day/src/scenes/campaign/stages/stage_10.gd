extends CampaignStageBase

## Stage 10 — Operasi Udara "Air Strike 1944" (Pesawat Tempur vs Konvoi Laut & Heavy Siege Bomber):
## Membaca konfigurasi dari config/stage10.json (bagian flight):
## terbang top-down ke timur di atas Pulau Jawa -> Laut Jawa -> Kalimantan,
## tembakan meriam otomatis bertingkat, bom ground-target (Spasi/RMB/Touch),
## musuh udara C/B/A, kapal patroli & turret darat, powerup, dan Boss Heavy Siege Bomber.

var _cfg: Dictionary = {}
var _plane: Node3D
var _prop_spinner: Node3D
var _plane_pos := Vector3(-110, 40, 0)
var _bank := 0.0
var _gun_lvl := 1
var _bombs := 3
var _fire_cd := 0.0
var _bomb_cd := 0.0
var _hp := 1000.0
var _max_hp := 1000.0

var _elapsed := 0.0
var _spawn_t := 1.2
var _ground_t := 2.4
var _ground_chunks: Array[Node3D] = []
var _air_enemies: Array[Dictionary] = []
var _ground_targets: Array[Dictionary] = []
var _powerups: Array[Dictionary] = []

var _boss: Node3D = null
var _boss_parts: Array[Dictionary] = []
var _boss_active := false
var _boss_hp := 8000.0
var _boss_max := 8000.0
var _boss_fire_t := 0.8
var _done := false


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 10
	_cfg = Config.stage_cfg(10).get("flight", {})
	ProceduralBuilder.setup_lighting(host.world_root, "flight")

	_max_hp = float(_cfg.get("playerHp", 1000.0))
	_hp = _max_hp
	_bombs = int(_cfg.get("startBombs", 3))
	_gun_lvl = 1

	var env := Node3D.new(); env.name = "Stage10AirEnv"; add_child(env)
	# Lapisan laut & awan
	ProceduralBuilder.add_box(env, Vector3(1600, 1.0, 900), Pal.mat(Color.html("#0d2842")), Vector3(0, -18, 0), Vector3.ZERO, false)
	for i in 16:
		var ch := Node3D.new()
		ch.position = Vector3(-700.0 + float(i) * 100.0, -16.5, 0.0)
		var island := i < 4 or i > 11
		ProceduralBuilder.add_box(ch, Vector3(88, 1.4, 210 if island else 38), Pal.mat(Pal.PARK_GRASS if island else Pal.STEEL, Color.BLACK, 0.0, 0.9, 0.0), Vector3(0, 0.7, randf_range(-110, 110)), Vector3.ZERO, false)
		ProceduralBuilder.add_box(ch, Vector3(32, 0.5, 16), Pal.mat(Pal.WHITE, Color.BLACK, 0.0, 0.9, 0.0, true, 0.35), Vector3(randf_range(-20, 20), 22.0, randf_range(-120, 120)), Vector3.ZERO, false)
		env.add_child(ch)
		_ground_chunks.append(ch)

	_build_player_fighter()
	host.player.avatar.visible = false
	host.player.custom_control_fn = Callable(self, "custom_player_control")
	host.player.custom_combat_fn = Callable(self, "custom_player_combat")
	host.top_cam.set_offset(Vector3(0, 240, 28))
	host.top_cam.snap_to(Vector3(0, 40, 0))
	host.hud.set_aircraft_mode(true, _bombs)
	host.hud.show_boss_hud("AIRCRAFT INTEGRITY", _hp, _max_hp)
	AudioManager.start_battle_music()
	host.hud.show_stage_msg("STAGE 10 // AIR STRIKE — FLY TO KALIMANTAN!", 3.2)


func _build_player_fighter() -> void:
	_plane = Node3D.new()
	add_child(_plane)
	var m_body := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.45, 0.55)
	var m_trim := Pal.mat(Pal.AMBER, Pal.AMBER, 0.4)
	var m_glass := Pal.mat(Pal.TECH, Pal.TECH, 0.6)
	ProceduralBuilder.add_box(_plane, Vector3(22, 4.0, 5.0), m_body, Vector3.ZERO)
	ProceduralBuilder.add_box(_plane, Vector3(7.0, 1.2, 24.0), m_body, Vector3(1.0, 0, 0))
	ProceduralBuilder.add_box(_plane, Vector3(4.0, 1.0, 10.0), m_trim, Vector3(-9.0, 1.0, 0))
	ProceduralBuilder.add_box(_plane, Vector3(6.0, 2.2, 3.0), m_glass, Vector3(3.0, 2.2, 0), Vector3.ZERO, false)
	_prop_spinner = Node3D.new(); _prop_spinner.position = Vector3(11.5, 0, 0); _plane.add_child(_prop_spinner)
	ProceduralBuilder.add_box(_prop_spinner, Vector3(0.8, 7.5, 1.0), Pal.mat(Pal.INK), Vector3.ZERO)
	_plane.global_position = _plane_pos


func exit_stage() -> void:
	if is_instance_valid(host) and is_instance_valid(host.player):
		host.player.custom_control_fn = Callable()
		host.player.custom_combat_fn = Callable()
		host.player.avatar.visible = true
		host.hud.set_aircraft_mode(false)
		host.hud.hide_boss_hud()


func custom_player_control(dt: float) -> bool:
	var ax := Input.get_axis("move_left", "move_right")
	var az := Input.get_axis("move_up", "move_down")
	if host.player.touch_move_vec.length_squared() > 0.04:
		ax = host.player.touch_move_vec.x
		az = host.player.touch_move_vec.y
	var spd := float(_cfg.get("playerSpeed", 145.0))
	_plane_pos.x = clampf(_plane_pos.x + ax * spd * dt, -145.0, 130.0)
	_plane_pos.z = clampf(_plane_pos.z + az * spd * dt, -105.0, 105.0)
	_bank = lerpf(_bank, -az * 0.45, clampf(dt * 8.0, 0.0, 1.0))
	_plane.global_position = _plane_pos
	_plane.rotation.x = _bank
	_prop_spinner.rotation.x += dt * 32.0
	host.player.global_position = _plane_pos
	host.top_cam.follow(Vector3(0, 40, 0), dt)
	return true


func custom_player_combat(dt: float) -> void:
	_fire_cd = maxf(0.0, _fire_cd - dt)
	_bomb_cd = maxf(0.0, _bomb_cd - dt)
	var shooting: bool = Input.is_action_pressed("shoot") or bool(host.player.touch_shooting)
	if shooting and _fire_cd <= 0.0:
		_fire_cd = 0.14
		var dmg := 36.0 + float(_gun_lvl - 1) * 14.0
		var orig := _plane_pos + Vector3(12, 0, 0)
		host.fx.spawn_player_bullet("rifle", orig, Vector3(1, 0, 0), dmg, false)
		if _gun_lvl >= 2:
			host.fx.spawn_player_bullet("rifle", orig + Vector3(0, 0, -4), Vector3(1, 0, -0.06).normalized(), dmg * 0.8, false)
			host.fx.spawn_player_bullet("rifle", orig + Vector3(0, 0, 4), Vector3(1, 0, 0.06).normalized(), dmg * 0.8, false)
		AudioManager.play_sfx("shoot", 0.45)

	var drop_bomb := Input.is_action_just_pressed("bomb") or Input.is_action_just_pressed("move_click")
	if drop_bomb and _bomb_cd <= 0.0 and _bombs > 0:
		_bomb_cd = 0.7
		_bombs -= 1
		host.hud.set_aircraft_mode(true, _bombs)
		var drop_pt := Vector3(_plane_pos.x + 18.0, -14.0, _plane_pos.z)
		host.fx.spawn_explosion(drop_pt, 56.0, 260.0, Color.html("#ff7722"), false, "rocket_explode")
		_damage_ground_radius(drop_pt, 62.0, 280.0)
		if _boss_active and _boss and is_instance_valid(_boss):
			_damage_boss_aoe(_plane_pos + Vector3(18, 0, 0), 62.0, 240.0)


func step_stage(dt: float, _dt_real: float) -> void:
	_elapsed += dt
	for ch in _ground_chunks:
		ch.position.x -= float(_cfg.get("scrollSpeed", 26.0)) * 5.0 * dt
		if ch.position.x < -800.0:
			ch.position.x += 1600.0

	if not _boss_active:
		_spawn_t -= dt
		if _spawn_t <= 0.0:
			_spawn_t = 1.65
			_spawn_air_wave()
		_ground_t -= dt
		if _ground_t <= 0.0:
			_ground_t = 3.2
			_spawn_ground_target()
		if _elapsed >= 55.0:
			_spawn_bomber_boss()
	else:
		_step_bomber_boss(dt)

	_step_air_enemies(dt)
	_step_ground_targets(dt)
	_step_powerups(dt)

	if not _boss_active:
		host.hud.show_boss_hud("AIRCRAFT HP: %d/%d  |  BOMBS: %d" % [roundi(_hp), roundi(_max_hp), _bombs], _hp, _max_hp)


func _spawn_air_wave() -> void:
	var kind: String = ["airC", "airB", "airA"][randi() % 3]
	var count := 3 if kind == "airC" else 2
	var base_z := randf_range(-85.0, 85.0)
	for i in count:
		var n := Node3D.new(); add_child(n)
		var col: Color = Pal.CLASS_LOOK["C"]["armor"] if kind == "airC" else (Pal.CLASS_LOOK["B"]["armor"] if kind == "airB" else Pal.CLASS_LOOK["A"]["armor"])
		ProceduralBuilder.add_box(n, Vector3(14, 3, 18), Pal.mat(col), Vector3.ZERO)
		n.position = Vector3(210.0 + float(i) * 18.0, 40.0, clampf(base_z + float(i - 1) * 18.0, -95.0, 95.0))
		_air_enemies.append({"node": n, "kind": kind, "hp": 80.0 if kind == "airC" else 160.0, "shoot_t": randf_range(0.6, 1.4), "vx": -85.0})


func _spawn_ground_target() -> void:
	var n := Node3D.new(); add_child(n)
	ProceduralBuilder.add_box(n, Vector3(26, 7, 12), Pal.mat(Pal.GUNMETAL), Vector3.ZERO)
	ProceduralBuilder.add_box(n, Vector3(8, 5, 8), Pal.mat(Pal.HAZARD, Pal.HAZARD, 0.7), Vector3(0, 5, 0))
	n.position = Vector3(220.0, -15.0, randf_range(-90.0, 90.0))
	_ground_targets.append({"node": n, "hp": 180.0, "shoot_t": 1.6})


func _step_air_enemies(dt: float) -> void:
	for i in range(_air_enemies.size() - 1, -1, -1):
		var e: Dictionary = _air_enemies[i]
		var n: Node3D = e["node"]
		n.position.x += float(e["vx"]) * dt
		n.position.z += sin(_elapsed * 3.0 + float(i)) * 22.0 * dt
		e["shoot_t"] = float(e["shoot_t"]) - dt
		if float(e["shoot_t"]) <= 0.0 and n.position.x > _plane_pos.x:
			e["shoot_t"] = 1.8
			var dir := (_plane_pos - n.position).normalized()
			host.fx.spawn_enemy_bullet(n.position, dir, 2.0, 45.0, 0.0, false, true)
		if n.position.x < -210.0:
			n.queue_free()
			_air_enemies.remove_at(i)


func _step_ground_targets(dt: float) -> void:
	for i in range(_ground_targets.size() - 1, -1, -1):
		var g: Dictionary = _ground_targets[i]
		var n: Node3D = g["node"]
		n.position.x -= float(_cfg.get("scrollSpeed", 26.0)) * 4.5 * dt
		g["shoot_t"] = float(g["shoot_t"]) - dt
		if float(g["shoot_t"]) <= 0.0 and n.position.x > -100.0:
			g["shoot_t"] = 2.4
			var dir := (_plane_pos - n.position).normalized()
			host.fx.spawn_enemy_bullet(n.position, dir, 1.8, 40.0)
		if n.position.x < -230.0:
			n.queue_free()
			_ground_targets.remove_at(i)


func _step_powerups(dt: float) -> void:
	for i in range(_powerups.size() - 1, -1, -1):
		var p: Dictionary = _powerups[i]
		var n: Node3D = p["node"]
		n.position.x -= 48.0 * dt
		n.rotation.y += dt * 3.0
		if Vector2(n.position.x - _plane_pos.x, n.position.z - _plane_pos.z).length() < 18.0:
			var k := str(p["kind"])
			if k == "weapon":
				_gun_lvl = mini(3, _gun_lvl + 1)
				host.hud.show_pickup("CANNON UPGRADED LV %d" % _gun_lvl, Pal.TECH)
			elif k == "bomb":
				_bombs += 1
				host.hud.set_aircraft_mode(true, _bombs)
				host.hud.show_pickup("+1 HEAVY BOMB", Pal.AMBER)
			else:
				_hp = minf(_max_hp, _hp + 250.0)
				host.hud.show_pickup("+250 AIRCRAFT REPAIR", Pal.EXIT_GREEN)
			AudioManager.play_sfx("pickup", 0.8)
			n.queue_free()
			_powerups.remove_at(i)
		elif n.position.x < -200.0:
			n.queue_free()
			_powerups.remove_at(i)


func _spawn_bomber_boss() -> void:
	_boss_active = true
	var bcfg: Dictionary = _cfg.get("boss", {})
	_boss_max = float(bcfg.get("hp", 8000.0))
	_boss_hp = _boss_max
	_boss = Node3D.new(); _boss.position = Vector3(135.0, 40.0, 0.0); add_child(_boss)
	ProceduralBuilder.add_box(_boss, Vector3(44, 10, 18), Pal.mat(Pal.GUNMETAL), Vector3.ZERO)
	ProceduralBuilder.add_box(_boss, Vector3(22, 4, 96), Pal.mat(Pal.STEEL), Vector3(0, 2, 0))
	for pz in [-34.0, 0.0, 34.0]:
		var node := ProceduralBuilder.add_box(_boss, Vector3(14, 7, 14), Pal.unique_mat(Pal.HAZARD, Pal.HAZARD, 0.8), Vector3(-6, 3, pz))
		_boss_parts.append({"node": node, "hp": _boss_max / 3.0, "alive": true, "z": pz})
	AudioManager.start_boss_music()
	host.hud.show_stage_msg("WARNING // HEAVY SIEGE BOMBER!", 3.2)


func _step_bomber_boss(dt: float) -> void:
	if not _boss or _done:
		return
	_boss.position.z = lerpf(_boss.position.z, sin(_elapsed * 0.9) * 58.0, clampf(dt * 3.0, 0.0, 1.0))
	_boss_fire_t -= dt
	if _boss_fire_t <= 0.0:
		_boss_fire_t = 0.85
		for pt in _boss_parts:
			if bool(pt["alive"]):
				var orig := _boss.global_position + Vector3(-10, 0, float(pt["z"]))
				var dir := (_plane_pos - orig).normalized()
				host.fx.spawn_enemy_bullet(orig, dir, 2.3, 55.0, 0.0, false, true)
	host.hud.show_boss_hud("HEAVY SIEGE BOMBER  |  AC HP %d" % roundi(_hp), _boss_hp, _boss_max)


func handle_player_bullet(b: Dictionary) -> bool:
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	var dmg := float(b.get("dmg", 36.0))
	for i in range(_air_enemies.size() - 1, -1, -1):
		var e: Dictionary = _air_enemies[i]
		var n: Node3D = e["node"]
		if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, n.global_position.x, n.global_position.z) <= 13.0 * 13.0:
			b["alive"] = false
			e["hp"] = float(e["hp"]) - dmg
			if float(e["hp"]) <= 0.0:
				_drop_powerup_chance(n.global_position)
				host.fx.spawn_explosion(n.global_position, 16.0, 0.0, Color.html("#ff7020"), false, "explode")
				GameState.add_score(100)
				n.queue_free()
				_air_enemies.remove_at(i)
			return true

	if _boss_active and not _done and _boss:
		for pt in _boss_parts:
			if not bool(pt["alive"]): continue
			var n: Node3D = pt["node"]
			if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, n.global_position.x, n.global_position.z) <= 16.0 * 16.0:
				b["alive"] = false
				_damage_bomber_part(pt, dmg)
				return true
	return false


func _damage_bomber_part(pt: Dictionary, dmg: float) -> void:
	pt["hp"] = float(pt["hp"]) - dmg
	_boss_hp = maxf(0.0, _boss_hp - dmg)
	if float(pt["hp"]) <= 0.0:
		pt["alive"] = false
		(pt["node"] as Node3D).visible = false
		host.fx.spawn_explosion((pt["node"] as Node3D).global_position, 24.0, 0.0, Color.html("#ff5522"), false, "tank_explode")
	var any := false
	for p in _boss_parts:
		if bool(p["alive"]): any = true
	if not any and not _done:
		_done = true
		AchievementManager.record_boss("bomber")
		host.fx.spawn_explosion(_boss.global_position, 50.0, 0.0, Color.html("#ff5522"), false, "tank_explode")
		_boss.visible = false
		host.hud.show_stage_msg("BOMBER DESTROYED — TOUCHDOWN KALIMANTAN!", 3.2)
		get_tree().create_timer(2.6).timeout.connect(func():
			if is_instance_valid(host):
				host.complete_stage(10)
		)


func _damage_ground_radius(pt: Vector3, rad: float, dmg: float) -> void:
	for i in range(_ground_targets.size() - 1, -1, -1):
		var g: Dictionary = _ground_targets[i]
		var n: Node3D = g["node"]
		if Vector2(n.position.x - pt.x, n.position.z - pt.z).length() <= rad:
			g["hp"] = float(g["hp"]) - dmg
			if float(g["hp"]) <= 0.0:
				_drop_powerup_chance(Vector3(n.position.x, 40.0, n.position.z))
				GameState.add_score(160)
				n.queue_free()
				_ground_targets.remove_at(i)


func _damage_boss_aoe(pt: Vector3, rad: float, dmg: float) -> void:
	for part in _boss_parts:
		if bool(part["alive"]):
			var n: Node3D = part["node"]
			if Vector2(n.global_position.x - pt.x, n.global_position.z - pt.z).length() <= rad:
				_damage_bomber_part(part, dmg)


func _drop_powerup_chance(pos: Vector3) -> void:
	if randf() > 0.25:
		return
	var kind: String = ["weapon", "bomb", "repair"][randi() % 3]
	var col := Pal.TECH if kind == "weapon" else (Pal.AMBER if kind == "bomb" else Pal.EXIT_GREEN)
	var n := ProceduralBuilder.add_box(self, Vector3(7, 4, 7), Pal.mat(col, col, 1.0), pos)
	_powerups.append({"node": n, "kind": kind})


func handle_enemy_bullet(b: Dictionary) -> bool:
	var p1: Vector3 = b["prev"]
	var p2: Vector3 = b["pos"]
	if NavGrid2D.seg_point_dist_sq(p1.x, p1.z, p2.x, p2.z, _plane_pos.x, _plane_pos.z) <= 10.0 * 10.0:
		b["alive"] = false
		_hp -= float(b.get("dmg", 40.0))
		AchievementManager.record_hit()
		host.hud.flash_damage()
		if _hp <= 0.0:
			_hp = 0.0
			host.trigger_stage_defeat("AIRCRAFT SHOT DOWN")
		return true
	return false


func get_objective_text() -> String:
	if _boss_active:
		return "STAGE 10 // DESTROY HEAVY SIEGE BOMBER"
	return "STAGE 10 // AIR STRIKE — KALIMANTAN APPROACH (%d%%)" % mini(100, roundi(_elapsed / 55.0 * 100.0))
