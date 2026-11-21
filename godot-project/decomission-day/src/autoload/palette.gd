extends Node

## Palet visual tunggal "GIBS 2045" & Generator Tekstur Prosedural (Porting dari
## src/world/palette.js, src/utils/textures.js, interior.js, facades.js, survival/world.js).

const INK := Color("#23262b")
const GUNMETAL := Color("#3a4046")
const STEEL := Color("#7c848c")
const PANEL := Color("#b8b2a6")
const CONCRETE := Color("#8a8378")
const RUBBER := Color("#161618")
const WOOD := Color("#6b4a29")
const LEAF := Color("#3e6b2a")
const PARK_GRASS := Color("#2c5f22")
const ASPHALT := Color("#26262a")

const TECH := Color("#2fb8a6")
const TECH_DIM := Color("#0f3b36")
const SCREEN_BG := Color("#0d2320")

const AMBER := Color("#ffb03b")
const AMBER_DIM := Color("#8a5a14")
const HAZARD := Color("#b3402e")
const HAZARD_DIM := Color("#5c2017")
const WHITE := Color("#d8d2c4")

const EYE_RED := Color("#ff2020")
const EXIT_GREEN := Color("#2eff6a")
const BULLET_GOLD := Color("#ffe27a")
const PLASMA_BLUE := Color("#55b8ff")
const COOLANT_GREEN := Color("#39d96b")
const BLOOD_RED := Color("#b81d1d")

const EMISSIVE_MAX := 0.9

const CLASS_LOOK := {
	"C": {"armor": Color("#5d371d"), "glow": Color("#ca6421")},
	"B": {"armor": Color("#4d545b"), "glow": Color("#a6bbc9")},
	"A": {"armor": Color("#796620"), "glow": Color("#e3b81c")},
	"boss": {"armor": Color("#3a2f42"), "glow": Color("#cc253d")},
}

const CITY_PALETTE := [
	Color("#26262b"), Color("#2e2a26"), Color("#202428"), Color("#35302a"), Color("#1c1d22")
]

var _mat_cache: Dictionary = {}
var _tex_cache: Dictionary = {}
var _font_regular: Font = null
var _font_black: Font = null
var _font_thin: Font = null
var _font_mono: Font = null


func _ready() -> void:
	_load_fonts()


func _load_fonts() -> void:
	_font_regular = _safe_font("res://assets/fonts/gasalt/Gasalt-Regular.ttf")
	_font_black = _safe_font("res://assets/fonts/gasalt/Gasalt-Black.ttf")
	_font_thin = _safe_font("res://assets/fonts/gasalt/Gasalt-Thin.ttf")
	_font_mono = _safe_font("res://assets/fonts/CourierPrime-Regular.ttf")


func _safe_font(path: String) -> Font:
	if ResourceLoader.exists(path):
		var res := load(path)
		if res is Font:
			return res
	return ThemeDB.fallback_font


func font_regular() -> Font:
	return _font_regular if _font_regular else ThemeDB.fallback_font


func font_black() -> Font:
	return _font_black if _font_black else font_regular()


func font_thin() -> Font:
	return _font_thin if _font_thin else font_regular()


func font_mono() -> Font:
	return _font_mono if _font_mono else font_regular()


func mat(
	albedo: Color,
	emissive: Color = Color(0, 0, 0, 0),
	emissive_energy: float = 0.0,
	roughness: float = 0.78,
	metallic: float = 0.08,
	transparent: bool = false,
	alpha: float = 1.0,
	unshaded: bool = false
) -> StandardMaterial3D:
	if not transparent and not unshaded and emissive_energy <= 0.0:
		if albedo.is_equal_approx(PARK_GRASS):
			return park_grass_mat()
		if albedo.is_equal_approx(ASPHALT):
			return asphalt_mat()

	var key := "%s|%s|%.2f|%.2f|%.2f|%s|%.2f|%s" % [
		albedo.to_html(true),
		emissive.to_html(false),
		emissive_energy,
		roughness,
		metallic,
		str(transparent),
		alpha,
		str(unshaded),
	]
	if _mat_cache.has(key):
		return _mat_cache[key]

	var m := unique_mat(albedo, emissive, emissive_energy, roughness, metallic, transparent, alpha, unshaded)
	_mat_cache[key] = m
	return m


