class_name ExplosiveBarrel
extends Node3D

## Barel peledak merah-hazard dengan reaksi berantai dan push collider ke player.

signal exploded(barrel: ExplosiveBarrel, center: Vector3, radius: float, robot_dmg: float, player_dmg: float)

const BARREL_RADIUS := 3.4

var hp := 30.0
var is_dead := false
var _beacon_mat: StandardMaterial3D
var _t := 0.0


func _ready() -> void:
	hp = float(Config.section("barrels").get("hp", 30.0))
	var m_body := Pal.mat(Pal.HAZARD, Color.BLACK, 0.0, 0.55, 0.35)
	var m_band := Pal.mat(Pal.AMBER, Color.BLACK, 0.0, 0.65, 0.25)
	_beacon_mat = Pal.unique_mat(Pal.AMBER, Pal.AMBER, 0.85, 0.2, 0.0, false, 1.0, true)

	ProceduralBuilder.add_cyl(self, BARREL_RADIUS, BARREL_RADIUS, 9.2, m_body, Vector3(0, 4.6, 0), Vector3.ZERO, 12)
	ProceduralBuilder.add_cyl(self, BARREL_RADIUS * 1.04, BARREL_RADIUS * 1.04, 1.4, m_band, Vector3(0, 4.6, 0), Vector3.ZERO, 12)
	ProceduralBuilder.add_sphere(self, 0.9, _beacon_mat, Vector3(0, 9.4, 0), Vector3.ONE, 8, 5, false)


func _process(dt: float) -> void:
	if is_dead:
		return
	_t += dt * 4.5
	if _beacon_mat:
		_beacon_mat.emission_energy_multiplier = 0.5 + 0.4 * (0.5 + 0.5 * sin(_t))


func take_damage(dmg: float) -> void:
	if is_dead:
		return
	hp -= dmg
	if hp <= 0.0:
		detonate()


func detonate() -> void:
	if is_dead:
		return
	is_dead = true
	var bc: Dictionary = Config.section("barrels")
	var rad := float(bc.get("blastRadiusMeters", 6.0)) * Config.CAMP_M
	exploded.emit(self, global_position + Vector3(0, 3.0, 0), rad, float(bc.get("robotDamage", 120.0)), float(bc.get("playerDamage", 30.0)))
	visible = false
	queue_free()


func resolve_player(pos: Vector3, player_r: float) -> Vector3:
	if is_dead:
		return pos
	var dx := pos.x - global_position.x
	var dz := pos.z - global_position.z
	var min_d := BARREL_RADIUS + player_r
	var d2 := dx * dx + dz * dz
	if d2 < min_d * min_d and d2 > 1e-6:
		var d := sqrt(d2)
		pos.x = global_position.x + dx / d * min_d
		pos.z = global_position.z + dz / d * min_d
	return pos
