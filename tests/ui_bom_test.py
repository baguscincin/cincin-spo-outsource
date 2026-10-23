import os, re, sys
from playwright.sync_api import sync_playwright

# Tes halaman BOM style (mode demo). Pakai:
#   python tests/ui_bom_test.py [folder_output] export-jira.csv
URL = "http://127.0.0.1:8765/index.html"
OUT = (sys.argv[1] if len(sys.argv) > 1 else "test-output").rstrip("/\\") + "/"
JIRA = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
sys.stdout.reconfigure(encoding="utf-8")
errs, dialogs = [], []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)"), lambda r: r.abort())
    pg.goto(URL)
    pg.fill("#g-name", "Bagus"); pg.click("button[type=submit]")
    pg.click("[data-view=settings]"); pg.click("[data-key=clear]"); pg.click("[data-action=clear-demo]")

    # component dan tiket Jira
    comp = OUT + "beading.csv"
    open(comp, "w", encoding="utf-8").write("SKU component,Nama\nO00200001,Beading Large\nO00200002,Beading Small\n")
    pg.click("[data-view=items]"); pg.set_input_files("input[data-import=component]", comp); pg.click("[data-action=imp-save]")
    pg.wait_for_selector(".toast-good >> text=2 baru")
    pg.click("[data-view=fulfil]"); pg.set_input_files("input[data-import=jira]", JIRA); pg.click("[data-action=imp-save]")
    pg.wait_for_selector(".toast-good >> text=tiket tersimpan", timeout=60000)

    # buka Sage Gown - Pearl dari daftar style
    pg.click("[data-view=styles]"); pg.fill("#s-q", "sage gown - pearl")
    pg.click("tr.row-link:has-text('S2034')")
    pg.wait_for_selector("text=Bill of Materials")
    # ketik nama saja -> diberi tahu belum terdaftar; pilih dari daftar -> centang hijau
    pg.fill("#br-0-comp", "beading")
    print("note typed:", pg.inner_text("#br-0-note"))
    assert "belum terdaftar" in pg.inner_text("#br-0-note")
    pg.fill("#br-0-comp", "O00200001 — Beading Large")
    print("note picked:", pg.inner_text("#br-0-note"), "| pill:", pg.inner_text("#bom-dirty"))
    assert pg.inner_text("#bom-dirty") == "Belum disimpan"
    pg.click("[data-action=bomrow-add]")
    pg.fill("#br-1-comp", "O00200002 — Beading Small"); pg.fill("#br-1-qty", "1")
    pg.screenshot(path=OUT + "b1_bom_editing.png", full_page=True)

    # pindah halaman tanpa simpan -> diperingatkan, tetap di halaman
    pg.once("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    pg.click("[data-view=fulfil]")
    assert dialogs and "belum disimpan" in dialogs[0], dialogs
    assert pg.is_visible("text=Bill of Materials")

    pg.click("[data-action=bom-save]")
    pg.wait_for_selector(".toast-good >> text=BOM S2034 disimpan")
    print("saved:", pg.inner_text(".toast-good"), "| pill:", pg.inner_text("#bom-dirty"))

    # terapkan ke warna lain Sage Gown
    sibs = pg.locator("[data-apply]").evaluate_all("els => els.map(e => e.dataset.apply)")
    print("siblings:", sibs)
    assert "S1857" not in sibs and set(["S2057", "S1891", "S1883", "S1851"]) <= set(sibs)
    pg.click("[data-action=apply-all]")
    pg.click("[data-action=bom-apply]")
    pg.wait_for_selector(".toast-good >> text=BOM diterapkan ke")
    print("applied:", pg.inner_text(".toast-good"))
    pg.screenshot(path=OUT + "b2_bom_saved.png", full_page=True)

    # salin ke Sage Embellished Gown
    pg.click("[data-view=styles]"); pg.fill("#s-q", "S1857"); pg.click("tr.row-link:has-text('S1857')")
    pg.fill("#bc-from", "S2034 — Sage Gown - Pearl"); pg.click("[data-action=bom-copy]")
    pg.wait_for_selector(".toast-good >> text=disalin ke tabel")
    pg.fill("#br-0-qty", "2")
    pg.click("[data-action=bom-save]"); pg.wait_for_selector(".toast-good >> text=BOM S1857 disimpan")
    print("copied:", pg.inner_text(".toast-good"))

    # component dobel ditolak dengan pesan di blok BOM
    pg.click("[data-action=bomrow-add]"); pg.fill("#br-2-comp", "O00200001 — Beading Large")
    pg.click("[data-action=bom-save]")
    pg.wait_for_selector("[data-msg=bom] [data-inline-msg]")
    print("dup msg:", pg.inner_text("[data-msg=bom] [data-inline-msg]"))
    pg.click("[data-action=bom-revert]")

    # daftar style dan "Dipakai di"
    pg.click("[data-view=styles]"); pg.fill("#s-q", ""); pg.click("[data-action=style-show][data-v=MAPPED]")
    print("styles with BOM:", pg.inner_text(".toolbar .hint"))
    pg.click("[data-view=items]"); pg.click("button[data-action=comp-used][data-sku=O00200002]")
    print("used in:", pg.inner_text(".toolbar .hint"))
    pg.screenshot(path=OUT + "b3_styles.png", full_page=True)

    pg.click("[data-view=fulfil]")
    print("fulfil KPI:", [pg.locator(".kpis .kpi-v").nth(i).inner_text().replace("\n", " ") for i in range(4)])

    # HP: tombol Simpan BOM tetap terlihat tanpa scroll
    pg.set_viewport_size({"width": 390, "height": 760})
    pg.click("[data-view=styles]"); pg.fill("#s-q", "S2034"); pg.click("tr.row-link:has-text('S2034')")
    box = pg.locator("[data-action=bom-save]").bounding_box()
    print("mobile save button y:", round(box["y"]), "of", 760, "| scrollWidth:", pg.evaluate("document.documentElement.scrollWidth"))
    pg.screenshot(path=OUT + "b4_mobile.png")
    b.close()
print("errors:", errs)