func unique_mat(
	albedo: Color,
	emissive: Color = Color(0, 0, 0, 0),
	emissive_energy: float = 0.0,
	roughness: float = 0.78,
	metallic: float = 0.08,
	transparent: bool = false,
	alpha: float = 1.0,
	unshaded: bool = false
) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	var col := albedo
	if transparent:
		col.a = alpha
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = col
	m.roughness = roughness
	m.metallic = metallic
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if emissive_energy > 0.0:
		m.emission_enabled = true
		m.emission = emissive
		m.emission_energy_multiplier = emissive_energy
	return m


# ============================================================================
# PROCEDURAL TEXTURE & NORMAL MAP ENGINE (Porting dari legacy WebGL/Three.js)
# ============================================================================

func _speckle_img(img: Image, rng: RandomNumberGenerator, colors: Array, count: int, s_min: int, s_max: int, alpha_min: float = 0.22, alpha_max: float = 0.65) -> void:
	var w := img.get_width()
	var h := img.get_height()
	for _i in count:
		var c: Color = colors[rng.randi() % colors.size()]
		var a := rng.randf_range(alpha_min, alpha_max)
		var sw := rng.randi_range(s_min, s_max)
		var sh := rng.randi_range(s_min, s_max)
		var x0 := rng.randi_range(0, w - 1)
		var y0 := rng.randi_range(0, h - 1)
		for dy in sh:
			var yy := (y0 + dy) % h
			for dx in sw:
				var xx := (x0 + dx) % w
				var dst := img.get_pixel(xx, yy)
				img.set_pixel(xx, yy, dst.lerp(c, a))


func _fill_rect_blend(img: Image, x0: int, y0: int, rw: int, rh: int, col: Color, alpha: float = 1.0) -> void:
	var w := img.get_width()
	var h := img.get_height()
	var x_end := mini(w, maxi(0, x0 + rw))
	var y_end := mini(h, maxi(0, y0 + rh))
	var xs := clampi(x0, 0, w)
	var ys := clampi(y0, 0, h)
	for y in range(ys, y_end):
		for x in range(xs, x_end):
			if alpha >= 0.999:
				img.set_pixel(x, y, col)
			else:
				var dst := img.get_pixel(x, y)
				img.set_pixel(x, y, dst.lerp(col, alpha))


func _height_to_normal_tex(h_img: Image, strength: float = 2.0) -> ImageTexture:
	var w := h_img.get_width()
	var h := h_img.get_height()
	var out := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		var ym := (y - 1 + h) % h
		var yp := (y + 1) % h
		for x in w:
			var xm := (x - 1 + w) % w
			var xp := (x + 1) % w
			var dx := (h_img.get_pixel(xm, y).r - h_img.get_pixel(xp, y).r) * strength
			var dy := (h_img.get_pixel(x, ym).r - h_img.get_pixel(x, yp).r) * strength
			var inv := 1.0 / sqrt(dx * dx + dy * dy + 1.0)
			out.set_pixel(x, y, Color(dx * inv * 0.5 + 0.5, dy * inv * 0.5 + 0.5, inv, 1.0))
	return ImageTexture.create_from_image(out)


func _noise_normal_tex(key: String, w: int, h: int, jitter: float, count: int, s_max: int, strength: float) -> ImageTexture:
	if _tex_cache.has(key):
		return _tex_cache[key]
	var h_img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	h_img.fill(Color(0.5, 0.5, 0.5, 1.0))
	var rng := RandomNumberGenerator.new()
	rng.seed = key.hash()
	for _i in count:
		var v := clampf(0.5 + rng.randf_range(-jitter, jitter), 0.05, 0.95)
		var s := rng.randi_range(1, s_max)
		_fill_rect_blend(h_img, rng.randi_range(0, w - 1), rng.randi_range(0, h - 1), s, s, Color(v, v, v, 1.0), 1.0)
	var n_tex := _height_to_normal_tex(h_img, strength)
	_tex_cache[key] = n_tex
	return n_tex


