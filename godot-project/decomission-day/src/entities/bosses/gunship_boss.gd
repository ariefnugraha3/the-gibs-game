class_name GunshipBoss
extends Node3D

## Boss Combat Gunship Stage 8 (duel pengejaran Tol Cisumdawu): rotor berputar,
## rentetan MG, tembakan kanon lead, dan misil homing yang bisa ditembak jatuh.

signal boss_hp_changed(hp: float, max_hp: float, subtitle: String)
signal boss_defeated(boss: GunshipBoss)
signal player_hit_requested(dmg: float)

var hp := 12000.0
var max_hp := 12000.0
var active := false
var dead := false
var enraged := false

var _rotor: Node3D
var _state := "gap"
var _timer := 1.5
var _burst_left := 0
var _burst_cd := 0.0
var _missiles: Array[Dictionary] = []
var _hover_t := 0.0


func _ready() -> void:
	_build_mesh()
	reset_boss()


func _build_mesh() -> void:
	var m_body := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.55, 0.45)
	var m_dark := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.3)
	var m_glass := Pal.mat(Pal.SCREEN_BG, Pal.HAZARD, 0.45, 0.2, 0.1)
	ProceduralBuilder.add_box(self, Vector3(14, 9, 44), m_body, Vector3(0, 0, 0))
	ProceduralBuilder.add_box(self, Vector3(46, 3.2, 11), m_dark, Vector3(0, 0.5, 4))
	ProceduralBuilder.add_box(self, Vector3(9, 6, 12), m_glass, Vector3(0, -1, 18))
	_rotor = Node3D.new(); _rotor.position = Vector3(0, 7, 2); add_child(_rotor)
	ProceduralBuilder.add_box(_rotor, Vector3(58, 0.6, 3.2), m_dark, Vector3.ZERO)
	ProceduralBuilder.add_box(_rotor, Vector3(3.2, 0.6, 58), m_dark, Vector3.ZERO)


func reset_boss() -> void:
	var c := _cfg()
	max_hp = float(c.get("hp", 12000.0))
	hp = max_hp
	active = false
	dead = false
	enraged = false
	_state = "gap"
	_timer = float(c.get("attackGapSec", 1.5))
	for m in _missiles:
		(m["node"] as Node).queue_free()
	_missiles.clear()


func activate_boss() -> void:
	active = true
	boss_hp_changed.emit(hp, max_hp, "COMBAT GUNSHIP")


func _cfg() -> Dictionary:
	return Config.campaign().get("bosses", {}).get("gunship", {})


func step(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	_rotor.rotation.y += dt * 16.0
	_update_missiles(dt, player_pos, fx)
	if not active or dead:
		return

	var c := _cfg()
	_hover_t += dt
	enraged = hp <= max_hp * float(c.get("enrageHpFrac", 0.5))
	global_position.z = lerpf(global_position.z, player_pos.z + sin(_hover_t * 1.3) * 42.0, clampf(dt * 1.8, 0.0, 1.0))

	match _state:
		"gap":
			_timer -= dt
			if _timer <= 0.0:
				var pick := randi() % 3
				if pick == 0:
					_state = "mg"
					_burst_left = int(c.get("mgBurst", 16))
					_burst_cd = 0.0
				elif pick == 1:
					_state = "cannon"
					_timer = float(c.get("cannonTelegraphSec", 1.1))
				else:
					_state = "missile"
					_burst_left = int(c.get("missileBurst", 3))
					_burst_cd = 0.0
		"mg":
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("mgIntervalSec", 0.1))
				_burst_left -= 1
				var orig := global_position + Vector3(0, -4, 10)
				var dir := (player_pos - orig).normalized()
				fx.spawn_enemy_bullet(orig, dir, float(c.get("mgBulletSpeed", 4.0)), float(c.get("mgDamage", 5.0)), 0.0, false, true)
				AudioManager.play_sfx("tank_mg", 0.42)
			if _burst_left <= 0:
				_end_atk(c)
		"cannon":
			_timer -= dt
			if _timer <= 0.0:
				var orig := global_position + Vector3(0, -4, 14)
				var dir := (player_pos - orig).normalized()
				fx.spawn_enemy_bullet(orig, dir, 2.2, float(c.get("cannonDamage", 50.0)), 0.0, false, true)
				AudioManager.play_sfx("tank_mortar", 0.65)
				_end_atk(c)
		"missile":
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("missileGapSec", 0.55))
				_burst_left -= 1
				_spawn_missile(player_pos, c)
			if _burst_left <= 0:
				_end_atk(c)


func _end_atk(c: Dictionary) -> void:
	_state = "gap"
	var gap := float(c.get("attackGapSec", 1.5))
	if enraged:
		gap *= float(c.get("enrageGapMul", 0.75))
	_timer = gap


func _spawn_missile(player_pos: Vector3, c: Dictionary) -> void:
	var n := ProceduralBuilder.add_box(get_parent(), Vector3(1.8, 1.8, 6.0), Pal.mat(Pal.HAZARD, Pal.AMBER, 1.2), global_position + Vector3(0, -5, 0), Vector3.ZERO, false)
	var dir := (player_pos - global_position).normalized()
	_missiles.append({
		"node": n,
		"dir": dir,
		"hp": float(c.get("missileHp", 40.0)),
		"speed": float(c.get("missileSpeed", 82.0)),
		"dmg": float(c.get("missileDamage", 45.0)),
		"life": float(c.get("missileLifeSec", 7.0)),
	})
	AudioManager.play_sfx("rocket_shot", 0.55)


func _update_missiles(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	for i in range(_missiles.size() - 1, -1, -1):
		var m: Dictionary = _missiles[i]
		m["life"] = float(m["life"]) - dt
		var node: MeshInstance3D = m["node"]
		var desired := (player_pos - node.global_position).normalized()
		var dir: Vector3 = (m["dir"] as Vector3).lerp(desired, clampf(dt * 1.4, 0.0, 1.0)).normalized()
		m["dir"] = dir
		node.global_position += dir * float(m["speed"]) * dt
		node.look_at(node.global_position + dir, Vector3.UP)
		if node.global_position.distance_to(player_pos) < 12.0:
			fx.spawn_explosion(node.global_position, 15.0, 0.0, Color.html("#ff6a20"), true, "rocket_explode")
			player_hit_requested.emit(float(m["dmg"]))
			node.queue_free()
			_missiles.remove_at(i)
		elif float(m["life"]) <= 0.0 or float(m["hp"]) <= 0.0:
			if float(m["hp"]) <= 0.0:
				fx.spawn_explosion(node.global_position, 10.0, 0.0, Color.html("#ffb03b"), false, "explode")
			node.queue_free()
			_missiles.remove_at(i)


func hit_missile_segment(p0: Vector3, p1: Vector3, dmg: float) -> bool:
	for m in _missiles:
		var node: MeshInstance3D = m["node"]
		var d2 := NavGrid2D.seg_point_dist_sq(node.global_position.x, node.global_position.z, p0.x, p0.z, p1.x, p1.z)
		if d2 <= 144.0:
			m["hp"] = float(m["hp"]) - dmg
			return true
	return false


func take_damage(dmg: float) -> bool:
	if not active or dead:
		return false
	hp = maxf(0.0, hp - dmg)
	boss_hp_changed.emit(hp, max_hp, "COMBAT GUNSHIP" + (" [ENRAGED]" if enraged else ""))
	if hp <= 0.0:
		dead = true
		active = false
		AudioManager.play_sfx("tank_explode", 0.95)
		AchievementManager.record_boss("gunship")
		boss_defeated.emit(self)
		return true
	return false
