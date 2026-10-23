import os, re, sys
from playwright.sync_api import sync_playwright

# Pakai: jalankan server demo di folder web (python -m http.server 8765), lalu
#   python tests/ui_test.py [folder_output_screenshot]
URL = "http://127.0.0.1:8765/index.html"
OUT = (sys.argv[1] if len(sys.argv) > 1 else "test-output").rstrip("/\\") + "/"
os.makedirs(OUT, exist_ok=True)
errs = []


def in_view(pg, sel):
    """Elemen terlihat di layar tanpa perlu scroll."""
    return pg.evaluate("""(sel) => { const r = document.querySelector(sel).getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight; }""", sel)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)"), lambda r: r.abort())
    pg.goto(URL)
    pg.fill("#g-name", "Bagus"); pg.click("button[type=submit]")
    pg.wait_for_selector("text=Supplier purchase outsource")
    assert pg.is_visible("text=Cara pakai, 4 langkah")
    pg.screenshot(path=OUT + "s1_orders.png", full_page=True)

    # SPO baru: submit kosong -> pesan muncul di blok tombol, bukan di atas
    pg.click("[data-action=new-order]")
    pg.click("[data-action=submit-draft]")
    pg.wait_for_selector("[data-msg=editor] [data-inline-msg]")
    assert in_view(pg, "[data-inline-msg]"), "pesan error harus terlihat tanpa scroll"
    print("editor msg:", pg.inner_text("[data-inline-msg]"))

    # tambah SKU langsung dari form order
    pg.click("[data-action=quick-item]")
    pg.fill("#q-sku", "o-knit-test"); pg.fill("#q-desc", "Outsource Knit Test")
    pg.click("[data-action=quick-item-save]")
    pg.wait_for_selector(".toast-good >> text=SKU O-KNIT-TEST ditambahkan")
    assert pg.eval_on_selector("#l0-sku", "e => e.value") == "O-KNIT-TEST"

    pg.fill("#d-supplier", "Vendor Uji")
    pg.fill("#l0-price", "100000"); pg.fill("#l0-disc", "10")
    pg.fill("#l0-s-SS", "10"); pg.fill("#l0-s-MM", "5")
    assert pg.inner_text("#l0-amt").strip().endswith("1.350.000"), pg.inner_text("#l0-amt")
    pg.screenshot(path=OUT + "s2_editor.png", full_page=True)
    pg.click("[data-action=submit-draft]")
    pg.wait_for_selector(".confirm-box")
    print("confirm:", pg.inner_text(".confirm-box p").replace("\n", " "))
    pg.click("[data-action=submit-confirm]")
    pg.wait_for_selector(".toast-good >> text=SPO-0004 berhasil di-submit")
    assert in_view(pg, ".toast-good")

    # Barang datang: qty berlebih ditolak langsung saat mengetik
    pg.click("[data-action=act-type][data-v=RECEIVE]")
    inputs = pg.locator("input[data-act]")
    ids = [inputs.nth(i).get_attribute("data-act") for i in range(inputs.count())]
    ss = [i for i in ids if "|SS|" in i][0]; mm = [i for i in ids if "|MM|" in i][0]
    line = ss.split("|")[0]
    pg.fill(f"[data-act='{ss}']", "11")
    print("live over:", pg.inner_text("#act-live"))
    assert pg.is_disabled("#act-save")
    assert "is-over" in pg.get_attribute(f"[data-act='{ss}']", "class")
    pg.click("[data-action=act-fill]")
    assert pg.input_value(f"[data-act='{ss}']") == "10" and pg.input_value(f"[data-act='{mm}']") == "5"
    print("live ok:", pg.inner_text("#act-live"))
    pg.click("[data-action=post-act]")
    pg.wait_for_selector(".toast-good >> text=Barang datang tersimpan")

    # QC: SS 7 pass 2 reject 1 damaged, MM 5 pass
    pg.click("[data-action=act-type][data-v=QC]")
    pg.fill(f"[data-act='{line}|SS|QC_PASS']", "7"); pg.fill(f"[data-act='{line}|SS|QC_REJECT']", "2"); pg.fill(f"[data-act='{line}|SS|QC_DAMAGED']", "2")
    assert pg.is_disabled("#act-save"), "7+2+2 > 10 harus ditolak"
    pg.screenshot(path=OUT + "s3_qc_over.png", full_page=False, clip=None)
    pg.locator("#act-live").scroll_into_view_if_needed(); pg.screenshot(path=OUT + "s3b_qc_over_view.png")
    pg.fill(f"[data-act='{line}|SS|QC_DAMAGED']", "1")
    pg.fill(f"[data-act='{line}|MM|QC_PASS']", "5"); pg.fill("#a-note", "jahitan lepas")
    pg.click("[data-action=post-act]"); pg.wait_for_selector(".toast-good >> text=Hasil QC tersimpan")
    pg.click("[data-action=act-type][data-v=REPAIR_RETURN]")
    pg.click("[data-action=act-fill]"); pg.click("[data-action=post-act]"); pg.wait_for_selector(".toast-good >> text=Kembali dari repair tersimpan")
    pg.click("[data-action=act-type][data-v=QC]")
    pg.click("[data-action=act-fill]"); pg.click("[data-action=post-act]"); pg.wait_for_selector(".toast-good >> text=Hasil QC tersimpan")
    pg.click("[data-action=act-type][data-v=DAMAGE_DISCOUNT]")
    pg.fill(f"[data-act='{line}|SS|DAMAGE_DISCOUNT']", "1"); pg.click("[data-action=post-act]"); pg.wait_for_selector(".toast-good >> text=Diskon damaged tersimpan")
    pg.wait_for_selector("text=Order selesai")
    print("status:", pg.inner_text("h1"))
    pg.screenshot(path=OUT + "s4_detail.png", full_page=True)

    # batalkan tanpa alasan -> pesan di baris pembatalan
    pg.locator("tr:has-text('Diskon damaged') [data-action=void-start]").first.click()
    pg.click("[data-action=void-confirm]")
    pg.wait_for_selector("[data-msg=void] [data-inline-msg]")
    assert in_view(pg, "[data-inline-msg]")
    print("void msg:", pg.inner_text("[data-inline-msg]"))
    pg.fill("#void-reason", "uji batal"); pg.click("[data-action=void-confirm]"); pg.wait_for_selector(".toast-good >> text=Kejadian dibatalkan.")
    print("after void:", pg.inner_text("h1"))

    # Ubah: receiving SS 10 -> 8 ditolak (sudah di-QC), QC Pass MM 5 -> 4 berhasil
    def edit_row(kind, size):
        return pg.locator(f"tr:not(.voided):has-text('{kind}')").filter(has=pg.locator(f"td.mono >> text='{size}'")).locator("[data-action=edit-start]").first
    edit_row("Barang datang", "SS").click()
    pg.fill("#ed-qty", "8"); pg.click("[data-action=edit-save]")
    pg.wait_for_selector("[data-msg=edit] [data-inline-msg]")
    assert in_view(pg, "[data-inline-msg]")
    print("edit blocked:", pg.inner_text("[data-inline-msg]"))
    pg.click("[data-action=edit-cancel]")
    edit_row("QC Pass", "MM").click()
    pg.fill("#ed-qty", "4"); pg.fill("#ed-reason", "salah hitung"); pg.click("[data-action=edit-save]")
    pg.wait_for_selector(".toast-good >> text=Perubahan disimpan.")
    assert pg.locator("tr:not(.voided) .pill-info:text('Koreksi')").count() == 1
    assert pg.locator("text=Diubah oleh Bagus, alasan: salah hitung").count() == 1
    print("after edit:", pg.inner_text("h1").replace("\n", " "), "| menunggu QC:", pg.inner_text(".kpis-sm .kpi:nth-child(3) .kpi-v"))
    pg.locator("tr.edit-row, .tbl-hist").first.scroll_into_view_if_needed()
    pg.screenshot(path=OUT + "s4b_history_edit.png", full_page=True)

    # cetak: 2 lembar
    pg.click("[data-action=print]")
    pg.wait_for_selector(".sheet")
    assert pg.locator(".sheet").count() == 2
    print("copies:", pg.locator(".sh-copy").all_inner_texts())
    pg.screenshot(path=OUT + "s5_print.png", full_page=True)
    pg.emulate_media(media="print")
    pg.pdf(path=OUT + "spo.pdf", format="A4", print_background=True, prefer_css_page_size=True)
    pg.emulate_media(media="screen")
    pg.click("[data-action=print-back]")

    # rekap
    pg.click("[data-view=recap]"); pg.screenshot(path=OUT + "s6_recap.png", full_page=True)
    pg.click("[data-action=recap-tab][data-v=balance]")
    print("recap rows:", pg.inner_text("p.hint"))
    pg.click("[data-view=settings]"); pg.screenshot(path=OUT + "s7_settings.png", full_page=True)
    # mobile
    pg.set_viewport_size({"width": 390, "height": 844}); pg.click("[data-view=orders]")
    sw = pg.evaluate("document.documentElement.scrollWidth"); print("mobile scrollWidth", sw)
    pg.screenshot(path=OUT + "s8_mobile.png", full_page=True)
    pg.locator("tr.row-link").first.click(); pg.screenshot(path=OUT + "s9_mobile_detail.png", full_page=True)
    # dark
    pg.set_viewport_size({"width": 1400, "height": 900}); pg.emulate_media(color_scheme="dark")
    pg.screenshot(path=OUT + "s10_dark.png", full_page=True)
    b.close()
print("errors:", errs)
