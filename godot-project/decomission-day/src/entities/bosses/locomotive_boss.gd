class_name LocomotiveBoss
extends Node3D

## Miniboss Lokomotif Bersenjata Stage 5 di rel sejajar kereta player.

signal boss_hp_changed(hp: float, max_hp: float, subtitle: String)
signal boss_defeated(boss: LocomotiveBoss)
signal player_hit_requested(dmg: float, push_dir: Vector2)

var hp := 5000.0
var max_hp := 5000.0
var active := false
var dead := false

var _turret: Node3D
var _muzzle: Node3D
var _state := "idle"
var _timer := 1.0
var _burst_left := 0
var _burst_cd := 0.0


func _ready() -> void:
	_build_mesh()
	reset_boss()


func _build_mesh() -> void:
	var m_body := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.6, 0.45)
	var m_ink := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.8, 0.25)
	var m_hazard := Pal.mat(Pal.HAZARD, Pal.HAZARD, 0.65)
	ProceduralBuilder.add_box(self, Vector3(95, 18, 22), m_body, Vector3(0, 10, 0))
	ProceduralBuilder.add_box(self, Vector3(26, 12, 20), m_ink, Vector3(-26, 22, 0))
	ProceduralBuilder.add_box(self, Vector3(8, 12, 23), m_hazard, Vector3(44, 8, 0))
	_turret = Node3D.new(); _turret.position = Vector3(12, 21, 0); add_child(_turret)
	ProceduralBuilder.add_box(_turret, Vector3(14, 6, 14), m_ink, Vector3.ZERO)
	ProceduralBuilder.add_cyl(_turret, 1.5, 1.5, 16.0, m_body, Vector3(0, 0, 11), Vector3(90, 0, 0), 8)
	_muzzle = Node3D.new(); _muzzle.position = Vector3(0, 0, 19); _turret.add_child(_muzzle)


func reset_boss() -> void:
	var c: Dictionary = Config.stage_cfg(5).get("enemyTrain", {}).get("boss", {})
	max_hp = float(c.get("hp", 5000.0))
	hp = max_hp
	active = false
	dead = false
	_state = "idle"
	_timer = float(c.get("armSec", 3.0))


func activate_boss() -> void:
	active = true
	_state = "arm"
	_timer = float(Config.stage_cfg(5).get("enemyTrain", {}).get("boss", {}).get("armSec", 3.0))
	boss_hp_changed.emit(hp, max_hp, "ARMORED LOCOMOTIVE")


func step(dt: float, player_pos: Vector3, fx: EffectsPool) -> void:
	if not active or dead:
		return
	var c: Dictionary = Config.stage_cfg(5).get("enemyTrain", {}).get("boss", {})
	var to_p := Vector2(player_pos.x - _turret.global_position.x, player_pos.z - _turret.global_position.z)
	_turret.rotation.y = lerp_angle(_turret.rotation.y, atan2(to_p.x, to_p.y), clampf(dt * 6.0, 0.0, 1.0))

	match _state:
		"arm", "gap":
			_timer -= dt
			if _timer <= 0.0:
				_state = "mg"
				_burst_left = int(c.get("mgShots", 10))
				_burst_cd = 0.0
		"mg":
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("mgShotGapSec", 0.09))
				_burst_left -= 1
				var orig := _muzzle.global_position
				var dir := (Vector3(player_pos.x, orig.y, player_pos.z) - orig).normalized()
				fx.spawn_enemy_bullet(orig, dir, float(c.get("mgBulletSpeed", 2.0)), float(c.get("mgDamage", 5.0)))
				AudioManager.play_sfx("tank_mg", 0.45)
			if _burst_left <= 0:
				_state = "mg_to_gl"
				_timer = float(c.get("mgToGlSec", 2.0))
		"mg_to_gl":
			_timer -= dt
			if _timer <= 0.0:
				_state = "gl"
				_burst_left = int(c.get("glShots", 3))
				_burst_cd = 0.0
		"gl":
			_burst_cd -= dt
			if _burst_cd <= 0.0 and _burst_left > 0:
				_burst_cd = float(c.get("glShotGapSec", 0.55))
				_burst_left -= 1
				fx.spawn_explosion(player_pos + Vector3(randf_range(-10, 10), 1.0, randf_range(-10, 10)), 18.0, 0.0, Color.html("#ff6a20"), true, "tank_blast")
				player_hit_requested.emit(float(c.get("glDamage", 25.0)) * 0.65, Vector2(0, 1))
			if _burst_left <= 0:
				_state = "gap"
				_timer = float(c.get("cycleGapSec", 1.0))


func take_damage(dmg: float) -> bool:
	if not active or dead:
		return false
	hp = maxf(0.0, hp - dmg)
	boss_hp_changed.emit(hp, max_hp, "ARMORED LOCOMOTIVE")
	if hp <= 0.0:
		dead = true
		active = false
		AudioManager.play_sfx("tank_explode", 0.9)
		AchievementManager.record_boss("locomotive")
		boss_defeated.emit(self)
		return true
	return false
