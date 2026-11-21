class_name PlayerAvatar
extends Node3D

## Avatar 3D Prosedural Major Gibran (Porting visual dari src/entities/playerAvatar.js):
## - Helm tempur + rim + modul headset + visor teal menyala
## - Syal amber + ekor syal, rompi taktis + 3 kantong magazen, ransel + gulungan tenda
## - Sistem lengan 2-segmen + siku + sarung tangan yang menggenggam gagang senjata
## - 4 model senjata detail (Pistol, Pindad SS2 Rifle, Shotgun, Launcher) + Medkit
## - Laser bidik halus + siklus lari berbobot + kurva recoil sinematik + gulingan dodge.

var body_root: Node3D
var upper_g: Node3D
var head_g: Node3D
var hip_l: Node3D
var hip_r: Node3D
var knee_l: Node3D
var knee_r: Node3D
var arm_l: Node3D
var arm_r: Node3D
var forearm_l: Node3D
var forearm_r: Node3D
var gun_pivot: Node3D
var gun_tip: Node3D
var aim_laser: MeshInstance3D
var move_marker: MeshInstance3D

var _weapon_nodes: Dictionary = {}
var _armor_nodes: Array[Node3D] = []
var _armor_lvl_cached := -1

var _knife_l: Node3D
var _knife_r: Node3D
var _swoosh_l: MeshInstance3D
var _swoosh_r: MeshInstance3D

var _gait_phase := 0.0
var _last_pos := Vector3.ZERO
var _carried := false
var _vehicle_lean := 0.0
var _electric_t := 0.0
var _radio_pose := false
var _radio_gesture := "gibranCall"

var _death_t := -1.0
var _death_dir := Vector2(0, 1)


func _ready() -> void:
	_build_rig()
	_last_pos = global_position


