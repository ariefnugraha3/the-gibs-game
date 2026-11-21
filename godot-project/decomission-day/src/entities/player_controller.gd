class_name PlayerController
extends CharacterBody3D

## Pengendali Major Gibran lintas Desktop (WASD + Mouse Aim/Shoot + R-Click Move)
## dan Mobile (Dual Virtual Stick + tombol aksi). Mendukung custom vehicle hooks
## (Stage 8 lane control / Stage 10 aircraft flight).

signal fired_weapon(weapon_id: String, origin: Vector3, dir: Vector3, dmg: float, is_rocket: bool)
signal melee_swung(origin: Vector3, dir: Vector3, melee_range: float, dmg: float)
signal player_died(push_dir: Vector2)

var avatar: PlayerAvatar = null
var top_cam: TopDownCamera = null

var stamina := 100.0
var stamina_exhausted := false
var eye_height := 11.4

var aim_point := Vector3(0, 0, -50)
var aim_yaw := 0.0

var dodge_active := false
var dodge_progress := 0.0
var dodge_dir := Vector2.ZERO
var _dodge_t := 0.0
var _dodge_cd := 0.0

var melee_t := 0.0
var melee_cd := 0.0
var melee_side := 1.0
var _melee_hit_done := false

var medkit_mode := false
var medkit_channel := 0.0

var _fire_cd := 0.0
var _gun_heat := 0.0
var _recoil_k := 0.0
var _foot_t := 0.0
var _move_target: Variant = null # Vector2(x,z) atau null

# Input dari TouchControls (Mobile)
var touch_move_vec := Vector2.ZERO
var touch_aim_vec := Vector2.ZERO
var touch_shooting := false

# Hook opsional disuntikkan oleh scene aktif
var walkable_fn: Callable = Callable()
var resolve_fn: Callable = Callable()
var ground_height_fn: Callable = Callable()
var allows_action_fn: Callable = Callable()
var custom_control_fn: Callable = Callable()
var custom_combat_fn: Callable = Callable()
var damage_enemies_in_cone_fn: Callable = Callable()

var _move_marker_node: MeshInstance3D = null


func _ready() -> void:
	avatar = PlayerAvatar.new()
	avatar.name = "Avatar"
	add_child(avatar)
	reset_state()


func attach_camera(cam: TopDownCamera) -> void:
	top_cam = cam


func reset_state() -> void:
	var pc: Dictionary = Config.section("player")
	eye_height = float(pc.get("eyeHeight", 11.4))
	stamina = float(Config.section("stamina").get("max", 100.0))
	stamina_exhausted = false
	dodge_active = false
	dodge_progress = 0.0
	_dodge_t = 0.0
	_dodge_cd = 0.0
	melee_t = 0.0
	melee_cd = 0.0
	medkit_mode = false
	medkit_channel = 0.0
	_fire_cd = 0.0
	_gun_heat = 0.0
	_recoil_k = 0.0
	_move_target = null
	GameState.dodge_invuln = false
	if avatar:
		avatar.reset_death()
		avatar.visible = true


func step(dt: float, dt_real: float) -> void:
	if GameState.is_game_over or GameState.is_paused:
		return

	var dying := float(GameState.player.get("hp", 0.0)) <= 0.0
	if dying:
		if avatar:
			avatar.update_pose(dt, aim_yaw, false, 0.0, melee_side, 0.0, false, 0.0)
		return

	_update_timers(dt, dt_real)

	if GameState.cinematic_active:
		if avatar:
			avatar.update_pose(dt, aim_yaw, false, 0.0, melee_side, 0.0, false, 0.0)
		return

	_update_aim()

	var handled_move := false
	if custom_control_fn.is_valid():
		handled_move = bool(custom_control_fn.call(dt))
	if not handled_move:
		_update_movement(dt)

	if custom_combat_fn.is_valid():
		custom_combat_fn.call(dt)
	else:
		_update_combat(dt, dt_real)

	if avatar:
		avatar.update_pose(dt, aim_yaw, medkit_mode, melee_t, melee_side, dodge_progress, dodge_active, _recoil_k)


