"""Local browser regression check. Run the app first, then:
    py Backend/tools/ui_regression.py
Requires Playwright and its Chromium browser (development tools only).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright
from osm_routing import build_graph, find_road_access_point


def main():
    graph = build_graph("Pinagbuhatan")
    points = [find_road_access_point(graph, *point) for point in
              [(14.558085, 121.084922), (14.554, 121.092)]]
    pins = [{"lat": p["lat"], "lng": p["lng"]} for p in points]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        # Tests are local and deterministic; external fonts/map tiles are optional.
        page.route("https://**/*", lambda route: route.abort())
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5000/app?barangay=Pinagbuhatan", wait_until="domcontentloaded")
        page.wait_for_function("isBackendLive && selectedBarangay && gMap")
        page.locator("#hFlood").click()
        page.evaluate("""async pins => {
          await placeRoutePin('start', pins[0].lat, pins[0].lng);
          await placeRoutePin('end', pins[1].lat, pins[1].lng);
          if (!canRunCurrentSimulation()) throw new Error('Road pins were rejected');
          const result = await fetch('/simulate', {method:'POST',
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({
              barangay:selectedBarangay, hazard:selectedHazard,
              start:buildPinRequestPoint('start'), end:buildPinRequestPoint('end')
            })}).then(response => response.json());
          if (result.error) throw new Error(result.message);
          await showSimulationResult(result, {isEarthquakeRun:false, pinsKey:getRoutePinsKey()});
        }""", pins)
        page.wait_for_selector("#routeSafetyContent:not([hidden])")
        route_count = page.evaluate("simData.routes.length")

        # Brand must leave the scrollport with the top of the results.
        positions = page.evaluate("""() => {
          const panel = document.getElementById('routeSafetyPanel');
          const brand = panel.querySelector('.safety-brand');
          const before = brand.getBoundingClientRect().top;
          panel.scrollTop = 240;
          const after = brand.getBoundingClientRect().top;
          panel.scrollTop = 0;
          return {before, after, scroll:panel.scrollHeight-panel.clientHeight};
        }""")
        assert positions["after"] < positions["before"], positions

        # Equivalent layout dimensions to desktop browser zoom at 200%,
        # back to 100%, and far out. Also cover phone/tablet/short viewports.
        for width, height in [(720, 500), (1440, 1000), (720, 450), (1440, 900),
                              (5760, 3600), (1440, 900), (390, 844), (1440, 1000)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(450)  # Leaflet redraws after its debounced moveend.
            page.wait_for_function("""() => {
              const id = window.mobileSim.isActive() ? 'msimResults' : 'routeSafetyPanel';
              const el = document.getElementById(id), rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden'
                && rect.width > 0 && rect.height > 0 && rect.top < innerHeight;
            }""")
            assert page.evaluate("simData.routes.length") == route_count
            if width == 5760:
                page.wait_for_timeout(600)
                tiles = page.evaluate("""() => {
                  let count = 0;
                  getActiveBaseMapLayer().eachLayer(layer => count += Object.keys(layer._tiles || {}).length);
                  return count;
                }""")
                assert tiles < 350, f"Too many retained map tiles: {tiles}"
            print(f"PASS results preserved at {width} x {height}")

        page.evaluate("window.agnasI18n.setLanguage('tl')")
        page.wait_for_function("document.getElementById('resetBtn').textContent.trim() === 'Bagong simulation'")
        assert page.locator("#routeSafetyContent").inner_text().find("Pagsusuri ng sitwasyon") >= 0
        assert "virtual ants" not in page.locator("#routeSafetyContent").inner_text()
        assert "on an adult" not in page.locator("#routeSafetyContent").inner_text()
        print("PASS dynamic flood warnings and results translate")
        # Language changes must not trigger a repeating legend/sheet render loop.
        page.evaluate("""() => {
          window.copyMutationCount = 0;
          window.copyTestObserver = new MutationObserver(records => window.copyMutationCount += records.length);
          window.copyTestObserver.observe(document.body, {subtree:true, characterData:true, childList:true});
        }""")
        page.wait_for_timeout(500)
        assert page.evaluate("copyMutationCount") < 100, "Copy is being continuously rewritten"
        page.evaluate("copyTestObserver.disconnect(); window.agnasI18n.setLanguage('en')")
        page.wait_for_function("document.getElementById('resetBtn').textContent.trim() === 'New simulation'")
        assert "Scenario assessment" in page.locator("#routeSafetyContent").inner_text()
        assert "Ruta " not in page.locator("#routeSafetyContent").inner_text()
        # Newly generated earthquake results, hazard lenses and directions
        # must also follow the active language without a page reload.
        page.evaluate("window.agnasI18n.setLanguage('tl')")
        page.evaluate("selectHazard('Earthquake', document.getElementById('hEarthquake'))")
        page.wait_for_function("getReadyPin('start') && getReadyPin('end')")
        page.evaluate("""async () => {
          const result = await fetch('/earthquake/simulate', {method:'POST',
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({
              barangay:selectedBarangay, start:buildPinRequestPoint('start'), end:buildPinRequestPoint('end')
            })}).then(response => response.json());
          if (result.error) throw new Error(result.message);
          await showSimulationResult(result, {isEarthquakeRun:true, pinsKey:getRoutePinsKey()});
        }""")
        page.wait_for_function("document.querySelector('#routeSafetyContent .safety-card-label').textContent === 'Pagsusuri ng sitwasyon'")
        assert "High ground shaking" not in page.locator("#routeSafetyContent").inner_text()
        print("PASS dynamic earthquake warnings and results translate")
        page.locator("#routeSafetyContent [data-result-directions] summary").click()
        directions = page.locator("#routeSafetyContent [data-result-directions-body]").inner_text()
        assert "Head out" not in directions and "Turn left" not in directions, directions
        page.locator("#eqView-liquefaction").click()
        page.wait_for_function("activeEarthquakeView === 'liquefaction'")
        page.set_viewport_size({"width":390,"height":844})
        page.wait_for_selector("#msimResults", state="visible")
        page.locator("#siteLanguageTrigger").click()
        page.wait_for_selector("#siteTranslatePopup", state="visible")
        page.locator("#siteTranslatePopup [data-language=en]").click()
        page.wait_for_function("document.documentElement.lang === 'en'")
        page.locator("#siteLanguageTrigger").click()
        page.locator("#siteTranslatePopup [data-language=tl]").click()
        images = Path(__file__).parent / "evaluation_results" / "ui"
        images.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(images / "mobile.png"))
        page.set_viewport_size({"width":1440,"height":1000})
        page.wait_for_selector("#routeSafetyPanel", state="visible")
        page.wait_for_timeout(450)
        page.screenshot(path=str(images / "desktop.png"))
        # Persist the language across public pages and back into the simulator.
        page.evaluate("window.agnasI18n.setLanguage('tl')")
        for path in ["/about", "/", "/app?barangay=Pinagbuhatan"]:
            page.goto("http://127.0.0.1:5000" + path, wait_until="domcontentloaded")
            page.wait_for_function("document.documentElement.lang === 'tl'")
            assert page.locator("#siteLanguageCode").inner_text() == "TL"
        assert not errors, errors
        browser.close()
        print("PASS scrolling, zoom layouts, translations and language persistence")


if __name__ == "__main__":
    main()
