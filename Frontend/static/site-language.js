// Curated English/Tagalog copy shared by every page. Translate text nodes
// and accessible labels without replacing elements, inputs, or listeners.
// No translation service, account, or network request is needed.
(function initSiteLanguage() {
  const storageKey = 'agnas-language';
  const copy = new Map([
    ['Home', 'Simula'],
    ['About', 'Tungkol'],
    ['How to use', 'Paano gamitin'],
    ['Skip to content', 'Pumunta sa nilalaman'],
    ['Main', 'Pangunahing nabigasyon'],
    ['Navigation menu', 'Menu ng nabigasyon'],
    ['Close navigation', 'Isara ang nabigasyon'],
    ['AGNAS home', 'Simula ng AGNAS'],
    ['Theme', 'Tema'],
    ['Light mode', 'Maliwanag na tema'],
    ['Dark mode', 'Madilim na tema'],
    ['Pull down to refresh', 'Hilahin pababa para i-refresh'],
    ['Release to refresh', 'Bitawan para i-refresh'],
    ['Refreshing…', 'Nagre-refresh…'],
    ['Pull down to refresh. Press Enter to refresh.', 'Hilahin pababa para i-refresh. Pindutin ang Enter para i-refresh.'],
    ['Ant Guided Navigation And Safety System', 'Sistema ng Ligtas na Paglalakbay sa Gabay ng mga Langgam'],
    ['Disaster Preparedness', 'Paghahanda sa Sakuna'],
    ['for safer communities', 'para sa mas ligtas na komunidad'],
    ['AGNAS is a simulation tool for Barangay Pinagbuhatan and Sta. Lucia. It models safe navigation paths for Flood and Earthquake scenarios, filtering out hazard-prone routes before evaluating path distance.', 'Ang AGNAS ay isang simulator para sa Barangay Pinagbuhatan at Sta. Lucia. Naghahanap ito ng ligtas na ruta para sa mga sitwasyon ng baha at lindol. Inaalis muna nito ang mga rutang delikado bago ikumpara ang layo.'],
    ['Coverage map', 'Mapa ng sakop na lugar'],
    ['Select your Barangay', 'Piliin ang iyong barangay'],
    ['Select a barangay first to start the simulation.', 'Pumili muna ng barangay bago simulan ang simulation.'],
    ['Open simulator', 'Buksan ang simulator'],
    ['Choose your barangay, then set your route on the map.', 'Piliin ang iyong barangay, saka itakda ang ruta sa mapa.'],
    ['AGNAS at a glance', 'Buod ng AGNAS'],
    ['Ant Colony Optimization', 'Ant Colony Optimization'],
    ['Safety over distance', 'Kaligtasan bago ang layo'],
    ['Ranking rule', 'Batayan sa pagpili ng ruta'],
    ['Hazard models: Flood & Earthquake', 'Mga panganib: Baha at Lindol'],
    ['Visitor counter', 'Bilang ng mga bumisita'],
    ['Good to know', 'Mahalagang malaman'],
    ['Before you start', 'Bago ka magsimula'],
    ['A few things worth knowing before you plan a route.', 'Ilang paalala bago magplano ng iyong ruta.'],
    ['Walking routes only', 'Mga ruta para sa paglalakad lamang'],
    ["Routes are built for pedestrians, so they don't follow one-way streets or other vehicle-only restrictions.", 'Para sa mga naglalakad ang mga ruta, kaya hindi sinusunod ang one-way at iba pang patakarang para lamang sa sasakyan.'],
    ['Built on official hazard data', 'Batay sa opisyal na datos ng panganib'],
    ['Flood levels come from', 'Ang mga antas ng baha ay mula sa'],
    ['. Earthquake liquefaction and ground shaking levels come from', '. Ang mga antas ng paglambot ng lupa at pagyanig ay mula sa'],
    [', through', ', sa pamamagitan ng'],
    ['All data sources', 'Lahat ng pinagmulan ng datos'],
    ['Plan ahead, not during an emergency', 'Magplano bago dumating ang sakuna'],
    ['AGNAS is built for preparation, not live alerts. When a disaster strikes, rely on your local authorities for instructions.', 'Para sa paghahanda ang AGNAS at hindi ito nagbibigay ng agarang babala. Kapag may sakuna, sundin ang mga tagubilin ng lokal na awtoridad.'],
    ['Emergency hotlines', 'Mga numerong pang-emergency'],
    ['Hazards', 'Mga panganib'],
    ['See what each hazard does on the street', 'Tingnan ang epekto ng bawat panganib sa kalsada'],
    ['Pick a flood level, or turn on an earthquake layer and press Simulate.', 'Pumili ng antas ng baha, o buksan ang isang layer ng lindol at pindutin ang Simulate.'],
    ['Flood depth', 'Lalim ng baha'],
    ['How deep each flood level gets.', 'Gaano kalalim ang bawat antas ng baha.'],
    ['Low', 'Mababa'],
    ['Medium', 'Katamtaman'],
    ['Moderate', 'Katamtaman'],
    ['High', 'Mataas'],
    ['Moderate to High', 'Katamtaman hanggang mataas'],
    ['Up to 0.5 m', 'Hanggang 0.5 m'],
    ['Up to the knees', 'Hanggang tuhod'],
    ['Knees to neck', 'Mula tuhod hanggang leeg'],
    ['Over 1.5 m', 'Higit sa 1.5 m'],
    ['Above the neck', 'Lampas sa leeg'],
    ['Adult', 'Adulto'],
    ['Child', 'Bata'],
    ['Street drawn to scale: a 167 cm adult and a 130 cm child standing in flood water in front of houses', 'Kalsadang iginuhit ayon sa sukat: isang adultong 167 cm at batang 130 cm na nakatayo sa baha sa harap ng mga bahay'],
    ['Adult: 167 cm (5\'6"). Child: 10 years old and below, 130 cm. Walking limits follow the', 'Adulto: 167 cm (5\'6"). Bata: 10 taong gulang pababa, 130 cm. Ang mga limitasyon sa paglalakad ay batay sa'],
    ['Water depth', 'Lalim ng tubig'],
    ['Water reaches', 'Abot ng tubig'],
    ['Level', 'Antas'],
    ['Walking', 'Paglalakad'],
    ['Walkable', 'Maaaring lakaran'],
    ['Risky', 'Mapanganib'],
    ['Not walkable', 'Hindi maaaring lakaran'],
    ['Past 1.2 m, unsafe even for adults.', 'Kapag higit sa 1.2 m, delikado kahit sa mga nasa hustong gulang.'],
    ['Walk carefully. The water can hide open drains.', 'Maglakad nang maingat. Maaaring matakpan ng tubig ang mga bukas na kanal.'],
    ['Walking is slower. Keep children close.', 'Mas mabagal ang paglalakad. Panatilihing malapit ang mga bata.'],
    ['Hard to walk. Carry small children.', 'Mahirap maglakad. Kargahin ang maliliit na bata.'],
    ['Hard to stay standing. Children can be swept away.', 'Mahirap manatiling nakatayo. Maaaring matangay ang mga bata.'],
    ['Even adults struggle to stay standing.', 'Kahit ang mga nasa hustong gulang ay nahihirapang manatiling nakatayo.'],
    ['Too deep. Stay on higher ground.', 'Masyadong malalim. Manatili sa mas mataas na lugar.'],
    ['Earthquake hazards', 'Mga panganib ng lindol'],
    ['Turn on a layer, then press Simulate.', 'Buksan ang isang layer, saka pindutin ang Simulate.'],
    ['Earthquake layers', 'Mga layer ng lindol'],
    ['Ground shaking', 'Pagyanig ng lupa'],
    ['How strongly the ground shakes.', 'Gaano kalakas ang pagyanig ng lupa.'],
    ['Level: High', 'Antas: Mataas'],
    ['Liquefaction', 'Paglambot ng lupa'],
    ['Wet ground that turns soft like mud.', 'Basang lupa na lumalambot na parang putik.'],
    ['Level: Moderate to High', 'Antas: Katamtaman hanggang mataas'],
    ['Showing:', 'Ipinapakita:'],
    ['Both', 'Pareho'],
    ['Both:', 'Pareho:'],
    ['No layer', 'Walang layer'],
    ['No layer on', 'Walang nakabukas na layer'],
    ['Simulate ground shaking', 'Simulate ang pagyanig'],
    ['Simulate liquefaction', 'Simulate ang paglambot ng lupa'],
    ['Simulate both', 'Simulate ang pareho'],
    ['Turn on a layer first', 'Buksan muna ang isang layer'],
    ['Turn on a layer to see what it does.', 'Buksan ang isang layer para makita ang epekto nito.'],
    ['Street built on loose, wet sand beside a river, shown with the ground cut away', 'Kalsadang nasa maluwag at basang buhangin sa tabi ng ilog, na ipinapakita ang ilalim ng lupa'],
    ['Groundwater', 'Tubig sa ilalim ng lupa'],
    ['Water rises', 'Tumataas ang tubig'],
    ['Loose, wet sand', 'Maluwag at basang buhangin'],
    ['Firm soil', 'Matibay na lupa'],
    ['Ground settles', 'Lumulubog ang lupa'],
    ['Road cracks', 'Bumibitak ang kalsada'],
    ['Mud bubbles up', 'Umaangat ang putik'],
    ['Building tilts and sinks', 'Tumatagilid at lumulubog ang gusali'],
    ['Walls crack, debris falls onto the road', 'Bumibitak ang pader at nahuhulog ang mga labi sa kalsada'],
    ['Ground layers', 'Mga sapin ng lupa'],
    ['Ground shaking: High', 'Pagyanig ng lupa: Mataas'],
    ['Liquefaction: Moderate to High', 'Paglambot ng lupa: Katamtaman hanggang mataas'],
    ['On the street', 'Sa kalsada'],
    ['Ground shaking:', 'Pagyanig ng lupa:'],
    ['Liquefaction:', 'Paglambot ng lupa:'],
    ['strong shaking cracks walls and drops debris on roads.', 'sa malakas na pagyanig, bumibitak ang mga pader at nahuhulog ang mga labi sa kalsada.'],
    ['shaking turns wet, sandy ground soft like mud. Buildings sink and tilt, and roads crack.', 'dahil sa pagyanig, lumalambot na parang putik ang basa at mabuhanging lupa. Lumulubog at tumatagilid ang mga gusali, at bumibitak ang kalsada.'],
    ['the ground shakes and turns soft. Buildings sway, tilt and sink, and roads crack.', 'yumayanig at lumalambot ang lupa. Umuuga, tumatagilid at lumulubog ang mga gusali, at bumibitak ang kalsada.'],
    ['How it works', 'Paano ito gumagana'],
    ['How our ants work for you', 'Paano tumutulong ang aming mga langgam'],
    ['Simulated ants map local streets — strengthening digital signals on safe roads while fading out paths with hazards.', 'Sinusuri ng mga digital na langgam ang mga kalsada. Pinalalakas nila ang mga senyas sa ligtas na ruta habang pinapahina ang sa mga delikadong daan.'],
    ['Ants explore the graph', 'Sinusuri ng mga langgam ang mga daan'],
    ['Independent, parallel search', 'Sabay-sabay at magkakahiwalay na paghahanap'],
    ['Digital "ants" try out many different routes across the streets, checking each one for flood or earthquake danger instead of just picking one path.', 'Sinusubukan ng mga digital na langgam ang iba’t ibang ruta sa mga kalsada. Sinusuri nila ang panganib ng baha o lindol sa bawat daan bago pumili.'],
    ['Pheromone reinforces safe, short trails', 'Pinalalakas ng pheromone ang ligtas at maikling ruta'],
    ['Safer + shorter trails strengthen', 'Lumalakas ang ligtas at maikling ruta'],
    ['Every run, the ants leave a stronger trail on safe roads and a fading trail on unsafe ones — like a scent trail that only lasts on the good paths.', 'Sa bawat takbo, nag-iiwan ang mga langgam ng mas malakas na senyas sa ligtas na kalsada at humihinang senyas sa delikadong daan. Para itong amoy na nananatili sa magandang ruta.'],
    ['Routes are ranked safety-first', 'Kaligtasan muna sa pagpili ng ruta'],
    ['Safety before distance, always', 'Laging unahin ang kaligtasan bago ang layo'],
    ["Dangerous roads are crossed out first. Only then does AGNAS pick the shortest route from what's left.", 'Inaalis muna ang mga delikadong kalsada. Pagkatapos, pinipili ng AGNAS ang pinakamaikling ruta mula sa mga natitira.'],
    ['All rights reserved.', 'Nakalaan ang lahat ng karapatan.'],
    ['If you are in immediate danger, call one of these numbers right away.', 'Kung nasa agarang panganib, tumawag agad sa isa sa mga numerong ito.'],
    ['National Emergency Hotline', 'Pambansang numerong pang-emergency'],
    ['Pasig City DRRMO Emergency Hotline', 'Numerong pang-emergency ng Pasig City DRRMO'],
    ['Barangay Pinagbuhatan Action Center Hotline', 'Numero ng Barangay Pinagbuhatan Action Center'],
    ['Barangay Santa Lucia Hotline', 'Numero ng Barangay Santa Lucia'],
    ['or', 'o'],
    ['Feedback', 'Puna'],
    ['Send feedback', 'Magpadala ng puna'],
    ['How was this page?', 'Kumusta ang pahinang ito?'],
    ['Takes about 20 seconds.', 'Mga 20 segundo lang ito.'],
    ['Rating', 'Marka'],
    ['Confusing', 'Nakalilito'],
    ['Okay', 'Ayos lang'],
    ['Clear', 'Malinaw'],
    ['I am a', 'Ako ay isang'],
    ['Select one', 'Pumili ng isa'],
    ['Resident', 'Residente'],
    ['Barangay official / LGU staff', 'Opisyal ng barangay / kawani ng LGU'],
    ['Researcher / Student', 'Mananaliksik / Estudyante'],
    ['Other', 'Iba pa'],
    ["What worked, what didn't", 'Ano ang maayos at ano ang dapat ayusin?'],
    ['Optional', 'Opsyonal'],
    ['Close feedback', 'Isara ang puna'],
    ['Responses are anonymous and used only to evaluate the system.', 'Hindi kinikilala ang sumagot. Ginagamit lamang ang mga tugon sa pagsusuri ng sistema.'],
    ['Pick a rating or write a comment first.', 'Pumili muna ng marka o magsulat ng komento.'],
    ['Sending…', 'Ipinapadala…'],
    ['Thanks for your feedback!', 'Salamat sa iyong puna!'],
    ['Thanks for the feedback!', 'Salamat sa iyong puna!'],
    ['Something went wrong. Please try again.', 'May nangyaring problema. Subukan muli.'],
    ["Couldn't reach the server. Check your connection and try again.", 'Hindi makakonekta sa server. Suriin ang iyong koneksiyon at subukan muli.'],
    ['Coverage area', 'Sakop na lugar'],
    ['Close coverage map', 'Isara ang mapa ng sakop na lugar'],
    ['A preview of where AGNAS operates, no simulation runs here.', 'Ipinapakita rito ang sakop ng AGNAS. Walang simulation na tatakbo rito.'],
    ['Loading coverage map…', 'Ikinakarga ang mapa ng sakop na lugar…'],
    ['Barangay coverage map', 'Mapa ng mga sakop na barangay'],
    ['Try again', 'Subukan muli'],
    ['Coverage: Barangay Pinagbuhatan & Barangay Sta. Lucia, Pasig City only — no other areas are supported yet.', 'Sakop: Barangay Pinagbuhatan at Barangay Sta. Lucia sa Pasig City lamang. Wala pang suporta para sa ibang lugar.'],
    ['Could not load the map library.', 'Hindi maikarga ang mapa.'],
    ['Coverage boundaries could not load. Please try again.', 'Hindi maikarga ang mga hangganan ng sakop na lugar. Subukan muli.'],
    ['Coverage boundaries are unavailable. Please try again.', 'Hindi available ang mga hangganan ng sakop na lugar. Subukan muli.'],
    ['Could not load the coverage map.', 'Hindi maikarga ang mapa ng sakop na lugar.'],
    ['Close', 'Isara'],
    ['How to use AGNAS', 'Paano gamitin ang AGNAS'],
    ['Step', 'Hakbang'],
    ['of 5', 'sa 5'],
    ['1. Pick barangay', '1. Pumili ng barangay'],
    ['Choose your barangay/area.', 'Piliin ang iyong barangay o lugar.'],
    ['2. Pick disaster', '2. Pumili ng sakuna'],
    ['Sets the hazard you want to simulate.', 'Piliin ang panganib na nais mong i-simulate.'],
    ['3. Pin start / end', '3. Itakda ang simula at destinasyon'],
    ['Tap the map where you are. Use an evacuation site, or choose your own destination for flood or earthquake routes.', 'Pindutin sa mapa ang iyong lokasyon. Gumamit ng evacuation site, o pumili ng sariling destinasyon para sa ruta sa baha o lindol.'],
    ['4. Reveal evacuation sites', '4. Ipakita ang mga evacuation site'],
    ['For flood or earthquake: pin where you are, then tap Show evacuation sites, or choose your own destination instead.', 'Para sa baha o lindol: itakda ang iyong lokasyon, saka pindutin ang Ipakita ang mga evacuation site, o pumili ng sariling destinasyon.'],
    ['5. Run simulation', '5. Simulan ang simulation'],
    ['Watch the ants search, then see the best routes, ranked.', 'Panoorin ang paghahanap ng mga langgam, saka tingnan ang pagkakasunod-sunod ng pinakamagagandang ruta.'],
    ['Back', 'Bumalik'],
    ['Next', 'Susunod'],
    ['Done', 'Tapos na'],
    ['Barangay selection cards for Pinagbuhatan and Sta. Lucia', 'Mga pagpipilian ng barangay para sa Pinagbuhatan at Sta. Lucia'],
    ['Flood and Earthquake hazard selection cards', 'Mga pagpipilian para sa panganib ng baha at lindol'],
    ['Start pinned on the map, with the evacuation site as the destination', 'Nakatakda sa mapa ang simula at ang evacuation site bilang destinasyon'],
    ['Show Evacuation Sites and Choose my own destination buttons for earthquake mode', 'Mga pindutan para ipakita ang evacuation sites at pumili ng sariling destinasyon sa lindol'],
    ['Run Simulation button, ready to launch', 'Handa nang pindutin ang Simulan ang simulation'],
    ['About AGNAS', 'Tungkol sa AGNAS'],
    ['About AGNAS · Evacuation route planning', 'Tungkol sa AGNAS · Pagpaplano ng ruta sa paglikas'],
    ['Project overview', 'Tungkol sa proyekto'],
    ['AGNAS helps you plan safer walking routes in Barangay Pinagbuhatan and Barangay Sta. Lucia, Pasig City. Using official flood and earthquake hazard maps from', 'Tinutulungan ka ng AGNAS na magplano ng mas ligtas na ruta sa paglalakad sa Barangay Pinagbuhatan at Barangay Sta. Lucia, Pasig City. Gumagamit ito ng opisyal na mapa ng panganib ng baha at lindol mula sa'],
    ['and', 'at'],
    [', it shows which routes avoid high-risk streets, with the best routes listed first. Use it to plan ahead before a disaster, not during an emergency.', ', upang ipakita ang mga rutang umiiwas sa delikadong kalsada. Inuuna nito ang pinakamagandang mga ruta. Gamitin ito sa paghahanda bago ang sakuna, hindi habang may emergency.'],
    ['Architecture', 'Estruktura ng sistema'],
    ['A three-tier build separating the map interface from the routing computation.', 'May tatlong bahagi ang sistema upang maihiwalay ang mapa sa pagkalkula ng ruta.'],
    ['Client', 'Interface'],
    ['Service', 'Serbisyo'],
    ['Data', 'Datos'],
    ['Offline multi-hazard datasets', 'Mga nakaimbak na datos ng iba’t ibang panganib'],
    ['Data sources', 'Pinagmulan ng datos'],
    ['Flood hazard levels', 'Mga antas ng panganib ng baha'],
    ['25-year flood hazard map. It is a modeled flood scenario, not live flood conditions.', 'Mapa ng 25-year flood hazard. Modelo ito ng posibleng baha at hindi ng kasalukuyang kondisyon.'],
    ['Liquefaction & ground shaking', 'Paglambot at pagyanig ng lupa'],
    ['hazard maps on', 'mga mapa ng panganib sa'],
    [", traced by the team. The West Valley Fault line is from PHIVOLCS too; the earthquake scenario's epicenter is set on it where it passes closest to the barangay.", ', na kinopya ng pangkat. Mula rin sa PHIVOLCS ang linya ng West Valley Fault. Nakatakda ang sentro ng lindol sa bahagi ng fault na pinakamalapit sa barangay.'],
    ['Road network and water areas', 'Mga kalsada at anyong tubig'],
    ['contributors, under the', 'mga tagapag-ambag, sa ilalim ng'],
    ['. Downloaded with', '. Na-download gamit ang'],
    ['Walking limits in flood water', 'Mga limitasyon sa paglalakad sa baha'],
    [': water past 0.5 m is unsafe for children and older adults, and past 1.2 m for anyone.', ': ang tubig na lampas 0.5 m ay delikado para sa mga bata at nakatatanda, at delikado para sa lahat kapag lampas 1.2 m.'],
    ['Contact the team', 'Makipag-ugnayan sa pangkat'],
    ['Questions about the study, the data, or a request to use the system.', 'Mga tanong tungkol sa pag-aaral, datos, o kahilingan sa paggamit ng sistema.'],
    ['Name', 'Pangalan'],
    ['Email', 'Email'],
    ['Message', 'Mensahe'],
    ['Data request, question, or feedback', 'Kahilingan sa datos, tanong, o puna'],
    ['Send message', 'Ipadala ang mensahe'],
    ["We typically reply within 2–3 business days. AGNAS isn't a live service wired directly to real-time hazard feeds, so the site doesn't need round-the-clock monitoring.", 'Karaniwan kaming sumasagot sa loob ng 2–3 araw ng trabaho. Hindi direktang nakakonekta ang AGNAS sa live na datos ng panganib, kaya hindi ito kailangang bantayan nang buong araw.'],
    ['Please fill in your name, email, and message.', 'Ilagay ang iyong pangalan, email, at mensahe.'],
    ['Please enter a valid email address.', 'Maglagay ng wastong email address.'],
    ["Message sent. We'll reply by email.", 'Naipadala na ang mensahe. Sasagot kami sa email.'],
    ['Research team', 'Pangkat ng pananaliksik'],
    ['Authors', 'Mga mananaliksik'],
    ['Adviser', 'Tagapayo'],
    ['Program head', 'Pinuno ng programa'],
    ['Developed in partial fulfillment of the requirements for the degree of Bachelor of Science in Computer Science at STI College Global City.', 'Binuo bilang bahagi ng mga kinakailangan para sa kursong Bachelor of Science in Computer Science sa STI College Global City.'],
  ]);
  for (const [english, tagalog] of window.agnasSimulatorCopy || []) copy.set(english, tagalog);
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const lowerCopy = new Map([...copy].map(([english, tagalog]) => [english.toLowerCase(), tagalog]));
  const reverse = new Map([...copy].map(([english, tagalog]) => [normalize(tagalog), english]));
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const attributes = ['aria-label', 'aria-valuetext', 'placeholder', 'title', 'alt'];
  const excluded = 'script, style, noscript, code, pre, textarea, [data-no-translate]';
  let language = 'en';
  try { if (localStorage.getItem(storageKey) === 'tl') language = 'tl'; } catch (_) {}

  const reach = {
    ankles: 'bukong-bukong', shins: 'binti', knees: 'tuhod', thighs: 'hita', hips: 'balakang',
    waist: 'baywang', chest: 'dibdib', shoulders: 'balikat', chin: 'baba', eyes: 'mata',
    neck: 'leeg', face: 'mukha',
  };

  function tagalog(source) {
    const key = normalize(source);
    if (copy.has(key)) return copy.get(key);
    if (key === key.toUpperCase() && lowerCopy.has(key.toLowerCase())) {
      return lowerCopy.get(key.toLowerCase()).toUpperCase();
    }
    if (key === key.toLowerCase() && lowerCopy.has(key)) {
      const value = lowerCopy.get(key);
      return value[0].toLowerCase() + value.slice(1);
    }
    // A caption can join a title to several independently generated
    // sentences. Translate those before a parameterized title can consume
    // the rest as a place name.
    let match = key.match(/^(.+?[.!?])\s+(.+)$/);
    if (match) {
      const first = tagalog(match[1]);
      if (first !== match[1]) return `${first} ${tagalog(match[2])}`;
    }
    for (const [pattern, replacement] of window.agnasSimulatorPatterns || []) {
      if (pattern.test(key)) return key.replace(pattern, (_match, ...args) => replacement(tagalog, ...args));
    }
    match = key.match(/^Opens with (.+) selected\.$/);
    if (match) return `Magbubukas na napili ang ${match[1]}.`;
    match = key.match(/^(Adult|Child): (?:up to the (.+)|(over the head))$/);
    if (match) return `${match[1] === 'Adult' ? 'Adulto' : 'Bata'}: ${match[3] ? 'lampas sa ulo' : `hanggang ${reach[match[2]] || match[2]}`}`;
    match = key.match(/^Step ([1-5])$/);
    if (match) return `Hakbang ${match[1]}`;
    match = key.match(/^([\d.]+ m), (Low|Medium|High) flood$/);
    if (match) return `${match[1]}, ${copy.get(match[2]).toLowerCase()} na baha`;
    // Captions and warnings combine independently translated sentences.
    // Split only when the leading sentence/label is recognized, preserving
    // place names, abbreviations, measurements and unknown copy verbatim.
    match = key.match(/^([^:]+): (.+)$/);
    if (match) {
      const label = tagalog(match[1]);
      if (label !== match[1]) return `${label}: ${tagalog(match[2])}`;
    }
    match = key.match(/^(.+?); (.+)$/);
    if (match) {
      const first = tagalog(match[1]);
      if (first !== match[1]) return `${first}; ${tagalog(match[2])}`;
    }
    if (key.endsWith('.')) {
      const sentence = key.slice(0, -1);
      const translated = tagalog(sentence);
      if (translated !== sentence) return `${translated}.`;
    }
    return source;
  }

  function render(source) {
    source = String(source ?? '');
    if (language === 'en') return source;
    const translated = tagalog(source);
    if (translated === source) return source;
    // Leaflet and the mobile legend can copy translated labels into new
    // nodes. Remember dynamic sentences as well as the static dictionary so
    // switching back to English restores them too.
    if (reverse.size < 4000) reverse.set(normalize(translated), normalize(source));
    return source.replace(/\S[\s\S]*\S|\S/, translated);
  }

  function sourceFor(value, previous) {
    if (previous && value === previous.rendered) return previous.source;
    const english = reverse.get(normalize(value));
    // Newly created nodes may copy a label that is already translated.
    return english && normalize(value) !== normalize(english)
      ? value.replace(/\S[\s\S]*\S|\S/, english)
      : value;
  }

  function translateText(node) {
    if (!node.parentElement || node.parentElement.closest(excluded) || !node.data.trim()) return;
    const source = sourceFor(node.data, textSources.get(node));
    const translated = render(source);
    textSources.set(node, { source, rendered: translated });
    if (node.data !== translated) node.data = translated;
  }

  function translateAttributes(element) {
    if (element.closest(excluded)) return;
    const saved = attributeSources.get(element) || {};
    for (const name of attributes) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name);
      const source = sourceFor(value, saved[name]);
      const translated = render(source);
      saved[name] = { source, rendered: translated };
      if (value !== translated) element.setAttribute(name, translated);
    }
    attributeSources.set(element, saved);
  }

  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeType === Node.ELEMENT_NODE && node.matches(excluded)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) translateText(walker.currentNode);
      else translateAttributes(walker.currentNode);
    }
  }

  function setLanguage(next, persist = true) {
    language = next === 'tl' ? 'tl' : 'en';
    if (persist) { try { localStorage.setItem(storageKey, language); } catch (_) {} }
    document.documentElement.lang = language;
    document.getElementById('siteLanguageCode').textContent = language === 'tl' ? 'TL' : 'EN';
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    document.getElementById('translationPromptTitle').textContent = language === 'tl' ? 'Isalin ang pahina?' : 'Translate this page?';
    translateTree(document.documentElement);
    document.dispatchEvent(new CustomEvent('site:languagechange', { detail: { language } }));
  }

  const menu = document.getElementById('siteLanguageMenu');
  const trigger = document.getElementById('siteLanguageTrigger');
  const popup = document.getElementById('siteTranslatePopup');
  function positionMenu() {
    if (document.body.classList.contains('sim-page')) return;
    if (popup.hidden) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) {
      closePopup();
      return;
    }
    const left = Math.max(12, Math.min(rect.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 12));
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, Math.min(rect.bottom + 8, innerHeight - popup.offsetHeight - 12)))}px`;
  }
  function showPopup() {
    popup.hidden = false;
    positionMenu();
    trigger.setAttribute('aria-expanded', 'true');
  }
  function closePopup(restoreFocus = false) {
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  trigger.addEventListener('click', () => { if (popup.hidden) showPopup(); else closePopup(); });
  document.getElementById('translationPromptClose').addEventListener('click', () => closePopup(true));
  popup.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
    setLanguage(button.dataset.language);
    closePopup(true);
  }));
  document.addEventListener('pointerdown', event => {
    if (!popup.hidden && !menu.contains(event.target) && !popup.contains(event.target)) closePopup();
  });
  document.addEventListener('keydown', event => {
    if (!event.defaultPrevented && event.key === 'Escape' && !popup.hidden) { event.preventDefault(); closePopup(true); }
  });
  window.addEventListener('storage', event => { if (event.key === storageKey) setLanguage(event.newValue, false); });
  window.agnasI18n = { t: render, setLanguage, getLanguage: () => language };
  setLanguage(language, false);
  positionMenu();
  window.addEventListener('resize', positionMenu, { passive: true });
  window.addEventListener('scroll', () => { if (!popup.hidden) positionMenu(); }, { passive: true });
  document.fonts?.ready?.then(positionMenu);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved !== language) setLanguage(saved, false);
    } catch (_) {}
  });

  // Observe only copy changes. Canvas frames, scrolling, style changes,
  // and hazard animation attributes never run the translation walker.
  const observer = new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(node => changed.add(node));
      else if (record.type === 'attributes') translateAttributes(record.target);
      else changed.add(record.target);
    }
    // Do not observe our own text writes. Avoid walking the same subtree
    // repeatedly when a result creates many nested nodes at once.
    observer.disconnect();
    changed.forEach(node => {
      if (!node.isConnected) return;
      for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (changed.has(parent)) return;
      }
      translateTree(node);
    });
    observeCopy();
  });
  function observeCopy() {
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
  observeCopy();
})();