func _update_timers(dt: float, dt_real: float) -> void:
	if _dodge_cd > 0.0:
		_dodge_cd = maxf(0.0, _dodge_cd - dt)
	if melee_cd > 0.0:
		melee_cd = maxf(0.0, melee_cd - dt)
	if _fire_cd > 0.0:
		_fire_cd = maxf(0.0, _fire_cd - dt_real)

	var wc: Dictionary = Config.section("weapons")
	_gun_heat = maxf(0.0, _gun_heat - float(wc.get("heatCoolPerSec", 1.4)) * dt)
	_recoil_k = maxf(0.0, _recoil_k - dt * 6.0)

	# Regen stamina
	var sc: Dictionary = Config.section("stamina")
	if not dodge_active:
		stamina = minf(float(sc.get("max", 100.0)), stamina + float(sc.get("regenPerSec", 10.0)) * dt)
		if stamina_exhausted and stamina >= float(sc.get("recoverThreshold", 20.0)):
			stamina_exhausted = false

	# Update melee swing
	if melee_t > 0.0:
		melee_t = maxf(0.0, melee_t - dt)
		if not _melee_hit_done and melee_t <= 0.30:
			_melee_hit_done = true
			var mc: Dictionary = Config.section("melee")
			var dir := Vector3(sin(aim_yaw), 0.0, cos(aim_yaw))
			melee_swung.emit(global_position, dir, float(mc.get("range", 7.0)) * Config.CAMP_M, float(mc.get("damage", 125.0)))


func _update_aim() -> void:
	if touch_aim_vec.length_squared() > 0.04:
		var basis_up := top_cam.screen_up if top_cam else Vector2(0, -1)
		var basis_left := top_cam.screen_left if top_cam else Vector2(-1, 0)
		var world_dir := basis_up * (-touch_aim_vec.y) + basis_left * (-touch_aim_vec.x)
		if world_dir.length_squared() > 1e-4:
			world_dir = world_dir.normalized()
			aim_point = global_position + Vector3(world_dir.x, 0.0, world_dir.y) * 90.0
			aim_yaw = atan2(world_dir.x, world_dir.y)
		return

	if top_cam and not SceneRouter.is_touch_active():
		var mpos := get_viewport().get_mouse_position()
		aim_point = top_cam.raycast_ground(mpos, global_position.y)
		var dx := aim_point.x - global_position.x
		var dz := aim_point.z - global_position.z
		if dx * dx + dz * dz > 1e-4:
			aim_yaw = atan2(dx, dz)


func _read_move_axis() -> Vector2:
	if touch_move_vec.length_squared() > 0.02:
		return touch_move_vec.limit_length(1.0)
	var x := Input.get_axis("move_left", "move_right")
	var y := Input.get_axis("move_up", "move_down")
	var v := Vector2(x, y)
	return v.limit_length(1.0)


func _update_movement(dt: float) -> void:
	var old_x := global_position.x
	var old_z := global_position.z
	var step60 := dt * 60.0

	if dodge_active:
		var dur := maxf(0.1, float(Config.section("dodge").get("durationSec", 0.45)))
		_dodge_t = maxf(0.0, _dodge_t - dt)
		dodge_progress = clampf(1.0 - _dodge_t / dur, 0.0, 1.0)
		var spd_mul := _dodge_speed_curve(dodge_progress) * 2.15
		var spd := float(Config.section("dodge").get("speed", 2.2)) * spd_mul * step60
		global_position.x += dodge_dir.x * spd
		global_position.z += dodge_dir.y * spd
		if _dodge_t <= 0.0:
			dodge_active = false
			GameState.dodge_invuln = false
	else:
		var axis := _read_move_axis()
		var key_move := axis.length_squared() > 0.01
		if key_move:
			_move_target = null
			_hide_move_marker()

		var move_dir := Vector2.ZERO
		if key_move:
			var sup := top_cam.screen_up if top_cam else Vector2(0, -1)
			var sleft := top_cam.screen_left if top_cam else Vector2(-1, 0)
			# axis.y < 0 berarti atas layar (+sup), axis.x < 0 berarti kiri (+sleft)
			move_dir = (sup * (-axis.y) + sleft * (-axis.x)).normalized()
		elif _move_target is Vector2:
			var to_t := (_move_target as Vector2) - Vector2(global_position.x, global_position.z)
			if to_t.length() < 3.0:
				_move_target = null
				_hide_move_marker()
			else:
				move_dir = to_t.normalized()

		if move_dir.length_squared() > 0.001:
			var aim_vec := Vector2(sin(aim_yaw), cos(aim_yaw))
			var dot := move_dir.dot(aim_vec)
			var mc: Dictionary = Config.section("movement")
			var strafe_w := float(mc.get("strafeWeight", 0.5))
			var back_w := float(mc.get("backpedalWeight", 0.5))
			var dir_mul := lerpf(strafe_w, 1.0, dot) if dot >= 0.0 else lerpf(strafe_w, back_w, -dot)
			var med_mul := float(Config.section("player").get("medkitSlowMul", 0.75)) if medkit_mode else 1.0
			var spd := float(GameState.player.get("speed", 1.5)) * dir_mul * med_mul * step60
			global_position.x += move_dir.x * spd
			global_position.z += move_dir.y * spd

			_foot_t -= dt
			if _foot_t <= 0.0:
				_foot_t = 0.34
				AudioManager.play_sfx("footstep", 0.28, randf_range(0.92, 1.08))

	# Collision & ground height dari scene aktif
	var pr := float(GameState.player.get("radius", 5.0))
	if walkable_fn.is_valid():
		global_position = NavGrid2D.slide_walk(walkable_fn, global_position, old_x, old_z, pr)
	if resolve_fn.is_valid():
		var resolved: Variant = resolve_fn.call(global_position, pr, global_position.y)
		if resolved is Vector3:
			global_position = resolved
	if ground_height_fn.is_valid():
		var gy := float(ground_height_fn.call(global_position.x, global_position.z, global_position.y))
		global_position.y = gy