func _build_rig() -> void:
	body_root = Node3D.new()
	body_root.name = "BodyRoot"
	add_child(body_root)

	var m_olive := Pal.mat(Color("#55624a"), Color.BLACK, 0.0, 0.78)
	var m_cloth := Pal.mat(Color("#3d433b"), Color.BLACK, 0.0, 0.84)
	var m_skin := Pal.mat(Color("#c49a74"), Color.BLACK, 0.0, 0.7)
	var m_ink := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.78, 0.18)
	var m_scarf := Pal.mat(Pal.AMBER, Pal.AMBER_DIM, 0.28, 0.72)
	var m_visor := Pal.mat(Pal.TECH, Pal.TECH, 0.75, 0.25, 0.2)
	var m_pack := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.72, 0.28)
	var m_pouch := Pal.mat(Color("#2f342d"), Color.BLACK, 0.0, 0.82)

	# Kaki kiri & kanan dengan pelindung lutut & sepatu tempur
	hip_l = Node3D.new(); hip_l.position = Vector3(-1.25, 5.2, 0); body_root.add_child(hip_l)
	hip_r = Node3D.new(); hip_r.position = Vector3(1.25, 5.2, 0); body_root.add_child(hip_r)
	for pair in [[hip_l, true], [hip_r, false]]:
		var h: Node3D = pair[0]
		ProceduralBuilder.add_cyl(h, 0.85, 0.72, 2.7, m_cloth, Vector3(0, -1.35, 0), Vector3.ZERO, 8)
		var kn := Node3D.new(); kn.position = Vector3(0, -2.7, 0); h.add_child(kn)
		ProceduralBuilder.add_sphere(kn, 0.72, m_ink, Vector3(0, 0, 0.22), Vector3(1.0, 0.85, 0.9), 8, 5, false)
		ProceduralBuilder.add_cyl(kn, 0.68, 0.56, 2.3, m_cloth, Vector3(0, -1.15, 0), Vector3.ZERO, 8)
		ProceduralBuilder.add_box(kn, Vector3(1.28, 0.95, 2.2), m_ink, Vector3(0, -2.25, 0.38))
		if pair[1]:
			knee_l = kn
		else:
			knee_r = kn

	# Badan atas: torso + rompi taktis + 3 mag pouch + sabuk + ransel + gulungan + syal amber
	upper_g = Node3D.new(); upper_g.position = Vector3(0, 5.4, 0); body_root.add_child(upper_g)
	ProceduralBuilder.add_box(upper_g, Vector3(3.3, 4.3, 2.05), m_olive, Vector3(0, 2.15, 0))
	ProceduralBuilder.add_box(upper_g, Vector3(3.55, 3.1, 2.32), m_ink, Vector3(0, 2.45, 0))
	for px in [-1.0, 0.0, 1.0]:
		ProceduralBuilder.add_box(upper_g, Vector3(0.75, 1.15, 0.45), m_pouch, Vector3(px, 1.95, 1.32), Vector3.ZERO, false)
	ProceduralBuilder.add_box(upper_g, Vector3(3.45, 0.55, 2.25), m_pouch, Vector3(0, 0.65, 0), Vector3.ZERO, false)
	ProceduralBuilder.add_box(upper_g, Vector3(2.5, 3.2, 1.45), m_pack, Vector3(0, 2.5, -1.55))
	ProceduralBuilder.add_cyl(upper_g, 0.55, 0.55, 2.6, m_olive, Vector3(0, 4.15, -1.55), Vector3(0, 0, 90), 8, false)
	ProceduralBuilder.add_cyl(upper_g, 1.38, 1.55, 0.95, m_scarf, Vector3(0, 4.3, 0.08), Vector3.ZERO, 10)
	ProceduralBuilder.add_box(upper_g, Vector3(0.85, 1.8, 0.35), m_scarf, Vector3(-0.7, 3.3, -1.25), Vector3(18, 0, -12), false)

	# Armor tier 1..4 pelat visual progresif
	var a1 := Node3D.new(); upper_g.add_child(a1)
	ProceduralBuilder.add_box(a1, Vector3(3.85, 1.8, 2.55), Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.45, 0.55), Vector3(0, 3.1, 0))
	var a2 := Node3D.new(); upper_g.add_child(a2)
	ProceduralBuilder.add_sphere(a2, 1.05, Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.45, 0.55), Vector3(-2.15, 3.75, 0), Vector3(1.1, 0.85, 1.0))
	ProceduralBuilder.add_sphere(a2, 1.05, Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.45, 0.55), Vector3(2.15, 3.75, 0), Vector3(1.1, 0.85, 1.0))
	var a3 := Node3D.new(); upper_g.add_child(a3)
	ProceduralBuilder.add_box(a3, Vector3(4.1, 0.65, 2.75), Pal.mat(Pal.TECH, Pal.TECH, 0.8), Vector3(0, 2.45, 0), Vector3.ZERO, false)
	var a4 := Node3D.new(); upper_g.add_child(a4)
	ProceduralBuilder.add_box(a4, Vector3(1.6, 2.2, 0.6), Pal.mat(Pal.AMBER, Pal.AMBER, 0.85), Vector3(0, 2.7, -2.35), Vector3.ZERO, false)
	_armor_nodes = [a1, a2, a3, a4]
	for n in _armor_nodes:
		n.visible = false

	# Kepala + helm taktis + visor teal + modul earpiece
	head_g = Node3D.new(); head_g.position = Vector3(0, 4.7, 0); upper_g.add_child(head_g)
	ProceduralBuilder.add_sphere(head_g, 1.15, m_skin, Vector3(0, 1.0, 0.05))
	ProceduralBuilder.add_sphere(head_g, 1.38, m_olive, Vector3(0, 1.38, -0.06), Vector3(1.04, 0.84, 1.08))
	ProceduralBuilder.add_box(head_g, Vector3(2.6, 0.32, 2.4), m_ink, Vector3(0, 1.35, 0.05), Vector3.ZERO, false)
	ProceduralBuilder.add_box(head_g, Vector3(1.95, 0.54, 0.55), m_visor, Vector3(0, 1.15, 1.12), Vector3.ZERO, false)
	ProceduralBuilder.add_box(head_g, Vector3(2.85, 0.65, 0.65), m_pack, Vector3(0, 1.15, -0.05), Vector3.ZERO, false)

	# Lengan 2-segmen (bahu -> siku -> lengan bawah -> sarung tangan menyatu dengan senjata)
	arm_l = Node3D.new(); arm_l.position = Vector3(-2.05, 3.65, 0.1); upper_g.add_child(arm_l)
	ProceduralBuilder.add_cyl(arm_l, 0.54, 0.46, 2.1, m_olive, Vector3(0.25, -0.8, 0.65), Vector3(-42, 0, -18), 8)
	ProceduralBuilder.add_sphere(arm_l, 0.52, m_ink, Vector3(0.55, -1.55, 1.35), Vector3.ONE, 7, 5, false)
	forearm_l = Node3D.new(); forearm_l.position = Vector3(0.55, -1.55, 1.35); arm_l.add_child(forearm_l)
	ProceduralBuilder.add_cyl(forearm_l, 0.44, 0.38, 2.4, m_cloth, Vector3(1.15, 0.35, 1.1), Vector3(-75, 38, 0), 8)
	ProceduralBuilder.add_sphere(forearm_l, 0.46, m_ink, Vector3(2.2, 0.5, 2.1), Vector3.ONE, 7, 5, false)

	arm_r = Node3D.new(); arm_r.position = Vector3(2.05, 3.65, 0.1); upper_g.add_child(arm_r)
	ProceduralBuilder.add_cyl(arm_r, 0.54, 0.46, 2.0, m_olive, Vector3(-0.25, -0.85, 0.65), Vector3(-42, 0, 14), 8)
	ProceduralBuilder.add_sphere(arm_r, 0.52, m_ink, Vector3(-0.5, -1.55, 1.25), Vector3.ONE, 7, 5, false)
	forearm_r = Node3D.new(); forearm_r.position = Vector3(-0.5, -1.55, 1.25); arm_r.add_child(forearm_r)
	ProceduralBuilder.add_cyl(forearm_r, 0.44, 0.38, 1.8, m_cloth, Vector3(-0.25, 0.35, 0.75), Vector3(-78, -12, 0), 8)
	ProceduralBuilder.add_sphere(forearm_r, 0.46, m_ink, Vector3(-0.35, 0.45, 1.5), Vector3.ONE, 7, 5, false)

	# Pivot senjata di tangan
	gun_pivot = Node3D.new(); gun_pivot.position = Vector3(1.15, 2.55, 1.85); upper_g.add_child(gun_pivot)
	gun_tip = Node3D.new(); gun_tip.position = Vector3(0, 0.2, 4.7); gun_pivot.add_child(gun_tip)

	# Garis bidik laser taktis tipis (membantu keterbacaan arah bidik top-down)
	var m_laser := Pal.unique_mat(Pal.AMBER, Pal.AMBER, 1.1, 0.2, 0.0, true, 0.24, true)
	aim_laser = ProceduralBuilder.add_box(gun_tip, Vector3(0.12, 0.12, 26.0), m_laser, Vector3(0, 0, 13.5), Vector3.ZERO, false)

	_build_weapon_props()
	_build_melee_daggers()


