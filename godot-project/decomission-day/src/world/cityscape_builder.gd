class_name CityscapeBuilder
extends RefCounted

## Cincin gedung kota Jakarta 2045 berbasis MultiMeshInstance3D dengan tekstur
## jendela menyala (makeFacadeTex/makeLitTex dari facades.js), gedung terbakar,
## bulan apokaliptik berkawah + halo (sky.js), serta latar jalanan bawah gedung
## untuk stage indoor (buildCampaignCityscape dari cityscape.js).

static func build_skyline_ring(
	parent: Node3D,
	center: Vector3,
	inner_r: float = 750.0,
	outer_r: float = 1650.0,
	count: int = 110,
	ground_y: float = -4.0,
	seed_val: int = 2045
) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	mm.mesh = box
	mm.instance_count = count

	var rng := RandomNumberGenerator.new()
	rng.seed = seed_val
	var burn_spots: Array[Dictionary] = []
	for i in count:
		var ang := (float(i) / float(count)) * TAU + rng.randf_range(-0.04, 0.04)
		var dist := rng.randf_range(inner_r, outer_r)
		var w := rng.randf_range(44.0, 96.0)
		var d := rng.randf_range(44.0, 96.0)
		var h := rng.randf_range(110.0, 310.0)
		var pos := Vector3(center.x + cos(ang) * dist, ground_y + h * 0.5, center.z + sin(ang) * dist)
		var basis := Basis.from_euler(Vector3(0, rng.randf_range(-0.2, 0.2), 0)).scaled(Vector3(w, h, d))
		mm.set_instance_transform(i, Transform3D(basis, pos))
		var base_c: Color = Pal.CITY_PALETTE[rng.randi() % Pal.CITY_PALETTE.size()]
		mm.set_instance_color(i, base_c)
		if i % 16 == 0 and burn_spots.size() < 6:
			burn_spots.append({"pos": Vector3(pos.x, ground_y + h * 0.72, pos.z), "w": w, "h": h})

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "CitySkyline"
	mmi.multimesh = mm
	mmi.material_override = Pal.city_building_mat()
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mmi)

	# Pijar api di beberapa gedung terbakar (facades.js addFireSprites)
	var fire_mat := Pal.unique_mat(Color("#ff9a38"), Color("#ff6a18"), 2.2, 0.2, 0.0, true, 0.55, true)
	fire_mat.disable_fog = true
	for b in burn_spots:
		var sp := ProceduralBuilder.add_sphere(parent, 1.0, fire_mat, b["pos"], Vector3(float(b["w"]) * 0.85, float(b["h"]) * 0.32, float(b["w"]) * 0.85), 8, 5, false)
		sp.name = "FireGlow"

	build_apocalyptic_moon(parent, center)
	build_ambient_embers(parent)
	return mmi


## Bulan apokaliptik berkawah + halo oranye di langit barat-laut (porting dari src/world/sky.js)
static func build_apocalyptic_moon(parent: Node3D, center: Vector3 = Vector3.ZERO) -> Node3D:
	var root := Node3D.new()
	root.name = "ApocalypticMoon"
	root.position = center + Vector3(-520.0, 290.0, -820.0)
	parent.add_child(root)

	var m_moon := Pal.unique_mat(Color("#ffb066"), Color("#ff8a38"), 1.6, 0.3, 0.0, false, 1.0, true)
	m_moon.disable_fog = true
	ProceduralBuilder.add_sphere(root, 44.0, m_moon, Vector3.ZERO, Vector3.ONE, 16, 12, false)

	var m_halo := Pal.unique_mat(Color("#ff7828"), Color("#ff6618"), 1.4, 0.3, 0.0, true, 0.28, true)
	m_halo.disable_fog = true
	ProceduralBuilder.add_sphere(root, 125.0, m_halo, Vector3.ZERO, Vector3.ONE, 14, 10, false)
	return root


## Latar Kota Jakarta di sekeliling gedung lantai 2 (porting dari src/scenes/campaign/utility/cityscape.js)
static func build_indoor_city_backdrop(parent: Node3D, hx: float, hz: float, ground_y: float = -70.0) -> Node3D:
	var root := Node3D.new()
	root.name = "IndoorCityBackdrop"
	parent.add_child(root)

	# Podium lantai bawah gedung supaya lantai y=0 tidak melayang di atas void
	if ground_y < -2.0:
		var pod_h := -ground_y
		ProceduralBuilder.add_box(
			root, Vector3(hx * 2.0 + 24.0, pod_h, hz * 2.0 + 24.0),
			Pal.mat(Color("#2a2d33"), Color.BLACK, 0.0, 0.85, 0.1),
			Vector3(0.0, ground_y * 0.5, 0.0)
		)

	# Jalanan aspal kota Jakarta di ketinggian ground_y
	ProceduralBuilder.add_box(
		root, Vector3(2800.0, 2.0, 2800.0), Pal.asphalt_mat(),
		Vector3(0.0, ground_y - 1.0, 0.0), Vector3.ZERO, false
	)

	# Ruang terbuka hijau di empat sudut kota
	var m_grass := Pal.park_grass_mat()
	for pk in [Vector3(-620, 0, -560), Vector3(640, 0, 480), Vector3(-520, 0, 620), Vector3(600, 0, -600)]:
		ProceduralBuilder.add_cyl(root, 120.0, 120.0, 0.8, m_grass, Vector3(pk.x, ground_y + 0.4, pk.z), Vector3.ZERO, 20, false)

	# Cincin gedung tinggi menjulang di sekitar gedung lantai 2
	build_skyline_ring(root, Vector3.ZERO, maxf(hx, hz) + 150.0, maxf(hx, hz) + 1150.0, 96, ground_y, 3045)
	return root


static func build_ambient_embers(parent: Node3D) -> GPUParticles3D:
	var gp := GPUParticles3D.new()
	gp.name = "AmbientEmbers"
	gp.amount = 64
	gp.lifetime = 5.0
	gp.visibility_aabb = AABB(Vector3(-400, -50, -400), Vector3(800, 250, 800))

	var proc := ParticleProcessMaterial.new()
	proc.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	proc.emission_box_extents = Vector3(220, 18, 220)
	proc.direction = Vector3(0.18, 1.0, -0.12)
	proc.spread = 30.0
	proc.initial_velocity_min = 5.0
	proc.initial_velocity_max = 14.0
	proc.gravity = Vector3(0, 1.8, 0)
	proc.color = Pal.AMBER
	gp.process_material = proc

	var mesh := QuadMesh.new()
	mesh.size = Vector2(0.95, 0.95)
	var m := StandardMaterial3D.new()
	m.albedo_color = Pal.AMBER
	m.emission_enabled = true
	m.emission = Pal.AMBER
	m.emission_energy_multiplier = 1.8
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = m
	gp.draw_pass_1 = mesh
	gp.position = Vector3(0, 10, 0)
	parent.add_child(gp)
	return gp