func _dodge_speed_curve(p: float) -> float:
	var rise := clampf((p - 0.08) / 0.10, 0.0, 1.0)
	var fall := 1.0 - clampf((p - 0.18) / 0.82, 0.0, 1.0)
	return rise * rise * (3.0 - 2.0 * rise) * fall * fall


func _update_combat(dt: float, _dt_real: float) -> void:
	var want_shoot := Input.is_action_pressed("shoot") or touch_shooting
	if medkit_mode:
		if want_shoot and int(GameState.player.get("medkits", 0)) > 0 and float(GameState.player["hp"]) < float(GameState.player["max_hp"]):
			medkit_channel += dt
			var need := float(Config.section("player").get("medkitUseSec", 2.0))
			if medkit_channel >= need:
				medkit_channel = 0.0
				GameState.player["medkits"] = int(GameState.player["medkits"]) - 1
				var heal := float(GameState.player["max_hp"]) * float(Config.section("player").get("medkitHealPct", 0.5))
				GameState.player["hp"] = minf(float(GameState.player["max_hp"]), float(GameState.player["hp"]) + heal)
				AudioManager.play_sfx("heal", 0.8)
				medkit_mode = false
				GameState.ui_dirty.emit()
		else:
			medkit_channel = 0.0
		return

	if not want_shoot or _fire_cd > 0.0 or melee_t > 0.0 or dodge_active:
		return

	var w := str(GameState.player.get("current_weapon", "pistol"))
	var ammo_left := int(GameState.player["ammo"].get(w, 0))
	if ammo_left <= 0:
		_fire_cd = 0.25
		AudioManager.play_sfx("empty", 0.65)
		return

	GameState.player["ammo"][w] = ammo_left - 1
	_fire_cd = GameState.weapon_fire_delay_sec(w)
	var wc: Dictionary = Config.section("weapons")
	_gun_heat = minf(1.0, _gun_heat + float(wc.get("heatPerShot", 0.22)))
	_recoil_k = 1.0

	var muzzle := avatar.gun_tip.global_position if avatar and avatar.gun_tip else (global_position + Vector3(0, 8, 0))
	var base_dir := Vector3(sin(aim_yaw), 0.0, cos(aim_yaw)).normalized()
	var dmg := GameState.weapon_damage(w)
	var spread := float(wc.get("spreadBase", 0.055)) + _gun_heat * float(wc.get("spreadBloom", 0.05))
	var lvl := int(GameState.player["weapon_lvl"].get(w, 0))

	if w == "shotgun":
		var pellets := int(wc.get("shotgun", {}).get("pellets", 12))
		var p_spread := float(wc.get("shotgun", {}).get("pelletSpread", 0.1))
		for i in pellets:
			var ang := randf_range(-p_spread, p_spread)
			var d := base_dir.rotated(Vector3.UP, ang)
			GameState.stats["shots"] = int(GameState.stats["shots"]) + 1
			fired_weapon.emit(w, muzzle, d, dmg, false)
		AudioManager.play_sfx("shotgun", 0.85)
	elif w == "launcher":
		var is_rocket := lvl >= 3
		GameState.stats["shots"] = int(GameState.stats["shots"]) + 1
		fired_weapon.emit(w, muzzle, base_dir, dmg, is_rocket)
		AudioManager.play_sfx("rocket_shot" if is_rocket else "launcher_shot", 0.85)
	else:
		var ang := randf_range(-spread, spread)
		var d := base_dir.rotated(Vector3.UP, ang)
		GameState.stats["shots"] = int(GameState.stats["shots"]) + 1
		fired_weapon.emit(w, muzzle, d, dmg, false)
		AudioManager.play_sfx("pistol" if w == "pistol" else "shoot", 0.72)

	if top_cam:
		var kick := float(wc.get(w, {}).get("cameraKick", 0.015)) * 18.0
		top_cam.add_shake(kick)
	GameState.ui_dirty.emit()