func _build_weapon_props() -> void:
	var m_gun := Pal.mat(Pal.GUNMETAL, Color.BLACK, 0.0, 0.48, 0.55)
	var m_steel := Pal.mat(Pal.STEEL, Color.BLACK, 0.0, 0.42, 0.62)
	var m_dark := Pal.mat(Pal.INK, Color.BLACK, 0.0, 0.75, 0.25)
	var m_wood := Pal.mat(Pal.WOOD)
	var m_amber := Pal.mat(Pal.AMBER, Pal.AMBER, 0.75)
	var m_tech := Pal.mat(Pal.TECH, Pal.TECH, 0.8)

	# 1. Pistol Taktis
	var wp := Node3D.new(); gun_pivot.add_child(wp)
	ProceduralBuilder.add_box(wp, Vector3(0.46, 0.68, 2.4), m_gun, Vector3(0, 0.18, 1.0))
	ProceduralBuilder.add_box(wp, Vector3(0.5, 0.35, 2.1), m_steel, Vector3(0, 0.42, 1.1))
	ProceduralBuilder.add_box(wp, Vector3(0.42, 0.95, 0.58), m_dark, Vector3(0, -0.42, 0.15), Vector3(-12, 0, 0))
	ProceduralBuilder.add_box(wp, Vector3(0.2, 0.18, 0.3), m_tech, Vector3(0, 0.64, 0.3), Vector3.ZERO, false)

	# 2. Assault Rifle (Pindad SS2-V2 silhouette: popor, receiver, optic, magazen lengkung, forend, laras)
	var wr := Node3D.new(); gun_pivot.add_child(wr)
	ProceduralBuilder.add_box(wr, Vector3(0.46, 0.75, 1.3), m_dark, Vector3(0, 0.0, -0.4))
	ProceduralBuilder.add_box(wr, Vector3(0.58, 0.85, 3.2), m_gun, Vector3(0, 0.18, 1.4))
	ProceduralBuilder.add_box(wr, Vector3(0.52, 0.65, 1.8), m_dark, Vector3(0, 0.18, 3.4))
	ProceduralBuilder.add_cyl(wr, 0.16, 0.16, 2.4, m_steel, Vector3(0, 0.24, 4.4), Vector3(90, 0, 0), 8)
	ProceduralBuilder.add_cyl(wr, 0.24, 0.24, 0.55, m_gun, Vector3(0, 0.24, 5.4), Vector3(90, 0, 0), 8, false)
	ProceduralBuilder.add_box(wr, Vector3(0.38, 1.35, 0.75), m_steel, Vector3(0, -0.62, 1.75), Vector3(16, 0, 0))
	ProceduralBuilder.add_box(wr, Vector3(0.44, 0.46, 0.95), m_dark, Vector3(0, 0.78, 1.2), Vector3.ZERO, false)
	ProceduralBuilder.add_box(wr, Vector3(0.26, 0.26, 0.2), m_tech, Vector3(0, 0.78, 1.7), Vector3.ZERO, false)

	# 3. Combat Shotgun (popor kayu, receiver baja, laras + tabung peluru bawah + pump grip)
	var ws := Node3D.new(); gun_pivot.add_child(ws)
	ProceduralBuilder.add_box(ws, Vector3(0.52, 0.82, 1.5), m_wood, Vector3(0, -0.05, -0.3), Vector3(-8, 0, 0))
	ProceduralBuilder.add_box(ws, Vector3(0.64, 0.88, 2.4), m_gun, Vector3(0, 0.16, 1.3))
	ProceduralBuilder.add_cyl(ws, 0.22, 0.22, 3.4, m_steel, Vector3(0, 0.36, 3.6), Vector3(90, 0, 0), 8)
	ProceduralBuilder.add_cyl(ws, 0.20, 0.20, 2.8, m_dark, Vector3(0, 0.0, 3.3), Vector3(90, 0, 0), 8)
	ProceduralBuilder.add_cyl(ws, 0.34, 0.34, 1.4, m_wood, Vector3(0, 0.0, 3.1), Vector3(90, 0, 0), 8)

	# 4. Grenade / Rocket Launcher (tabung berat + drum revolver + bidikan amber + exhaust cone)
	var wl := Node3D.new(); gun_pivot.add_child(wl)
	ProceduralBuilder.add_cyl(wl, 0.64, 0.64, 4.8, m_gun, Vector3(0, 0.24, 2.0), Vector3(90, 0, 0), 10)
	ProceduralBuilder.add_cyl(wl, 0.92, 0.92, 1.6, m_steel, Vector3(0, 0.18, 1.4), Vector3(90, 0, 0), 10)
	ProceduralBuilder.add_cyl(wl, 0.82, 0.58, 0.8, m_dark, Vector3(0, 0.24, -0.6), Vector3(90, 0, 0), 10, false)
	ProceduralBuilder.add_box(wl, Vector3(0.56, 0.45, 0.95), m_amber, Vector3(0, 0.92, 2.2), Vector3.ZERO, false)

	# 5. Medkit
	var wm := Node3D.new(); gun_pivot.add_child(wm)
	ProceduralBuilder.add_box(wm, Vector3(1.85, 1.45, 1.25), Pal.mat(Pal.WHITE), Vector3(-0.6, -0.1, 0.7))
	ProceduralBuilder.add_box(wm, Vector3(0.95, 0.32, 1.3), Pal.mat(Pal.HAZARD), Vector3(-0.6, -0.1, 0.7), Vector3.ZERO, false)
	ProceduralBuilder.add_box(wm, Vector3(0.32, 0.95, 1.3), Pal.mat(Pal.HAZARD), Vector3(-0.6, -0.1, 0.7), Vector3.ZERO, false)

	_weapon_nodes = {"pistol": wp, "rifle": wr, "shotgun": ws, "launcher": wl, "medkit": wm}


