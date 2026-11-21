class_name PickupDrop
extends Node3D

## Drop fisik di dunia (chip loot amber magnetis, amunisi per-senjata, dan medkit).

signal collected(drop: PickupDrop)

var kind := "loot" # "loot" | "ammo" | "medkit"
var weapon_id := "rifle"
var value := 20
var life := 35.0
var _t := 0.0
var _flying := false


func setup(p_kind: String, p_pos: Vector3, p_val: int = 20, p_weapon: String = "rifle", p_life: float = 35.0) -> void:
	kind = p_kind
	value = p_val
	weapon_id = p_weapon
	life = p_life
	global_position = p_pos
	_build_visual()


func _build_visual() -> void:
	match kind:
		"loot":
			var mat := Pal.mat(Pal.AMBER, Pal.AMBER, 0.9, 0.25, 0.6, false, 1.0, true)
			ProceduralBuilder.add_box(self, Vector3(2.4, 0.8, 2.4), mat, Vector3(0, 1.8, 0), Vector3(0, 45, 0), false)
		"medkit":
			ProceduralBuilder.add_box(self, Vector3(3.4, 2.0, 2.6), Pal.mat(Pal.WHITE), Vector3(0, 2.0, 0), Vector3.ZERO, false)
			ProceduralBuilder.add_box(self, Vector3(1.8, 2.2, 0.7), Pal.mat(Pal.HAZARD), Vector3(0, 2.0, 0), Vector3.ZERO, false)
			ProceduralBuilder.add_box(self, Vector3(0.7, 2.2, 1.8), Pal.mat(Pal.HAZARD), Vector3(0, 2.0, 0), Vector3.ZERO, false)
		"ammo":
			var col := Pal.TECH if weapon_id == "rifle" else (Pal.AMBER if weapon_id == "shotgun" else (Pal.HAZARD if weapon_id == "launcher" else Pal.STEEL))
			ProceduralBuilder.add_box(self, Vector3(3.2, 2.2, 2.2), Pal.mat(Pal.GUNMETAL), Vector3(0, 1.8, 0), Vector3.ZERO, false)
			ProceduralBuilder.add_box(self, Vector3(2.8, 0.6, 2.4), Pal.mat(col, col, 0.6), Vector3(0, 2.7, 0), Vector3.ZERO, false)


func step(dt: float, player_pos: Vector3) -> void:
	_t += dt
	life -= dt
	rotation.y += dt * 2.2
	position.y = sin(_t * 4.0) * 0.45

	var magnet_r := float(Config.section("drops").get("lootPickupMeters", 3.0)) * Config.CAMP_M * (2.6 if kind == "loot" else 1.2)
	var dist := Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z).length()
	if kind == "loot" and dist < magnet_r * 2.0:
		_flying = true
	if _flying:
		var dir := (player_pos - global_position)
		dir.y = 0.0
		if dir.length_squared() > 0.01:
			global_position += dir.normalized() * 145.0 * dt
		dist = Vector2(player_pos.x - global_position.x, player_pos.z - global_position.z).length()

	if dist < 11.5:
		_apply_pickup()
		collected.emit(self)
		queue_free()
	elif life <= 0.0:
		collected.emit(self)
		queue_free()


func _apply_pickup() -> void:
	if kind == "loot":
		GameState.add_score(value)
		AudioManager.play_sfx("pickup", 0.45, randf_range(1.05, 1.22))
	elif kind == "medkit":
		var max_m := int(Config.section("player").get("maxMedkits", 2))
		if int(GameState.player["medkits"]) < max_m:
			GameState.player["medkits"] = int(GameState.player["medkits"]) + 1
		else:
			var heal := float(GameState.player["max_hp"]) * 0.25
			GameState.player["hp"] = minf(float(GameState.player["max_hp"]), float(GameState.player["hp"]) + heal)
		AudioManager.play_sfx("pickup", 0.75)
		GameState.ui_dirty.emit()
	elif kind == "ammo":
		var w := weapon_id
		if not GameState.has_weapon_equipped(w):
			w = str(GameState.player["current_weapon"])
		var add := int(Config.section("weapons").get(w, {}).get("ammoPickup", 60))
		var cap := GameState.max_ammo_for(w)
		GameState.player["ammo"][w] = mini(cap, int(GameState.player["ammo"].get(w, 0)) + add)
		AudioManager.play_sfx("pickup", 0.7)
		GameState.ui_dirty.emit()
