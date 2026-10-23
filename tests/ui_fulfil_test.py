import os, re, sys
from playwright.sync_api import sync_playwright

# Tes Fulfillment PO di mode demo. Pakai:
#   python tests/ui_fulfil_test.py [folder_output] [file_export_jira.csv]
URL = "http://127.0.0.1:8765/index.html"
OUT = (sys.argv[1] if len(sys.argv) > 1 else "test-output").rstrip("/\\") + "/"
JIRA = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)
errs = []


def kpi(pg, i):
    return pg.locator(".kpis .kpi-v").nth(i).inner_text().replace("\n", " ")


def po_state(pg, po):
    return pg.locator(f"tr:has(button[data-po='{po}']) .pill").first.inner_text()


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)"), lambda r: r.abort())
    pg.goto(URL)
    pg.fill("#g-name", "Bagus"); pg.click("button[type=submit]")

    # data contoh: 7 tiket outsource menunggu, 4 bisa dipenuhi, 3 back order
    pg.click("[data-view=fulfil]")
    print("KPI:", [kpi(pg, i) for i in range(4)])
    assert kpi(pg, 3) == "2", "O00100003 S dan M perlu SPO baru"
    assert kpi(pg, 0).startswith("7") and kpi(pg, 1).startswith("4") and kpi(pg, 2).startswith("3")
    print("PO:", [(po, po_state(pg, po)) for po in ["PO-DEMO-01", "PO-DEMO-02", "PO-DEMO-03"]])
    assert po_state(pg, "PO-DEMO-01") == "Siap semua" and po_state(pg, "PO-DEMO-02") == "Sebagian"
    pg.screenshot(path=OUT + "f1_po.png", full_page=True)

    # prioritas: PO-DEMO-03 diutamakan -> S9001 S miliknya terpenuhi, PO-DEMO-02 jadi back order penuh
    pg.click("tr:has(button[data-po='PO-DEMO-03']) [data-action=prio-top]")
    pg.wait_for_selector(".toast-good >> text=Prioritas PO-DEMO-03 diubah")
    first = pg.locator("tbody tr").first.inner_text()
    assert "PO-DEMO-03" in first, first
    print("after prio:", [(po, po_state(pg, po)) for po in ["PO-DEMO-03", "PO-DEMO-01", "PO-DEMO-02"]])
    assert po_state(pg, "PO-DEMO-02") == "Back order"
    pg.click("[data-action=prio-reset]"); pg.wait_for_selector(".toast-good >> text=Antrian kembali ke FIFO")

    # per tiket + kekurangan
    pg.click("button[data-po='PO-DEMO-02']")
    pg.wait_for_selector("#ft-po")
    print("tickets PO-DEMO-02:", pg.locator("p.hint").first.inner_text())
    pg.screenshot(path=OUT + "f2_tickets.png", full_page=True)
    pg.click("[data-action=ful-tab][data-v=short]"); pg.screenshot(path=OUT + "f3_short.png", full_page=True)

    # adjustment +5 O00100003 S -> S9002 S (butuh 4) bisa dipenuhi
    pg.click("[data-action=ful-tab][data-v=stock]")
    pg.click("[data-action=adj-save]")
    pg.wait_for_selector("[data-msg=adj] [data-inline-msg]")
    print("adj empty msg:", pg.inner_text("[data-msg=adj] [data-inline-msg]"))
    pg.select_option("#adj-sku", "O00100003"); pg.select_option("#adj-size", "S")
    pg.fill("#adj-qty", "5"); pg.fill("#adj-reason", "stok opname")
    pg.click("[data-action=adj-save]"); pg.wait_for_selector(".toast-good >> text=Adjustment disimpan.")
    print("KPI after adj:", [kpi(pg, i) for i in range(4)])
    assert kpi(pg, 1).startswith("5")
    pg.screenshot(path=OUT + "f4_stock.png", full_page=True)

    # import component (CSV titik koma ala Excel Indonesia) + pemetaan manual
    comp = OUT + "comp.csv"
    open(comp, "w", encoding="utf-8").write("SKU component;Nama;Unit\nO00123123;Beading Star Asli;Each\nO00123124;Crochet Lace;\n")
    pg.click("[data-view=items]")
    pg.set_input_files("input[data-import=component]", comp)
    pg.wait_for_selector("[data-action=imp-save]")
    pg.click("[data-action=imp-save]"); pg.wait_for_selector(".toast-good >> text=2 baru")

    if JIRA:
        pg.click("[data-view=fulfil]")
        pg.set_input_files("input[data-import=jira]", JIRA)
        pg.wait_for_selector("[data-action=imp-save]")
        print("jira preview:", pg.inner_text(".confirm-box .facts").replace("\n", " | "))
        pg.screenshot(path=OUT + "f5_jira_preview.png", full_page=True)
        pg.click("[data-action=imp-save]"); pg.wait_for_selector(".toast-good >> text=tiket tersimpan", timeout=60000)
        print("jira saved:", pg.inner_text(".toast-good"))
        # petakan S2098 (Cleo Cropped Top - Mod Pink) ke beading star x2
        pg.click("[data-view=styles]"); pg.fill("#s-q", "S2098")
        pg.click("tr.row-link:has-text('S2098')")
        pg.fill("#br-0-comp", "O00123123"); pg.fill("#br-0-qty", "2"); pg.click("[data-action=bom-save]")
        pg.wait_for_selector(".toast-good >> text=BOM S2098 disimpan: O00123123 ×2")
        pg.screenshot(path=OUT + "f6_style.png", full_page=True)
        pg.click("[data-view=fulfil]")
        print("KPI with jira:", [kpi(pg, i) for i in range(4)])
        pg.click("[data-action=ful-tab][data-v=short]")
        print("short rows:", pg.locator("tbody tr").count())
        pg.screenshot(path=OUT + "f7_jira_short.png", full_page=True)
        # upload ulang file yang sama: tidak dobel
        pg.click("[data-action=ful-tab][data-v=po]")
        pg.set_input_files("input[data-import=jira]", JIRA)
        pg.click("[data-action=imp-save]"); pg.wait_for_selector(".toast-good >> text=0 baru", timeout=60000)
        print("re-upload:", pg.inner_text(".toast-good"))

    pg.set_viewport_size({"width": 390, "height": 844}); pg.click("[data-view=fulfil]")
    print("mobile scrollWidth", pg.evaluate("document.documentElement.scrollWidth"))
    pg.screenshot(path=OUT + "f8_mobile.png", full_page=False)
    b.close()
print("errors:", errs)