func _build_melee_daggers() -> void:
	var m_blade := Pal.mat(Pal.WHITE, Pal.TECH, 0.45, 0.2, 0.8)
	var m_swoosh := Pal.unique_mat(Pal.TECH, Pal.TECH, 0.85, 0.2, 0.0, true, 0.0, true)
	m_swoosh.cull_mode = BaseMaterial3D.CULL_DISABLED

	_knife_l = Node3D.new(); _knife_l.position = Vector3(-1.8, 2.9, 1.5); upper_g.add_child(_knife_l)
	ProceduralBuilder.add_box(_knife_l, Vector3(0.22, 0.45, 3.0), m_blade, Vector3(0, 0, 1.5))
	_knife_l.visible = false

	_knife_r = Node3D.new(); _knife_r.position = Vector3(1.8, 2.9, 1.5); upper_g.add_child(_knife_r)
	ProceduralBuilder.add_box(_knife_r, Vector3(0.22, 0.45, 3.0), m_blade, Vector3(0, 0, 1.5))
	_knife_r.visible = false

	_swoosh_l = ProceduralBuilder.add_ring(upper_g, 4.0, 9.2, m_swoosh, Vector3(0, 2.7, 1.2), 16)
	_swoosh_l.visible = false
	_swoosh_r = _swoosh_l


