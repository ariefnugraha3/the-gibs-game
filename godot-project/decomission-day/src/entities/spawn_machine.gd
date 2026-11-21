class_name SpawnMachine
extends Node3D

## Mesin fabrikasi robot yang dapat dihancurkan pemain (Stage 3, 5, 6, 7, 11).

signal destroyed(machine: SpawnMachine)
signal spawn_robot_requested(machine: SpawnMachine, spawn_pos: Vector3, cls: String)

var hp := 1200.0
var max_hp := 1200.0
var hit_radius := 18.0
var active := false
var wrecked := false

var spawn_offset := Vector3(0, 0, 18)
var batch_interval := 8.0
var batch_count := 3
var max_alive := 8
var class_mix := {"C": 0.65, "B": 0.25, "A": 0.10}

var _timer := 1.0
var _core_mat: StandardMaterial3D
var _body_mat: StandardMaterial3D
var _rotor: Node3D
var _flash_t := 0.0


func _ready() -> void:
	max_hp = float(Config.campaign().get("spawnMachine", {}).get("hp", 1200.0))
	hp = max_hp
	_build_mesh()


func _build_mesh() -> void:
	_body_mat = Pal.unique_mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.68, 0.35)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.55, 0.45)
	_core_mat = Pal.unique_mat(Pal.TECH, Pal.TECH, 0.85, 0.3, 0.1, false, 1.0, true)

	ProceduralBuilder.add_box(self, Vector3(24, 4, 24), Pal.mat(Pal.INK), Vector3(0, 2, 0))
	ProceduralBuilder.add_cyl(self, 10.5, 12.0, 18.0, _body_mat, Vector3(0, 13, 0), Vector3.ZERO, 12)
	ProceduralBuilder.add_cyl(self, 6.2, 6.2, 16.0, _core_mat, Vector3(0, 14, 0), Vector3.ZERO, 10, false)
	_rotor = Node3D.new(); _rotor.position = Vector3(0, 22, 0); add_child(_rotor)
	ProceduralBuilder.add_box(_rotor, Vector3(22, 2.2, 4.0), m_steel, Vector3.ZERO)
	ProceduralBuilder.add_box(_rotor, Vector3(4.0, 2.2, 22), m_steel, Vector3.ZERO)


func reset_machine() -> void:
	max_hp = float(Config.campaign().get("spawnMachine", {}).get("hp", 1200.0))
	hp = max_hp
	wrecked = false
	active = false
	_timer = 1.5
	_flash_t = 0.0
	_body_mat.albedo_color = Pal.GUNMETAL
	_core_mat.albedo_color = Pal.TECH
	_core_mat.emission = Pal.TECH
	_core_mat.emission_energy_multiplier = 0.85
	rotation = Vector3.ZERO
	position.y = 0.0


func activate_machine(first_delay: float = 1.5) -> void:
	if wrecked:
		return
	active = true
	_timer = first_delay


func step(dt: float, current_alive_from_machine: int) -> void:
	if _flash_t > 0.0:
		_flash_t = maxf(0.0, _flash_t - dt)
		_body_mat.emission_enabled = _flash_t > 0.0
		_body_mat.emission = Pal.WHITE

	if wrecked or not active:
		return

	_rotor.rotation.y += dt * 2.4
	_core_mat.emission_energy_multiplier = 0.65 + 0.35 * sin(Time.get_ticks_msec() * 0.006)

	_timer -= dt
	if _timer <= 0.0:
		_timer = batch_interval
		var slots := maxi(0, max_alive - current_alive_from_machine)
		var n := mini(batch_count, slots)
		for i in n:
			var cls := _pick_class()
			var jitter := Vector3(randf_range(-8.0, 8.0), 0.0, randf_range(-8.0, 8.0))
			spawn_robot_requested.emit(self, global_position + spawn_offset + jitter, cls)


func _pick_class() -> String:
	var r := randf()
	var c_w := float(class_mix.get("C", 0.65))
	var b_w := float(class_mix.get("B", 0.25))
	if r < c_w:
		return "C"
	if r < c_w + b_w:
		return "B"
	return "A"


func take_damage(dmg: float) -> void:
	if wrecked:
		return
	hp -= dmg
	_flash_t = 0.08
	AudioManager.play_sfx("hit", 0.35, 1.1)
	if hp <= 0.0:
		hp = 0.0
		wrecked = true
		active = false
		_body_mat.albedo_color = Pal.INK
		_body_mat.emission_enabled = false
		_core_mat.albedo_color = Pal.RUBBER
		_core_mat.emission_energy_multiplier = 0.0
		rotation.z = 0.14
		rotation.x = -0.09
		AudioManager.play_sfx("tank_blast", 0.85)
		destroyed.emit(self)