## Lantai Fasilitas Indoor (porting persis dari src/scenes/campaign/utility/interior.js):
## Panel abu hangat TERANG (#b2ab9d) + nat bevel gelap (#6b665c) + sorot bevel +
## baut sudut + garis nat TEAL (#2fb8a6) yang menyala lembut di sela ubin.
func interior_floor_mat(tile_world_size: float = 14.0) -> StandardMaterial3D:
	var key := "interior_floor_%.1f" % tile_world_size
	if _mat_cache.has(key):
		return _mat_cache[key]

	var sz := 64
	var diff := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	diff.fill(Color("#b2ab9d"))
	var rng := RandomNumberGenerator.new(); rng.seed = 1045
	_speckle_img(diff, rng, [Color("#b8b1a3"), Color("#aaa294"), Color("#bdb6a8"), Color("#a49d8f")], 140, 1, 3, 0.25, 0.65)
	_fill_rect_blend(diff, 3, 3, sz - 6, sz - 6, Color("#cac2b6"), 0.45)
	# Nat panel gelap
	_fill_rect_blend(diff, 0, 0, sz, 2, Color("#6b665c"), 1.0)
	_fill_rect_blend(diff, 0, 0, 2, sz, Color("#6b665c"), 1.0)
	# Sorot bevel terang
	_fill_rect_blend(diff, 0, 2, sz, 1, Color("#e9e3d6"), 0.55)
	_fill_rect_blend(diff, 2, 0, 1, sz, Color("#e9e3d6"), 0.55)
	# Garis nat TEAL di tepi bawah & kanan
	_fill_rect_blend(diff, 0, sz - 2, sz, 2, TECH, 0.55)
	_fill_rect_blend(diff, sz - 2, 0, 2, sz, TECH, 0.55)
	# Baut kecil di sudut panel
	for bp in [Vector2i(6, 6), Vector2i(sz - 7, 6), Vector2i(6, sz - 7), Vector2i(sz - 7, sz - 7)]:
		_fill_rect_blend(diff, bp.x, bp.y, 2, 2, Color("#3c3a34"), 0.6)

	var emis := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	emis.fill(Color.BLACK)
	_fill_rect_blend(emis, 0, sz - 2, sz, 2, Color("#e6fbf5"), 1.0)
	_fill_rect_blend(emis, sz - 2, 0, 2, sz, Color("#e6fbf5"), 1.0)

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(diff)
	m.roughness = 0.96 # Matte Lambert tanpa silau specular sesuai interior.js
	m.metallic = 0.02
	m.emission_enabled = true
	m.emission = TECH
	m.emission_texture = ImageTexture.create_from_image(emis)
	m.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
	m.emission_energy_multiplier = 0.42
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	var sc := 1.0 / maxf(1.0, tile_world_size)
	m.uv1_scale = Vector3(sc, sc, sc)
	_mat_cache[key] = m
	return m


## Dinding Fasilitas Indoor (porting persis dari interior.js buildInteriorWallMat):
## Panel vertikal abu hangat terang (#918b7f) + bibir atas terang (#cec7ba) +
## 3 nat panel vertikal + baut + STRIP TEAL/AKSEN menyala di dekat puncak + normal map.
func interior_wall_mat(accent_col: Color = TECH) -> StandardMaterial3D:
	var key := "interior_wall_%s" % accent_col.to_html(false)
	if _mat_cache.has(key):
		return _mat_cache[key]

	var m := build_interior_wall_instance(accent_col)
	_mat_cache[key] = m
	return m