func set_carried(on: bool) -> void:
	_carried = on


func set_vehicle_lean(accel_norm: float) -> void:
	_vehicle_lean = clampf(accel_norm, -1.0, 1.0)


func set_electric_hit(sec: float) -> void:
	_electric_t = maxf(0.0, sec)


func set_radio_pose(on: bool, gesture: String = "gibranCall") -> void:
	_radio_pose = on
	_radio_gesture = gesture


func play_death(dir: Vector2) -> void:
	_death_t = 0.0
	_death_dir = dir.normalized() if dir.length_squared() > 0.01 else Vector2(0, 1)


func reset_death() -> void:
	_death_t = -1.0
	body_root.position = Vector3.ZERO
	body_root.rotation = Vector3.ZERO
	upper_g.rotation = Vector3.ZERO
	hip_l.rotation = Vector3.ZERO
	hip_r.rotation = Vector3.ZERO


func update_pose(
	dt: float,
	aim_yaw: float,
	medkit_active: bool,
	melee_t: float,
	melee_side: float,
	dodge_progress: float,
	dodge_active: bool,
	recoil_k: float
) -> void:
	var alvl := int(GameState.player.get("armor_lvl", 0))
	if alvl != _armor_lvl_cached:
		_armor_lvl_cached = alvl
		for i in _armor_nodes.size():
			_armor_nodes[i].visible = (i < alvl)

	var active_key := "medkit" if medkit_active else str(GameState.player.get("current_weapon", "pistol"))
	for k in _weapon_nodes.keys():
		(_weapon_nodes[k] as Node3D).visible = (k == active_key) and melee_t <= 0.0
	if aim_laser:
		aim_laser.visible = (not medkit_active) and melee_t <= 0.0 and not dodge_active and _death_t < 0.0 and not GameState.cinematic_active

	if _death_t >= 0.0:
		_death_t += dt
		var f := clampf(_death_t / 1.15, 0.0, 1.0)
		var fall_ang := f * (PI * 0.48)
		body_root.rotation.x = -fall_ang * _death_dir.y
		body_root.rotation.z = fall_ang * _death_dir.x
		body_root.position.y = -f * 1.4
		return

	# Dodge gulingan tempur multi-fase (coil -> air tuck -> plant)
	if dodge_active:
		body_root.rotation.x = dodge_progress * TAU
		body_root.rotation.z = sin(dodge_progress * PI) * 0.45
		body_root.position.y = sin(dodge_progress * PI) * 4.4
	else:
		body_root.rotation.x = 0.0
		body_root.rotation.z = -_vehicle_lean * 0.15
		body_root.position.y = 0.0

	# Siklus lari manusiawi dengan bob vertikal 2x frekuensi langkah
	var disp := Vector2(global_position.x - _last_pos.x, global_position.z - _last_pos.z)
	_last_pos = global_position
	var spd := disp.length() / maxf(dt, 0.001)
	if not _carried and not dodge_active and spd > 4.0:
		_gait_phase += dt * clampf(spd * 0.14, 4.0, 14.0)
		var swing := sin(_gait_phase) * 0.68
		hip_l.rotation.x = swing
		hip_r.rotation.x = -swing
		knee_l.rotation.x = maxf(0.0, -swing * 0.9)
		knee_r.rotation.x = maxf(0.0, swing * 0.9)
		upper_g.position.y = 5.4 + absf(sin(_gait_phase)) * 0.36
		var move_yaw := atan2(disp.x, disp.y)
		body_root.rotation.y = lerp_angle(body_root.rotation.y, move_yaw, clampf(dt * 10.0, 0.0, 1.0))
	else:
		hip_l.rotation.x = lerpf(hip_l.rotation.x, 0.0, clampf(dt * 12.0, 0.0, 1.0))
		hip_r.rotation.x = lerpf(hip_r.rotation.x, 0.0, clampf(dt * 12.0, 0.0, 1.0))
		knee_l.rotation.x = lerpf(knee_l.rotation.x, 0.0, clampf(dt * 12.0, 0.0, 1.0))
		knee_r.rotation.x = lerpf(knee_r.rotation.x, 0.0, clampf(dt * 12.0, 0.0, 1.0))
		upper_g.position.y = lerpf(upper_g.position.y, 5.4, clampf(dt * 12.0, 0.0, 1.0))
		body_root.rotation.y = lerp_angle(body_root.rotation.y, aim_yaw, clampf(dt * 14.0, 0.0, 1.0))

	# Puntiran pinggang & kepala ke arah bidik
	upper_g.rotation.y = wrapf(aim_yaw - body_root.rotation.y, -PI, PI)

	if _electric_t > 0.0:
		_electric_t = maxf(0.0, _electric_t - dt)
		upper_g.rotation.z = sin(_electric_t * 58.0) * 0.22
	else:
		upper_g.rotation.z = 0.0

	if _radio_pose:
		arm_l.rotation.x = -1.15 if _radio_gesture == "gibranCall" else -0.65
	else:
		arm_l.rotation.x = -recoil_k * 0.22
	arm_r.rotation.x = -recoil_k * 0.28
	head_g.rotation.x = -recoil_k * 0.14

	# Hentakan senjata
	gun_pivot.rotation.x = -recoil_k * 0.35
	gun_pivot.position.z = 1.85 - recoil_k * 0.55

	# Animasi tebasan dual dagger
	if melee_t > 0.0:
		_knife_l.visible = true
		_knife_r.visible = true
		var p := 1.0 - (melee_t / 0.45)
		var arc := (p - 0.5) * 2.4 * melee_side
		_knife_l.rotation.y = arc
		_knife_r.rotation.y = arc
		_swoosh_l.visible = p > 0.15 and p < 0.78
		var smat := _swoosh_l.material_override as StandardMaterial3D
		if smat:
			smat.albedo_color.a = sin(p * PI) * 0.55
	else:
		_knife_l.visible = false
		_knife_r.visible = false
		_swoosh_l.visible = false
