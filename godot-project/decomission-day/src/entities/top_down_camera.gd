class_name TopDownCamera
extends Camera3D

## Kamera oblique top-down dengan dead-zone persegi 16x16, recenter halus saat
## berhenti, dukungan cam_offset per-stage, cam_bounds, cine_focus, screen shake,
## dan death camera (zoom + orbit + dutch tilt).

const CAM_OFF_DEFAULT := Vector3(-70.7, 116.0, 70.7)
const CAM_LOOK_DROP := 8.0
const DEAD_X := 16.0
const DEAD_Z := 16.0
const RECENTER_RATE := 3.0
const CINE_PAN_RATE := 1.5

var cam_offset := CAM_OFF_DEFAULT
var cam_focus := Vector3.ZERO
var _focus_ready := false
var _prev_px := 0.0
var _prev_pz := 0.0

var cam_bounds: Variant = null # Dictionary {x0,x1,z0,z1,ground_y} atau null
var cam_look_y: Variant = null # float atau null
var cine_focus: Variant = null # Vector2(x, z) atau null
var camera_anchor: Variant = null # Vector3 atau null (untuk Stage 8/10)

var shake_amp := 0.0
var dc_zoom := 1.0
var dc_orbit := 0.0
var dc_tilt := 0.0

var screen_up := Vector2(0.7071, -0.7071)
var screen_left := Vector2(-0.7071, -0.7071)


func _ready() -> void:
	fov = 50.0
	near = 1.0
	far = 3600.0
	_recompute_screen_basis()


func set_offset(off: Vector3) -> void:
	if off.is_equal_approx(cam_offset):
		return
	cam_offset = off
	_recompute_screen_basis()


func reset_offset() -> void:
	set_offset(CAM_OFF_DEFAULT)


func _recompute_screen_basis() -> void:
	var h := sqrt(cam_offset.x * cam_offset.x + cam_offset.z * cam_offset.z)
	if h < 1e-4:
		# Top-down vertikal penuh (mis. Stage 10 Air Strike): atas layar = -Z
		screen_up = Vector2(0.0, -1.0)
		screen_left = Vector2(-1.0, 0.0)
		return
	screen_up = Vector2(-cam_offset.x / h, -cam_offset.z / h)
	screen_left = Vector2(screen_up.y, -screen_up.x)


func add_shake(a: float) -> void:
	shake_amp = maxf(shake_amp, a)


func set_death_cam(zoom_mul: float = 1.0, orbit_rad: float = 0.0, tilt_rad: float = 0.0) -> void:
	dc_zoom = zoom_mul
	dc_orbit = orbit_rad
	dc_tilt = tilt_rad


func reset_death_cam() -> void:
	dc_zoom = 1.0
	dc_orbit = 0.0
	dc_tilt = 0.0
	shake_amp = 0.0


func set_cine_focus(pos: Variant, snap: bool = false) -> void:
	cine_focus = pos
	if snap and pos is Vector2 and _focus_ready:
		cam_focus.x = pos.x
		cam_focus.z = pos.y


func snap_to(target_pos: Vector3) -> void:
	cam_focus = target_pos
	_focus_ready = true
	_prev_px = target_pos.x
	_prev_pz = target_pos.z
	follow(target_pos, 0.0)


func follow(target_pos: Vector3, dt: float) -> void:
	if not _focus_ready or (cine_focus == null and (absf(target_pos.x - cam_focus.x) > 400.0 or absf(target_pos.z - cam_focus.z) > 400.0)):
		cam_focus = target_pos
		_focus_ready = true
		_prev_px = target_pos.x
		_prev_pz = target_pos.z

	var moved_sq := (target_pos.x - _prev_px) * (target_pos.x - _prev_px) + (target_pos.z - _prev_pz) * (target_pos.z - _prev_pz)
	_prev_px = target_pos.x
	_prev_pz = target_pos.z

	if camera_anchor is Vector3:
		cam_focus = camera_anchor
	elif cine_focus is Vector2:
		var kc := 1.0 - exp(-CINE_PAN_RATE * dt)
		cam_focus.x += (cine_focus.x - cam_focus.x) * kc
		cam_focus.z += (cine_focus.y - cam_focus.z) * kc
	elif moved_sq > 0.01:
		var dx := target_pos.x - cam_focus.x
		if dx > DEAD_X:
			cam_focus.x = target_pos.x - DEAD_X
		elif dx < -DEAD_X:
			cam_focus.x = target_pos.x + DEAD_X
		var dz := target_pos.z - cam_focus.z
		if dz > DEAD_Z:
			cam_focus.z = target_pos.z - DEAD_Z
		elif dz < -DEAD_Z:
			cam_focus.z = target_pos.z + DEAD_Z
	else:
		var k := 1.0 - exp(-RECENTER_RATE * dt)
		cam_focus.x += (target_pos.x - cam_focus.x) * k
		cam_focus.z += (target_pos.z - cam_focus.z) * k

	cam_focus.y = target_pos.y
	if cam_bounds is Dictionary and not cam_bounds.is_empty():
		var b: Dictionary = cam_bounds
		cam_focus.x = clampf(cam_focus.x, float(b.get("x0", -1e9)), float(b.get("x1", 1e9)))
		cam_focus.z = clampf(cam_focus.z, float(b.get("z0", -1e9)), float(b.get("z1", 1e9)))

	var off := cam_offset * dc_zoom
	if absf(dc_orbit) > 1e-4:
		var c := cos(dc_orbit)
		var s := sin(dc_orbit)
		var rx := off.x * c - off.z * s
		var rz := off.x * s + off.z * c
		off.x = rx
		off.z = rz

	var eye := cam_focus + off
	if shake_amp > 0.01:
		eye.x += randf_range(-shake_amp, shake_amp)
		eye.z += randf_range(-shake_amp, shake_amp)
		shake_amp = maxf(0.0, shake_amp - dt * 18.0)

	var look_y := float(cam_look_y) if cam_look_y != null else (cam_focus.y - CAM_LOOK_DROP)
	var look_target := Vector3(cam_focus.x, look_y, cam_focus.z)
	var up_vec := Vector3(0, 0, -1) if (absf(off.x) < 1e-3 and absf(off.z) < 1e-3) else Vector3.UP
	global_position = eye
	if not eye.is_equal_approx(look_target):
		look_at(look_target, up_vec)
	if absf(dc_tilt) > 1e-4:
		rotate_object_local(Vector3.FORWARD, dc_tilt)


func raycast_ground(screen_pos: Vector2, ground_y: float = 0.0) -> Vector3:
	var origin := project_ray_origin(screen_pos)
	var dir := project_ray_normal(screen_pos)
	if absf(dir.y) < 1e-5:
		return Vector3(cam_focus.x, ground_y, cam_focus.z)
	var t := (ground_y - origin.y) / dir.y
	if t < 0.0:
		t = 0.0
	return origin + dir * t


func is_point_in_view(world_pos: Vector3, margin_ndc: float = 0.08) -> bool:
	if is_position_behind(world_pos):
		return false
	var vp := get_viewport()
	if vp == null:
		return true
	var sz := vp.get_visible_rect().size
	if sz.x <= 1.0 or sz.y <= 1.0:
		return true
	var sp := unproject_position(world_pos)
	var mx := sz.x * margin_ndc
	var my := sz.y * margin_ndc
	return sp.x >= -mx and sp.x <= sz.x + mx and sp.y >= -my and sp.y <= sz.y + my