func build_interior_wall_instance(accent_col: Color = TECH) -> StandardMaterial3D:
	var tkey := "wall_tex_%s" % accent_col.to_html(false)
	var tex_pack: Dictionary = {}
	if _tex_cache.has(tkey):
		tex_pack = _tex_cache[tkey]
	else:
		var sz := 64
		var strip_y := 11
		var strip_h := 3
		var diff := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
		diff.fill(Color("#918b7f"))
		var rng := RandomNumberGenerator.new(); rng.seed = 2045
		_speckle_img(diff, rng, [Color("#978f83"), Color("#8a8276"), Color("#9c968a"), Color("#847d71")], 110, 1, 3, 0.25, 0.6)
		# Rim bibir atas terang
		_fill_rect_blend(diff, 0, 0, sz, 4, Color("#cec7ba"), 0.78)
		_fill_rect_blend(diff, 0, 4, sz, 1, Color("#282622"), 0.65)
		# 3 panel vertikal per sel
		for px in [sz / 3, (2 * sz) / 3]:
			_fill_rect_blend(diff, px - 1, 5, 2, sz - 5, Color("#2e2c28"), 0.6)
			_fill_rect_blend(diff, px + 1, 5, 1, sz - 5, Color("#c4beb2"), 0.38)
		# Strip menyala dekat puncak + housing gelap
		_fill_rect_blend(diff, 0, strip_y - 1, sz, strip_h + 2, Color("#1c2b28"), 1.0)
		_fill_rect_blend(diff, 0, strip_y, sz, strip_h, accent_col, 1.0)
		_fill_rect_blend(diff, 0, strip_y + 1, sz, 1, Color("#dcfff8"), 0.5)
		# Baut bawah
		for bx in [6, sz / 2, sz - 7]:
			_fill_rect_blend(diff, bx, sz - 7, 2, 2, Color("#383630"), 0.65)

		var emis := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
		emis.fill(Color.BLACK)
		_fill_rect_blend(emis, 0, strip_y, sz, strip_h, Color.WHITE, 1.0)

		var h_img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
		h_img.fill(Color(0.58, 0.58, 0.58, 1.0))
		_fill_rect_blend(h_img, 0, 0, sz, 4, Color(0.75, 0.75, 0.75, 1.0), 1.0)
		for px in [sz / 3, (2 * sz) / 3]:
			_fill_rect_blend(h_img, px - 1, 5, 2, sz - 5, Color(0.35, 0.35, 0.35, 1.0), 1.0)
		_fill_rect_blend(h_img, 0, strip_y - 1, sz, strip_h + 2, Color(0.35, 0.35, 0.35, 1.0), 1.0)

		tex_pack = {
			"diff": ImageTexture.create_from_image(diff),
			"emis": ImageTexture.create_from_image(emis),
			"norm": _height_to_normal_tex(h_img, 2.0),
		}
		_tex_cache[tkey] = tex_pack

	var m := StandardMaterial3D.new()
	m.albedo_texture = tex_pack["diff"]
	m.normal_enabled = true
	m.normal_texture = tex_pack["norm"]
	m.roughness = 0.68
	m.metallic = 0.14
	m.emission_enabled = true
	m.emission = accent_col
	m.emission_texture = tex_pack["emis"]
	m.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
	m.emission_energy_multiplier = 0.7
	return m


## Rumput Taman Monas & Hutan (porting dari survival/world.js createGround)
func park_grass_mat() -> StandardMaterial3D:
	if _mat_cache.has("park_grass_mat"):
		return _mat_cache["park_grass_mat"]

	var sz := 128
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color("#2c5f22"))
	var rng := RandomNumberGenerator.new(); rng.seed = 3045
	# Gumpalan lembut anti-tiling
	_speckle_img(img, rng, [Color("#2b4d1b"), Color("#3a6e28")], 28, 12, 28, 0.18, 0.35)
	# Goresan helai rumput
	var blades := [Color("#234d1b"), Color("#357029"), Color("#1d3f16"), Color("#3f7a2e"), Color("#2a5a20"), Color("#4a8a36")]
	_speckle_img(img, rng, blades, 520, 1, 4, 0.3, 0.68)

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.normal_enabled = true
	m.normal_texture = _noise_normal_tex("grass_nrm", 64, 64, 0.22, 320, 3, 1.35)
	m.roughness = 0.94
	m.metallic = 0.0
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3(0.032, 0.032, 0.032)
	_mat_cache["park_grass_mat"] = m
	return m


