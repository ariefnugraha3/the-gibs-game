class_name CampaignStageBase
extends Node3D

## Kelas dasar semua stage Campaign (Stage 1..12).
## Host menginjeksi kamera, player, fx pool, HUD, serta lifecycle shared entities.

var host: Node = null
var chapter := 1
var stage_no := 1


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	host = p_host
	chapter = maxi(1, p_chapter)


func step_stage(_dt: float, _dt_real: float) -> void:
	pass


func exit_stage() -> void:
	pass


func on_robot_killed(_rob: RobotEnemy, _by_player: bool) -> void:
	pass


func get_objective_text() -> String:
	return "STAGE %d" % stage_no


func get_radar_landmarks() -> Array[Dictionary]:
	return []


func is_walkable(_x: float, _z: float) -> bool:
	return true


func resolve_world(pos: Vector3, _radius: float, _feet_y: float) -> Vector3:
	return pos


func ground_height(_x: float, _z: float, _cur_y: float) -> float:
	return 0.0


func is_bullet_blocked(_b: Dictionary) -> bool:
	return false


func allows_action(_action_name: String) -> bool:
	return true


func handle_player_bullet(_b: Dictionary) -> bool:
	return false


func handle_enemy_bullet(_b: Dictionary) -> bool:
	return false


func handle_melee(_orig: Vector3, _dir: Vector3, _m_range: float, _dmg: float) -> void:
	pass


func handle_explosion(_center: Vector3, _radius: float, _dmg: float, _is_enemy: bool) -> void:
	pass


func skip_cinematic() -> void:
	pass


func cam_look_height() -> Variant:
	return null


func custom_player_control(_dt: float) -> bool:
	return false


func custom_player_combat(_dt: float) -> void:
	pass
