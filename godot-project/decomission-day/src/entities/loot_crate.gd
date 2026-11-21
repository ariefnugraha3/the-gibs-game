class_name LootCrate
extends Node3D

## Peti persediaan yang dapat ditembak atau ditebas melee, menjatuhkan ammo / medkit / chip loot.

signal broken(crate: LootCrate, pos: Vector3, drop_kind: String, value: int)

const CRATE_HALF := 4.4

var hp := 55.0
var is_broken := false
var _marker_mat: StandardMaterial3D
var _t := 0.0


func _ready() -> void:
	hp = float(Config.section("crates").get("hp", 55.0))
	var m_box := Pal.mat(Pal.WOOD, Color.BLACK, 0.0, 0.85, 0.05)
	var m_frame := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.65, 0.35)
	_marker_mat = Pal.unique_mat(Pal.AMBER, Pal.AMBER, 0.75, 0.3, 0.0, false, 1.0, true)

	ProceduralBuilder.add_box(self, Vector3(8.5, 6.8, 8.5), m_box, Vector3(0, 3.4, 0))
	ProceduralBuilder.add_box(self, Vector3(9.0, 1.0, 9.0), m_frame, Vector3(0, 6.4, 0))
	ProceduralBuilder.add_box(self, Vector3(9.0, 1.0, 9.0), m_frame, Vector3(0, 0.5, 0))
	ProceduralBuilder.add_box(self, Vector3(3.6, 0.4, 3.6), _marker_mat, Vector3(0, 7.0, 0), Vector3.ZERO, false)


func _process(dt: float) -> void:
	if is_broken:
		return
	_t += dt * 3.5
	if _marker_mat:
		_marker_mat.emission_energy_multiplier = 0.45 + 0.4 * (0.5 + 0.5 * sin(_t))


func take_damage(dmg: float) -> void:
	if is_broken:
		return
	hp -= dmg
	scale = Vector3(1.06, 0.92, 1.06)
	if hp <= 0.0:
		shatter()


func shatter() -> void:
	if is_broken:
		return
	is_broken = true
	GameState.record_loot_box_destroyed()
	AudioManager.play_sfx("melee_break", 0.7)

	var cc: Dictionary = Config.section("crates")
	var aw := float(cc.get("ammoWeight", 30))
	var mw := float(cc.get("moneyWeight", 50))
	var hw := float(cc.get("medkitWeight", 20))
	var roll := randf() * (aw + mw + hw)
	var kind := "money"
	var val := 20
	if roll < aw:
		kind = "ammo"
	elif roll < aw + mw:
		kind = "money"
		var tiers: Array = cc.get("moneyTiers", [])
		if not tiers.is_empty():
			val = int(tiers[randi() % tiers.size()].get("value", 20))
	else:
		kind = "medkit"

	broken.emit(self, global_position, kind, val)
	visible = false
	queue_free()


func resolve_player(pos: Vector3, player_r: float) -> Vector3:
	if is_broken:
		return pos
	var dx := pos.x - global_position.x
	var dz := pos.z - global_position.z
	var px := CRATE_HALF + player_r - absf(dx)
	var pz := CRATE_HALF + player_r - absf(dz)
	if px > 0.0 and pz > 0.0:
		if px < pz:
			pos.x += (1.0 if dx >= 0.0 else -1.0) * px
		else:
			pos.z += (1.0 if dz >= 0.0 else -1.0) * pz
	return pos