## Aspal Jalan Raya Retak & Noda Oli (porting dari survival/world.js & cityscape.js)
func asphalt_mat() -> StandardMaterial3D:
	if _mat_cache.has("asphalt_mat"):
		return _mat_cache["asphalt_mat"]

	var sz := 128
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color("#26262a"))
	var rng := RandomNumberGenerator.new(); rng.seed = 4045
	_speckle_img(img, rng, [Color("#1e1e22"), Color("#2e2e33"), Color("#232327"), Color("#333338")], 320, 1, 5, 0.25, 0.65)
	_speckle_img(img, rng, [Color("#0c0c0e")], 14, 8, 18, 0.14, 0.26) # noda oli
	# Garis retakan tipis
	for _i in 8:
		var rx := rng.randi_range(8, sz - 24)
		var ry := rng.randi_range(8, sz - 24)
		for s in 14:
			rx = clampi(rx + rng.randi_range(-2, 2), 0, sz - 1)
			ry = clampi(ry + 1, 0, sz - 1)
			img.set_pixel(rx, ry, Color("#0d0d10"))

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.normal_enabled = true
	m.normal_texture = _noise_normal_tex("asphalt_nrm", 64, 64, 0.18, 280, 3, 1.5)
	m.roughness = 0.86
	m.metallic = 0.05
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3(0.025, 0.025, 0.025)
	_mat_cache["asphalt_mat"] = m
	return m


## Pelataran Radial Emas Monas (porting persis dari survival/world.js createParkRoads)
func monas_plaza_mat() -> StandardMaterial3D:
	if _mat_cache.has("monas_plaza_mat"):
		return _mat_cache["monas_plaza_mat"]

	var sz := 256
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color("#8a7a4a"))
	var rng := RandomNumberGenerator.new(); rng.seed = 5045
	_speckle_img(img, rng, [Color("#7d6f43"), Color("#968551"), Color("#6f6340"), Color("#a08e57")], 450, 2, 5, 0.25, 0.6)
	var center := Vector2(sz * 0.5, sz * 0.5)
	var seam_col := Color("#342d1a")
	var gold_col := Color("#a8883c")
	for y in sz:
		for x in sz:
			var dv := Vector2(x, y) - center
			var r := dv.length()
			if r > sz * 0.5:
				continue
			# Cincin konsentris tiap 16 px + cincin emas di r~28
			var r_mod := fmod(r, 16.0)
			if absf(r - 28.0) < 2.2:
				img.set_pixel(x, y, img.get_pixel(x, y).lerp(gold_col, 0.85))
			elif r_mod < 1.3:
				img.set_pixel(x, y, img.get_pixel(x, y).lerp(seam_col, 0.6))
			elif r > 10.0:
				# 36 jari-jari radial
				var ang := wrapf(atan2(dv.y, dv.x), 0.0, TAU)
				var spoke_dist := absf(fmod(ang, TAU / 36.0) - (TAU / 72.0)) * r
				if spoke_dist < 0.75:
					img.set_pixel(x, y, img.get_pixel(x, y).lerp(seam_col, 0.55))

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.roughness = 0.78
	m.metallic = 0.08
	_mat_cache["monas_plaza_mat"] = m
	return m


## Marmer Berurat Obelisk Monas (porting dari survival/world.js createMonas)
func monas_marble_mat() -> StandardMaterial3D:
	if _mat_cache.has("monas_marble_mat"):
		return _mat_cache["monas_marble_mat"]

	var w := 64
	var h := 128
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color("#cfc9bd"))
	var rng := RandomNumberGenerator.new(); rng.seed = 6045
	for _i in 36:
		var vx := rng.randf_range(0, w - 1)
		var vc := Color("#9e988c").lerp(Color("#dfd9ce"), rng.randf())
		for y in h:
			vx = wrapf(vx + rng.randf_range(-0.6, 0.6), 0.0, float(w))
			var ix := int(vx) % w
			img.set_pixel(ix, y, img.get_pixel(ix, y).lerp(vc, 0.42))

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.normal_enabled = true
	m.normal_texture = _noise_normal_tex("marble_nrm", 64, 64, 0.12, 180, 3, 1.1)
	m.roughness = 0.58
	m.metallic = 0.12
	_mat_cache["monas_marble_mat"] = m
	return m


