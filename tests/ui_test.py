import re, sys
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:8765/index.html"
OUT = "/tmp/claude-0/-home-claude/67c44fb3-cee1-5d8f-8600-36a4fa7f968a/scratchpad/"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)"), lambda r: r.abort())
    pg.goto(URL)
    pg.fill("#g-name", "Bagus"); pg.click("button[type=submit]")
    pg.wait_for_selector("text=Supplier purchase outsource")
    pg.screenshot(path=OUT + "s1_orders.png", full_page=True)
    # items: add one
    pg.click("[data-view=items]")
    pg.fill("#i-sku", "o-knit-test"); pg.fill("#i-desc", "Outsource Knit Test"); pg.click("[data-action=save-item]")
    pg.wait_for_selector("text=Item O-KNIT-TEST disimpan.")
    # new order
    pg.click("[data-view=orders]"); pg.click("[data-action=new-order]")
    pg.fill("#d-supplier", "Vendor Uji")
    pg.select_option("#l0-sku", "O-KNIT-TEST")
    pg.fill("#l0-price", "100000"); pg.fill("#l0-disc", "10")
    pg.fill("#l0-s-SS", "10"); pg.fill("#l0-s-MM", "5")
    assert pg.inner_text("#l0-amt").strip().endswith("1.350.000"), pg.inner_text("#l0-amt")
    pg.screenshot(path=OUT + "s2_editor.png", full_page=True)
    pg.click("[data-action=submit-draft]")
    pg.wait_for_selector("text=SPO-0004 di-submit")
    # receive 10 SS, 5 MM
    pg.click("[data-action=act-type][data-v=RECEIVE]")
    inputs = pg.locator("input[data-act]")
    ids = [inputs.nth(i).get_attribute("data-act") for i in range(inputs.count())]
    ss = [i for i in ids if "|SS|" in i][0]; mm = [i for i in ids if "|MM|" in i][0]
    pg.fill(f"[data-act='{ss}']", "11"); pg.click("[data-action=post-act]")
    pg.wait_for_selector(".msg-bad"); print("over-receive msg:", pg.inner_text(".msg-bad"))
    pg.fill(f"[data-act='{ss}']", "10"); pg.fill(f"[data-act='{mm}']", "5"); pg.click("[data-action=post-act]")
    pg.wait_for_selector("text=Receiving tersimpan")
    # QC: SS 7 pass 2 reject 1 damaged, MM 5 pass
    pg.click("[data-action=act-type][data-v=QC]")
    line = ss.split("|")[0]
    pg.fill(f"[data-act='{line}|SS|QC_PASS']", "7"); pg.fill(f"[data-act='{line}|SS|QC_REJECT']", "2"); pg.fill(f"[data-act='{line}|SS|QC_DAMAGED']", "1")
    pg.fill(f"[data-act='{line}|MM|QC_PASS']", "5"); pg.fill("#a-note", "jahitan lepas")
    pg.screenshot(path=OUT + "s3_qc.png", full_page=True)
    pg.click("[data-action=post-act]"); pg.wait_for_selector("text=QC tersimpan")
    pg.click("[data-action=act-type][data-v=REPAIR_RETURN]")
    pg.fill(f"[data-act='{line}|SS|REPAIR_RETURN']", "2"); pg.click("[data-action=post-act]"); pg.wait_for_selector("text=Kembali dari repair tersimpan")
    pg.click("[data-action=act-type][data-v=QC]")
    pg.fill(f"[data-act='{line}|SS|QC_PASS']", "2"); pg.click("[data-action=post-act]"); pg.wait_for_selector("text=QC tersimpan")
    pg.click("[data-action=act-type][data-v=DAMAGE_DISCOUNT]")
    pg.fill(f"[data-act='{line}|SS|DAMAGE_DISCOUNT']", "1"); pg.click("[data-action=post-act]"); pg.wait_for_selector("text=Diskon damaged tersimpan")
    pg.wait_for_selector("text=Order selesai")
    print("status:", pg.inner_text("h1"))
    pg.screenshot(path=OUT + "s4_detail.png", full_page=True)
    # void the discount -> back to OPEN
    pg.locator("tr:has-text('Diskon damaged') [data-action=void-start]").first.click()
    pg.fill("#void-reason", "uji batal"); pg.click("[data-action=void-confirm]"); pg.wait_for_selector("text=Kejadian dibatalkan.")
    print("after void:", pg.inner_text("h1"))
    # recap
    pg.click("[data-view=recap]"); pg.screenshot(path=OUT + "s5_recap.png", full_page=True)
    pg.click("[data-action=recap-tab][data-v=balance]")
    print("recap rows:", pg.inner_text("p.hint"))
    pg.click("[data-view=settings]"); pg.screenshot(path=OUT + "s6_settings.png", full_page=True)
    # mobile
    pg.set_viewport_size({"width": 390, "height": 844}); pg.click("[data-view=orders]")
    sw = pg.evaluate("document.documentElement.scrollWidth"); print("mobile scrollWidth", sw)
    pg.screenshot(path=OUT + "s7_mobile.png", full_page=True)
    # dark
    pg.set_viewport_size({"width": 1400, "height": 900}); pg.emulate_media(color_scheme="dark")
    pg.locator("tr.row-link").first.click(); pg.screenshot(path=OUT + "s8_dark.png", full_page=True)
    b.close()
print("errors:", errs)