func try_dodge() -> void:
	if GameState.is_paused or GameState.is_game_over or GameState.cinematic_active:
		return
	if allows_action_fn.is_valid() and not bool(allows_action_fn.call("dodge")):
		return
	if dodge_active or _dodge_cd > 0.0 or stamina_exhausted or medkit_mode:
		return
	var dc: Dictionary = Config.section("dodge")
	var cost := float(dc.get("staminaCost", 20.0))
	if stamina < cost:
		return
	stamina -= cost
	if stamina <= 0.0:
		stamina = 0.0
		stamina_exhausted = true

	var axis := _read_move_axis()
	if axis.length_squared() > 0.02:
		var sup := top_cam.screen_up if top_cam else Vector2(0, -1)
		var sleft := top_cam.screen_left if top_cam else Vector2(-1, 0)
		dodge_dir = (sup * (-axis.y) + sleft * (-axis.x)).normalized()
	else:
		dodge_dir = Vector2(-sin(aim_yaw), -cos(aim_yaw)).normalized()

	dodge_active = true
	dodge_progress = 0.0
	_dodge_t = float(dc.get("durationSec", 0.45))
	_dodge_cd = float(dc.get("cooldownSec", 1.0))
	GameState.dodge_invuln = true
	_move_target = null
	_hide_move_marker()
	AudioManager.play_sfx("melee_swing", 0.35, 1.15)


func try_melee() -> void:
	if GameState.is_paused or GameState.is_game_over or GameState.cinematic_active:
		return
	if allows_action_fn.is_valid() and not bool(allows_action_fn.call("melee")):
		return
	if melee_t > 0.0 or melee_cd > 0.0 or dodge_active or stamina_exhausted:
		return
	var cost := float(Config.section("stamina").get("meleeCost", 20.0))
	if stamina < cost:
		return
	stamina -= cost
	if stamina <= 0.0:
		stamina = 0.0
		stamina_exhausted = true

	medkit_mode = false
	melee_t = 0.45
	melee_cd = float(Config.section("melee").get("cooldownSec", 0.8))
	melee_side = -melee_side
	_melee_hit_done = false
	AudioManager.play_sfx("melee_swing", 0.7)


func toggle_medkit() -> void:
	if int(GameState.player.get("medkits", 0)) <= 0:
		return
	medkit_mode = not medkit_mode
	medkit_channel = 0.0
	AudioManager.play_sfx("switch", 0.5)
	GameState.ui_dirty.emit()


func switch_slot(slot_idx: int) -> void:
	var weapons: Array = GameState.player["weapons"]
	if slot_idx < 0 or slot_idx >= weapons.size():
		return
	medkit_mode = false
	GameState.set_current_weapon(str(weapons[slot_idx]))
	AudioManager.play_sfx("switch", 0.65)


func set_move_target_from_mouse(screen_pos: Vector2) -> void:
	if allows_action_fn.is_valid() and not bool(allows_action_fn.call("moveTarget")):
		return
	if not top_cam:
		return
	var pt := top_cam.raycast_ground(screen_pos, global_position.y)
	_move_target = Vector2(pt.x, pt.z)
	_show_move_marker(pt)


func _show_move_marker(pt: Vector3) -> void:
	if not _move_marker_node and get_parent():
		_move_marker_node = ProceduralBuilder.add_ring(get_parent(), 2.2, 3.3, Pal.unique_mat(Pal.TECH, Pal.TECH, 0.8, 0.3, 0.0, true, 0.75, true), pt)
	if _move_marker_node:
		_move_marker_node.global_position = Vector3(pt.x, pt.y + 0.35, pt.z)
		_move_marker_node.visible = true


func _hide_move_marker() -> void:
	if _move_marker_node:
		_move_marker_node.visible = false


func _unhandled_input(event: InputEvent) -> void:
	if GameState.is_paused or GameState.is_game_over or GameState.cinematic_active:
		return
	if SceneRouter.is_touch_active():
		return
	if event.is_action_pressed("dodge"):
		try_dodge()
	elif event.is_action_pressed("melee"):
		try_melee()
	elif event.is_action_pressed("medkit"):
		toggle_medkit()
	elif event.is_action_pressed("weapon_1"):
		switch_slot(0)
	elif event.is_action_pressed("weapon_2"):
		switch_slot(1)
	elif event.is_action_pressed("weapon_3"):
		switch_slot(2)
	elif event.is_action_pressed("weapon_swap"):
		var weapons: Array = GameState.player.get("weapons", ["pistol"])
		if weapons.size() > 1:
			var cur := weapons.find(str(GameState.player.get("current_weapon", "pistol")))
			switch_slot((cur + 1) % weapons.size())
	elif event.is_action_pressed("move_click"):
		set_move_target_from_mouse(get_viewport().get_mouse_position())