## Beton Pagar & Dinding Perimeter (porting dari survival/world.js createFence)
func concrete_fence_mat() -> StandardMaterial3D:
	if _mat_cache.has("concrete_fence_mat"):
		return _mat_cache["concrete_fence_mat"]

	var sz := 128
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color("#8d8a83"))
	var rng := RandomNumberGenerator.new(); rng.seed = 7045
	_speckle_img(img, rng, [Color("#7e7b74"), Color("#98958d"), Color("#6f6c66"), Color("#a3a098")], 320, 1, 5, 0.25, 0.6)
	# Rembesan air vertikal & sambungan panel
	for _i in 10:
		var sx := rng.randi_range(2, sz - 4)
		var slen := rng.randi_range(20, 60)
		for y in slen:
			var a := (1.0 - float(y) / float(slen)) * 0.35
			img.set_pixel(sx, y, img.get_pixel(sx, y).lerp(Color("#2d2a26"), a))
	for px in [0, 32, 64, 96]:
		_fill_rect_blend(img, px, 0, 2, sz, Color("#32302c"), 0.55)

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.normal_enabled = true
	m.normal_texture = _noise_normal_tex("conc_nrm", 64, 64, 0.16, 220, 3, 1.2)
	m.roughness = 0.84
	m.metallic = 0.05
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3(0.03, 0.03, 0.03)
	_mat_cache["concrete_fence_mat"] = m
	return m


## Air Kolam & Air Mancur Beriak (porting dari survival/world.js createParkProps)
func water_ripple_mat() -> StandardMaterial3D:
	if _mat_cache.has("water_ripple_mat"):
		return _mat_cache["water_ripple_mat"]

	var sz := 64
	var img := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
	img.fill(Color("#27506b"))
	var rng := RandomNumberGenerator.new(); rng.seed = 8045
	for _i in 28:
		var ry := rng.randi_range(0, sz - 1)
		for x in sz:
			var yy := (ry + int(sin(float(x) * 0.25) * 2.0) + sz) % sz
			img.set_pixel(x, yy, img.get_pixel(x, yy).lerp(Color("#9fc6e0"), 0.28))

	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.albedo_color = Color(1, 1, 1, 0.9)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = 0.15
	m.metallic = 0.25
	m.emission_enabled = true
	m.emission = Color("#1d6488")
	m.emission_energy_multiplier = 0.25
	_mat_cache["water_ripple_mat"] = m
	return m


## Fasad Gedung Kota Jakarta dengan Jendela Menyala (porting dari src/world/facades.js)
func city_building_mat() -> StandardMaterial3D:
	if _mat_cache.has("city_building_mat"):
		return _mat_cache["city_building_mat"]

	var w := 128
	var h := 256
	var diff := Image.create(w, h, false, Image.FORMAT_RGBA8)
	diff.fill(Color("#c9ccd4"))
	var emis := Image.create(w, h, false, Image.FORMAT_RGBA8)
	emis.fill(Color.BLACK)

	var rng := RandomNumberGenerator.new(); rng.seed = 9045
	var sy := 16
	var sx := 13
	var ww := 9
	var wh := 10
	var y := 8
	while y < h - 8:
		var destroyed := rng.randf() < 0.08
		if destroyed:
			_fill_rect_blend(diff, 0, y - 3, w, sy, Color("#0a0a0c"), 0.55)
		var x := 6
		while x < w - 6:
			var wcol := Color("#0e0e12") if destroyed else (Color("#1a1a20") if rng.randf() < 0.12 else Color("#3c3c46"))
			_fill_rect_blend(diff, x, y, ww, wh, wcol, 1.0)
			if not destroyed and rng.randf() < 0.08:
				var lcol := Color("#ffb45e") if rng.randf() < 0.5 else Color("#ff7b30")
				_fill_rect_blend(emis, x, y, ww, wh, lcol, 1.0)
			x += sx
		y += sy

	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = ImageTexture.create_from_image(diff)
	m.roughness = 0.85
	m.emission_enabled = true
	m.emission = Color("#ff9a4a")
	m.emission_texture = ImageTexture.create_from_image(emis)
	m.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
	m.emission_energy_multiplier = 0.75
	_mat_cache["city_building_mat"] = m
	return m
