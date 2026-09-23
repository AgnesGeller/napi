(() => {
  "use strict";

  const DATA_FILE_NAME = "diszkertek-napi-adatok.json";
  const LOCAL_DATA_KEY = "diszkertek-napi-adatok-v1";
  const RECOVERY_KEY = "diszkertek-napi-helyreallitas-v1";
  const DB_NAME = "diszkertek-napi-mappakapcsolat";
  const DB_STORE = "handles";
  const INSTALLED_KEY = "diszkertek-napi-installed-v1";
  const PENDING_DELETIONS_KEY = "diszkertek-napi-fuggo-torlesek-v1";
  const FINAL_NOTE = "A nap végén mindenki vegye ki a szemetét az autóból és hagyjon rendet maga után!";
  const DEFAULT_MEETING = "telephely, 6:30";
  const DEFAULT_STOPS = "Vizeshűtő, Lidl, Dohánybolt";
  const INTENSITY_DESCRIPTIONS = {
    1: "Lassú tempó – kényelmesebb munkavégzés, több pihenőidővel.",
    2: "Kímélő tempó – folyamatos, de nyugodt munkavégzés, sietség nélkül.",
    3: "Normál tempó – átlagos, megszokott, folyamatos és egyenletes haladás.",
    4: "Fokozott tempó – lendületes munkavégzés, kevés pihenővel és nagyobb koncentrációval.",
    5: "Maximális tempó – nagyon gyors, koncentrált munkavégzés; a mielőbbi befejezés kiemelt."
  };
  const QUALITY_DESCRIPTIONS = {
    1: "Minimális kivitelezési szint – a feladat legyen elvégezve; a részletek nem elsődlegesek.",
    2: "Alap kivitelezési szint – rendezett összkép, apró pontatlanságok elfogadhatók.",
    3: "Normál minőség – a megszokott szakmai színvonalon, rendezetten kell dolgozni.",
    4: "Igényes kivitelezés – fokozott figyelem a részletekre, szélekre és befejezésekre.",
    5: "Prémium kivitelezés – maximális precizitás; minden részlet legyen pontos és kifogástalan."
  };
  const $ = selector => document.querySelector(selector);
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const isoToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const escapeHTML = value => String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  const searchKey = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU").trim();
  const readableError = error => error?.name === "AbortError" ? "A művelet megszakadt." : (error?.message || "Váratlan hiba történt.");

  const workerSeeds = [
    ["Márk", "#22577a", false], ["Gábor", "#8a4f14", false], ["Attila", "#7a3e65", false],
    ["Gyula", "#356859", false], ["Bendegúz", "#795548", false], ["Ádám", "#5d4e9b", false], ["Tamás", "#9a342b", true]
  ];
  const workerPalette = ["#22577a", "#8a4f14", "#7a3e65", "#356859", "#795548", "#5d4e9b", "#9a342b", "#2f6944", "#c05a24", "#56636b"];
  const toolSeeds = ["hosszúláncos", "sövénynyíró", "kisláncos", "hosszúfűrész", "damilos", "kék villa", "big bag zsák", "fűhenger", "talicska", "gereblye", "lapát", "ásó"];
  const materialSeeds = [
    ["Termőföld", "", "m³"], ["Támfalkő", "", "db"], ["Vasgálic", "", "g"], ["Magellan", "", "kupak"],
    ["Amalgerol", "", "ml"], ["Amistar", "", "ml"], ["Cemix gyorskötő beton", "", "zsák"], ["2–5-ös andezit", "", "m³"]
  ];

  function createInitialData() {
    const workers = workerSeeds.map(([name, color, manager], index) => ({ id: uid(), name, color, manager, active: true, order: index }));
    const vehicles = ["Platós", "Dobozos", "Merci", "Opel"].map((name, index) => ({ id: uid(), name, active: true, order: index }));
    const tools = toolSeeds.map((name, index) => ({ id: uid(), name, active: true, order: index }));
    const materials = materialSeeds.map(([name, source, unit], index) => ({ id: uid(), name, source, unit, active: true, order: index }));
    const toolId = name => tools.find(tool => tool.name === name)?.id;
    const templates = [
      {
        id: uid(), name: "Kertkarbantartás", active: true, toolIds: [], materials: [],
        steps: ["Munkanaplót megírni."], order: 0
      },
      {
        id: uid(), name: "Favágás és zöldhulladék", active: true,
        toolIds: ["hosszúláncos", "kisláncos", "hosszúfűrész", "kék villa", "big bag zsák"].map(toolId).filter(Boolean),
        materials: [], steps: ["Favágás elvégzése.", "A zöldhulladék összegyűjtése.", "Munkanapló megírása."], order: 1
      },
      {
        id: uid(), name: "Füvesítés és támfalépítés", active: true,
        toolIds: ["fűhenger", "talicska", "gereblye", "lapát", "ásó"].map(toolId).filter(Boolean),
        materials: [{ source: "", name: "Termőföld", quantity: "", unit: "m³" }, { source: "", name: "Támfalkő", quantity: "", unit: "db" }],
        steps: ["A terület előkészítése.", "A füvesítés és támfalépítés elvégzése.", "A terület rendbetétele.", "Munkanapló megírása."], order: 2
      },
      {
        id: uid(), name: "Vakondháló terítése", active: true,
        toolIds: ["gereblye", "lapát", "fűhenger"].map(toolId).filter(Boolean), materials: [],
        steps: ["A vakondháló kifeszítése és leszúróval rögzítése.", "A termőföld szintre húzása és hengerezése.", "Munkanapló megírása."], order: 3
      },
      {
        id: uid(), name: "Indulás előtti feladatok", active: true, toolIds: [], materials: [],
        steps: ["Rendrakás.", "Anyagok feltöltése.", "Üzemanyagok és olajok feltöltése.", "Zöldhulladék rendezése.", "Zsákok kiürítése.", "Szerszámok ellenőrzése.", "Szervizelendő gépek elkülönítése."], order: 4
      },
      {
        id: uid(), name: "Aknaépítés", active: true, toolIds: [], materials: [],
        steps: ["Aknaépítés folytatása.", "Munkanapló megírása."], order: 5
      },
      {
        id: uid(), name: "Talajpermetezés – 4 in 1", active: true, toolIds: [],
        materials: [
          { source: "", name: "Vasgálic", quantity: "150", unit: "g / 15 l víz" },
          { source: "", name: "Magellan", quantity: "1", unit: "kupak / 15 l víz" },
          { source: "", name: "Amalgerol", quantity: "150", unit: "ml / 15 l víz" },
          { source: "", name: "Amistar", quantity: "15", unit: "ml / 15 l víz" }
        ],
        steps: ["Ha a gyomirtós permetezővel dolgoztok, előtte a tartályt és a pisztolyt is alaposan ki kell öblíteni.", "A keverék elkészítése a megadott arányban.", "Talajpermetezés elvégzése."], order: 6
      },
      {
        id: uid(), name: "Kertépítés", active: true, toolIds: [], materials: [],
        steps: ["A helyszínen egyeztetett kertépítési feladatok elvégzése.", "Munkanaplót megírni."], order: 7
      },
      {
        id: uid(), name: "Földmunka", active: true, toolIds: ["talicska", "gereblye", "lapát", "ásó"].map(toolId).filter(Boolean), materials: [],
        steps: ["A föld elgereblyézése és szintre húzása.", "A munkaterület rendezése.", "Munkanaplót megírni."], order: 8
      },
      {
        id: uid(), name: "Betonozás", active: true, toolIds: [], materials: [],
        steps: ["Betonozási munkák elvégzése.", "Munkanaplót megírni."], order: 9
      },
      {
        id: uid(), name: "Gumipálya építés", active: true, toolIds: [], materials: [],
        steps: ["A gumipálya építése és igazítása.", "A munkaterület rendezése.", "Munkanaplót megírni."], order: 10
      },
      {
        id: uid(), name: "Villanyszerelés", active: true, toolIds: ["ásó"].map(toolId).filter(Boolean), materials: [],
        steps: ["A T-elágazások ellenőrzése és felszerelése.", "A gégecső megfelelő mélységbe helyezése.", "Munkanaplót megírni."], order: 11
      },
      {
        id: uid(), name: "Szegélyépítés", active: true, toolIds: ["talicska", "lapát", "ásó"].map(toolId).filter(Boolean), materials: [],
        steps: ["A szegély beállítása és építésének folytatása.", "Munkanaplót megírni."], order: 12
      },
      {
        id: uid(), name: "Rendrakás és szállítás", active: true, toolIds: ["kék villa", "big bag zsák"].map(toolId).filter(Boolean), materials: [],
        steps: ["Rendrakás a telephelyen és az autókban.", "A hulladék és a szükséges anyagok elszállítása.", "Munkanaplót megírni."], order: 13
      }
    ];
    templates.forEach(template => { template.steps = (template.steps || []).filter(step => !searchKey(step).includes("munkanaplo")); });
    return { version: 4, updatedAt: new Date().toISOString(), workers, vehicles, tools, materials, templates, customers: [], recurrences: [], plans: [] };
  }

  let data = createInitialData();
  let workingPlan = blankPlan(isoToday());
  let directoryHandle = null;
  let dirty = false;
  let activeSettingsTab = "workers";
  let editingSettingsId = null;
  let pendingCustomerTaskId = null;
  let weekAnchor = isoToday();
  let monthAnchor = isoToday().slice(0, 7);
  let installPrompt = null;
  let allowPageReload = false;
  let activeTaskId = null;
  let collapsedTaskIds = new Set();
  const cachedCustomerDirectory = window.NapiCustomerDirectory?.cached?.() || { directory: [], savedAt: null };
  let customerDirectory = cachedCustomerDirectory.directory;
  let customerDirectoryState = customerDirectory.length ? "cache" : "disconnected";
  let customerDirectoryLastSync = cachedCustomerDirectory.savedAt;
  let customerDirectorySyncing = false;
  let cloudSyncTimer = null;
  let printRenderTimer = null;
  let cloudSyncing = false;
  let cloudWritePromise = Promise.resolve();
  let cloudConfigDirty = false;
  let lastCloudConfigUpdatedAt = "";
  const pendingCloudPlanDates = new Set();
  let storedPendingDeletions = [];
  try { storedPendingDeletions = JSON.parse(localStorage.getItem(PENDING_DELETIONS_KEY)) || []; } catch (_) { /* Üres listával folytatjuk. */ }
  const pendingCloudDeletedDates = new Set(Array.isArray(storedPendingDeletions) ? storedPendingDeletions : []);

  function blankTask() {
    const id = uid();
    return { id, teamId: id, customerId: null, locationId: null, customerName: "", address: "", startTime: "", workerIds: [], vehicleIds: [], jobs: [], toolIds: [], toolQuantities: {}, extraTools: "", materials: [], workLogRequired: true, workIntensity: 3, workQuality: 3, notes: "" };
  }
  function blankPlan(date) { return { id: uid(), date, meeting: DEFAULT_MEETING, stops: DEFAULT_STOPS, tasks: [] }; }
  function normalizeData(candidate) {
    if (!candidate || typeof candidate !== "object") throw new Error("Az adatfájl nem megfelelő formátumú.");
    const initial = createInitialData();
    const templates = Array.isArray(candidate.templates) ? candidate.templates.map(template => {
      let steps = Array.isArray(template.steps) ? template.steps.filter(step => !searchKey(step).includes("munkanaplo")) : [];
      if (searchKey(template.name) === "kertkarbantartas") steps = steps.filter(step => searchKey(step) !== "kertkarbantartas elvegzese.");
      const templateMaterials = Array.isArray(template.materials) ? template.materials.map(normalizeMaterialItem) : [];
      return { ...template, materials: templateMaterials, steps };
    }) : initial.templates;
    initial.templates.forEach(seed => {
      if (!templates.some(template => searchKey(template.name) === searchKey(seed.name))) templates.push(deepCopy(seed));
    });
    const normalizeTask = task => {
      const existingJobs = Array.isArray(task.jobs) ? task.jobs : [];
      const legacyTemplate = task.templateId ? templates.find(template => template.id === task.templateId) : null;
      const jobs = existingJobs.length ? existingJobs.map((job, index) => ({
        id: job.id || `${task.id || "task"}-job-${index}`,
        templateId: job.templateId || null,
        name: String(job.name || "Feladat").trim(),
        steps: Array.isArray(job.steps) ? job.steps.filter(step => !searchKey(step).includes("munkanaplo")) : []
      })) : (task.templateId || task.title || task.steps?.length ? [{
        id: `${task.id || "task"}-legacy-job`,
        templateId: task.templateId || null,
        name: String(task.title || legacyTemplate?.name || "Feladat").trim(),
        steps: (Array.isArray(task.steps) ? task.steps : deepCopy(legacyTemplate?.steps || [])).filter(step => !searchKey(step).includes("munkanaplo"))
      }] : []);
      const { templateId: _legacyTemplateId, title: _legacyTitle, steps: _legacySteps, ...currentTask } = task;
      const toolIds = Array.isArray(task.toolIds) ? task.toolIds : [];
      const toolQuantities = task.toolQuantities && typeof task.toolQuantities === "object" ? { ...task.toolQuantities } : {};
      toolIds.forEach(id => { if (!toolQuantities[id]) toolQuantities[id] = "1"; });
      return { ...currentTask, teamId: task.teamId || task.id || uid(), customerName: String(task.customerName || ""), address: String(task.address || ""), locationId: task.locationId || null, startTime: String(task.startTime || ""), workerIds: Array.isArray(task.workerIds) ? task.workerIds : [], vehicleIds: Array.isArray(task.vehicleIds) ? task.vehicleIds : [], jobs, toolIds, toolQuantities, extraTools: String(task.extraTools || ""), materials: Array.isArray(task.materials) ? task.materials.map(normalizeMaterialItem) : [], workLogRequired: task.workLogRequired !== false, workIntensity: validRating(task.workIntensity), workQuality: validRating(task.workQuality), notes: String(task.notes || "") };
    };
    return {
      version: 4,
      updatedAt: candidate.updatedAt || new Date().toISOString(),
      workers: Array.isArray(candidate.workers) ? candidate.workers : initial.workers,
      vehicles: Array.isArray(candidate.vehicles) ? candidate.vehicles : initial.vehicles,
      tools: Array.isArray(candidate.tools) ? candidate.tools : initial.tools,
      materials: Array.isArray(candidate.materials) ? candidate.materials.map((item, index) => typeof item === "string" ? { id: uid(), name: item, source: "", unit: "", active: true, order: index } : { ...item, source: String(item.source || ""), unit: String(item.unit || "") }) : initial.materials,
      templates,
      customers: Array.isArray(candidate.customers) ? candidate.customers : [],
      recurrences: Array.isArray(candidate.recurrences) ? candidate.recurrences : [],
      plans: Array.isArray(candidate.plans) ? candidate.plans.map(plan => ({
        ...plan,
        meeting: typeof plan.meeting === "string" ? plan.meeting : DEFAULT_MEETING,
        stops: typeof plan.stops === "string" ? plan.stops : DEFAULT_STOPS,
        tasks: Array.isArray(plan.tasks) ? plan.tasks.map(normalizeTask) : []
      })) : []
    };
  }
  function normalizeMaterialItem(item = {}) {
    return { materialId: item.materialId || null, source: String(item.source || item.purchaseLocation || item.address || ""), name: String(item.name || ""), quantity: String(item.quantity || ""), unit: String(item.unit || "") };
  }
  function validRating(value) { const number = Number(value); return number >= 1 && number <= 5 ? number : 3; }
  function dateFromISO(value) { return new Date(`${value}T12:00:00`); }
  function formatDate(value, options = { year: "numeric", month: "long", day: "numeric", weekday: "long" }) {
    return new Intl.DateTimeFormat("hu-HU", options).format(dateFromISO(value));
  }
  function dateOffset(value, days) {
    const date = dateFromISO(value); date.setDate(date.getDate() + days);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function startOfWeek(value) {
    const date = dateFromISO(value); const daysSinceFriday = (date.getDay() - 5 + 7) % 7; date.setDate(date.getDate() - daysSinceFriday);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function monthOffset(value, offset) {
    const [year, month] = value.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function hungarianHoliday(dateValue) {
    const year = Number(dateValue.slice(0, 4)); const easter = easterSunday(year);
    const holidays = new Map([
      [`${year}-01-01`, "Újév"], [`${year}-03-15`, "Nemzeti ünnep"], [dateOffset(easter, -2), "Nagypéntek"],
      [dateOffset(easter, 1), "Húsvéthétfő"], [`${year}-05-01`, "A munka ünnepe"], [dateOffset(easter, 50), "Pünkösdhétfő"],
      [`${year}-08-20`, "Államalapítás ünnepe"], [`${year}-10-23`, "Nemzeti ünnep"], [`${year}-11-01`, "Mindenszentek"],
      [`${year}-12-25`, "Karácsony"], [`${year}-12-26`, "Karácsony másnapja"]
    ]);
    return holidays.get(dateValue) || "";
  }
  function activeSorted(collection) { return collection.filter(item => item.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "hu")); }
  function byId(collection, id) { return collection.find(item => item.id === id); }
  function timestampValue(value) { const parsed = Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : 0; }
  function sharedConfigPayload() {
    return { version: data.version, workers: data.workers, vehicles: data.vehicles, tools: data.tools, materials: data.materials, templates: data.templates, customers: data.customers, recurrences: data.recurrences };
  }
  function remapIds(ids, oldItems, newItems) {
    return (ids || []).map(id => {
      if (newItems.some(item => item.id === id)) return id;
      const oldName = oldItems.find(item => item.id === id)?.name;
      return newItems.find(item => searchKey(item.name) === searchKey(oldName))?.id;
    }).filter(Boolean);
  }
  function remapPlanReferences(plan, previous) {
    (plan.tasks || []).forEach(task => {
      task.workerIds = remapIds(task.workerIds, previous.workers, data.workers);
      task.vehicleIds = remapIds(task.vehicleIds, previous.vehicles, data.vehicles);
      const oldToolQuantities = { ...(task.toolQuantities || {}) }; const oldToolIds = [...(task.toolIds || [])];
      task.toolIds = remapIds(oldToolIds, previous.tools, data.tools); task.toolQuantities = {};
      oldToolIds.forEach(oldId => {
        const oldName = previous.tools.find(item => item.id === oldId)?.name; const newId = data.tools.find(item => searchKey(item.name) === searchKey(oldName))?.id;
        if (newId) task.toolQuantities[newId] = oldToolQuantities[oldId] || "1";
      });
      (task.jobs || []).forEach(job => {
        if (!job.templateId || data.templates.some(item => item.id === job.templateId)) return;
        const oldName = previous.templates.find(item => item.id === job.templateId)?.name || job.name;
        job.templateId = data.templates.find(item => searchKey(item.name) === searchKey(oldName))?.id || null;
      });
    });
  }
  function applySharedConfig(payload) {
    if (!payload || typeof payload !== "object") return;
    const previous = { workers: data.workers, vehicles: data.vehicles, tools: data.tools, templates: data.templates };
    const normalized = normalizeData({ ...data, ...payload, plans: data.plans });
    data.workers = normalized.workers; data.vehicles = normalized.vehicles; data.tools = normalized.tools; data.materials = normalized.materials;
    data.templates = normalized.templates; data.customers = normalized.customers; data.recurrences = normalized.recurrences;
    data.plans.forEach(plan => remapPlanReferences(plan, previous)); remapPlanReferences(workingPlan, previous);
  }
  function normalizedRemotePlan(payload) {
    return normalizeData({ ...data, plans: [payload] }).plans[0];
  }
  async function pullSharedData({ initial = false, throwOnError = false } = {}) {
    if (cloudSyncing || !navigator.onLine || !window.NapiCloudSync || !window.NapiCustomerDirectory?.hasSession?.()) return false;
    cloudSyncing = true;
    try {
      const remote = await window.NapiCloudSync.pull();
      let dataChanged = false;
      if (remote.config && !cloudConfigDirty && timestampValue(remote.config.updated_at) > timestampValue(lastCloudConfigUpdatedAt)) {
        applySharedConfig(remote.config.payload);
        lastCloudConfigUpdatedAt = remote.config.updated_at || "";
        dataChanged = true;
      }
      else if (initial && !remote.config) await window.NapiCloudSync.pushConfig(sharedConfigPayload());
      const remoteDates = new Set(); let currentChanged = false; let currentDeleted = false;
      remote.plans.forEach(row => {
        if (row.payload?.deleted) {
          remoteDates.add(row.plan_date);
          const index = data.plans.findIndex(item => item.date === row.plan_date);
          if (index >= 0) { data.plans.splice(index, 1); dataChanged = true; }
          pendingCloudPlanDates.delete(row.plan_date);
          if (row.plan_date === workingPlan.date) {
            localStorage.removeItem(RECOVERY_KEY);
            dirty = false;
            currentChanged = true;
            currentDeleted = true;
          }
          return;
        }
        const plan = normalizedRemotePlan(row.payload); if (!plan?.date) return;
        remoteDates.add(plan.date); plan.updatedAt = row.updated_at || plan.updatedAt;
        const index = data.plans.findIndex(item => item.date === plan.date); const local = data.plans[index];
        if (!local || timestampValue(row.updated_at) > timestampValue(local.updatedAt)) {
          if (index >= 0) data.plans[index] = plan; else data.plans.push(plan);
          dataChanged = true;
          if (plan.date === workingPlan.date && !dirty) currentChanged = true;
        }
      });
      if (initial) {
        const missingPlans = data.plans.filter(plan => !remoteDates.has(plan.date));
        for (const plan of missingPlans) await window.NapiCloudSync.pushPlan(plan);
      }
      data.plans.sort((a, b) => b.date.localeCompare(a.date)); localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
      const taskEditorActive = Boolean(document.activeElement?.closest?.("#taskList .task-card"));
      if (currentDeleted || (currentChanged && !taskEditorActive)) loadPlan(workingPlan.date);
      else if (dataChanged) { if (!dirty && !taskEditorActive) renderTasks(); renderWeek(); renderMonth(); }
      return true;
    } catch (error) {
      console.warn("A háttérszinkron most nem érhető el.", error);
      if (throwOnError) throw error;
      return false;
    }
    finally { cloudSyncing = false; }
  }
  async function pushCurrentState({ throwOnError = false } = {}) {
    if (!navigator.onLine || !window.NapiCloudSync || !window.NapiCustomerDirectory?.hasSession?.()) return false;
    try {
      const write = async () => {
        const hasPlanContent = workingPlan.tasks.length || workingPlan.meeting !== DEFAULT_MEETING || workingPlan.stops !== DEFAULT_STOPS;
        if (hasPlanContent && dirty && !pendingCloudDeletedDates.has(workingPlan.date)) { upsertWorkingPlan(); pendingCloudPlanDates.add(workingPlan.date); }
        data.updatedAt = new Date().toISOString(); localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
        for (const date of [...pendingCloudPlanDates]) {
          if (pendingCloudDeletedDates.has(date)) { pendingCloudPlanDates.delete(date); continue; }
          const plan = data.plans.find(item => item.date === date);
          if (plan) await window.NapiCloudSync.pushPlan(plan);
          pendingCloudPlanDates.delete(date);
        }
        if (pendingCloudDeletedDates.size) {
          const deletedDates = [...pendingCloudDeletedDates];
          await window.NapiCloudSync.deletePlans(deletedDates);
          deletedDates.forEach(date => pendingCloudDeletedDates.delete(date));
          if (pendingCloudDeletedDates.size) localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify([...pendingCloudDeletedDates]));
          else localStorage.removeItem(PENDING_DELETIONS_KEY);
        }
        if (cloudConfigDirty) { await window.NapiCloudSync.pushConfig(sharedConfigPayload()); cloudConfigDirty = false; }
      };
      const queuedWrite = cloudWritePromise.catch(() => {}).then(write);
      cloudWritePromise = queuedWrite;
      await queuedWrite;
      return true;
    } catch (error) {
      console.warn("A háttérszinkron most nem érhető el.", error);
      if (throwOnError) throw error;
      return false;
    }
  }
  function queueCloudSync(delay = 1200) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => pushCurrentState(), delay);
  }
  function syncDeletedDates(dates) {
    dates.forEach(date => { pendingCloudDeletedDates.add(date); pendingCloudPlanDates.delete(date); });
    localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify([...pendingCloudDeletedDates]));
    clearTimeout(cloudSyncTimer);
    return pushCurrentState();
  }

  function markDirty(message = "Mentetlen módosítás") {
    dirty = true;
    workingPlan.updatedAt = new Date().toISOString();
    const hasPlanContent = workingPlan.tasks.length || workingPlan.meeting !== DEFAULT_MEETING || workingPlan.stops !== DEFAULT_STOPS;
    if (hasPlanContent) upsertWorkingPlan();
    else data.plans = data.plans.filter(plan => plan.date !== workingPlan.date);
    data.updatedAt = workingPlan.updatedAt;
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    $("#saveState").textContent = message;
    try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data, workingPlan })); } catch (_) { /* A mappamentés ettől még használható. */ }
    clearTimeout(printRenderTimer);
    printRenderTimer = setTimeout(renderPrintView, 180);
    queueCloudSync();
  }
  function markSaved() {
    dirty = false;
    $("#saveState").textContent = `Elmentve • ${new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`;
    try { localStorage.removeItem(RECOVERY_KEY); } catch (_) { /* Nincs teendő. */ }
  }
  function saveDataLocally() {
    upsertWorkingPlan();
    pendingCloudPlanDates.add(workingPlan.date);
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
  }
  function setDockOpen(open) {
    const dock = document.querySelector(".action-dock"); const button = $("#dockToggleButton");
    dock.classList.toggle("is-open", open); document.body.classList.toggle("actions-open", open);
    button.setAttribute("aria-expanded", String(open)); button.textContent = open ? "Bezárás ×" : "Műveletek";
  }
  $("#dockToggleButton").addEventListener("click", () => setDockOpen(!document.querySelector(".action-dock").classList.contains("is-open")));
  document.querySelector(".dock-buttons").addEventListener("click", () => { if (window.matchMedia("(max-width: 760px)").matches) setDockOpen(false); });
  window.matchMedia("(min-width: 761px)").addEventListener?.("change", event => { if (event.matches) setDockOpen(false); });
  function toast(message, error = false) {
    const element = document.createElement("div");
    element.className = `app-toast${error ? " error" : ""}`;
    element.textContent = message;
    $("#toastRegion").append(element);
    setTimeout(() => element.remove(), 4200);
  }

  function openHandleDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function storeDirectoryHandle(handle) {
    const database = await openHandleDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(handle, "directory");
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }
  async function readStoredDirectoryHandle() {
    const database = await openHandleDatabase();
    const handle = await new Promise((resolve, reject) => {
      const request = database.transaction(DB_STORE).objectStore(DB_STORE).get("directory");
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    database.close(); return handle;
  }
  async function hasWritePermission(handle, request = false) {
    const options = { mode: "readwrite" };
    if ((await handle.queryPermission(options)) === "granted") return true;
    return request && (await handle.requestPermission(options)) === "granted";
  }
  async function readDataFile(handle) {
    const fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: true });
    const file = await fileHandle.getFile();
    if (!file.size) return null;
    return normalizeData(JSON.parse(await file.text()));
  }
  async function writeDataFile() {
    if (!directoryHandle || !(await hasWritePermission(directoryHandle, true))) {
      if (!("showDirectoryPicker" in window)) $("#fileFallbackDialog").showModal();
      else toast("Előbb válaszd ki a mentési mappát.", true);
      return false;
    }
    saveDataLocally();
    $("#saveState").textContent = "Mentés…";
    const fileHandle = await directoryHandle.getFileHandle(DATA_FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    markSaved();
    return true;
  }
  async function saveCurrentPlan() {
    saveDataLocally();
    markSaved();
    const cloudSaved = await pushCurrentState();
    collapsedTaskIds = new Set(workingPlan.tasks.map(task => task.id)); activeTaskId = null; renderTasks(); renderWeek(); renderMonth();
    toast(cloudSaved ? "A napi terv elmentve és minden eszközzel szinkronizálva." : "A napi terv elmentve ezen az eszközön. A közös szinkron internetkapcsolatkor automatikusan folytatódik.");
    return true;
  }
  async function chooseFolder() {
    if (!("showDirectoryPicker" in window)) { $("#fileFallbackDialog").showModal(); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "diszkertek-napi-adatok" });
      if (!(await hasWritePermission(handle, true))) throw new Error("A mappa írásához engedély szükséges.");
      const loaded = await readDataFile(handle);
      if (loaded && dirty && !confirm("A kiválasztott mappa adatfájlja felülírja a mostani, mentetlen tervet. Folytatod?")) return;
      directoryHandle = handle;
      await storeDirectoryHandle(handle);
      if (loaded) data = loaded;
      else await writeDataFile();
      updateStorageStatus();
      loadPlan($("#planDate").value || isoToday());
      toast(loaded ? "Az adatfájl betöltődött." : "A mentési mappa elkészült.");
    } catch (error) {
      if (error?.name !== "AbortError") toast(readableError(error), true);
    }
  }
  function updateStorageStatus() {
    if (directoryHandle) {
      $("#folderButton").textContent = "📁 Biztonsági mappa cseréje";
      $("#folderButton").title = `Mentési mappa: ${directoryHandle.name}`;
    } else {
      $("#folderButton").textContent = "📁 Biztonsági adatmappa";
      $("#folderButton").title = "Külön biztonsági másolat mappájának kiválasztása";
    }
  }
  async function waitForCurrentCloudSync() {
    for (let attempt = 0; cloudSyncing && attempt < 40; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  async function refreshApplication() {
    const button = $("#refreshButton");
    button.disabled = true; button.textContent = "⟳ Frissítés…";
    try {
      if (!navigator.onLine) throw new Error("Nincs internetkapcsolat. Kapcsolódj az internethez, majd próbáld újra.");
      if (window.NapiCustomerDirectory?.hasSession?.()) {
        await syncCustomerDirectory();
        await waitForCurrentCloudSync();
        await pullSharedData({ initial: true, throwOnError: true });
        if (dirty) {
          saveDataLocally();
          await pushCurrentState({ throwOnError: true });
          markSaved();
        }
      }
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.update();
      }
      allowPageReload = true;
      window.location.reload();
    } catch (error) {
      button.disabled = false; button.textContent = "⟳ Frissítés";
      toast(`A frissítés nem sikerült: ${readableError(error)}`, true);
    }
  }
  function downloadData() {
    upsertWorkingPlan();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = DATA_FILE_NAME; link.click(); URL.revokeObjectURL(link.href);
    markSaved(); toast("Az adatfájl letöltődött.");
  }
  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  }
  function exportPeriod(period) {
    upsertWorkingPlan();
    const reference = workingPlan.date;
    let plans = data.plans;
    let suffix = "teljes";
    if (period === "week") {
      const from = startOfWeek(reference); const to = dateOffset(from, 6);
      plans = plans.filter(plan => plan.date >= from && plan.date <= to); suffix = `het-${from}`;
    } else if (period === "month") {
      const month = reference.slice(0, 7); plans = plans.filter(plan => plan.date.startsWith(month)); suffix = `honap-${month}`;
    } else if (period === "year") {
      const year = reference.slice(0, 4); plans = plans.filter(plan => plan.date.startsWith(year)); suffix = `ev-${year}`;
    }
    const payload = { ...deepCopy(data), exportType: period, exportedAt: new Date().toISOString(), plans: deepCopy(plans) };
    downloadJSON(payload, `diszkertek-napi-${suffix}.json`);
    toast(`${period === "week" ? "A heti" : period === "month" ? "A havi" : period === "year" ? "Az éves" : "A teljes"} adatfájl letöltődött.`);
  }
  function planMatchesPeriod(plan, period, reference) {
    if (period === "week") { const from = startOfWeek(reference); return plan.date >= from && plan.date <= dateOffset(from, 6); }
    if (period === "month") return plan.date.startsWith(reference.slice(0, 7));
    if (period === "year") return plan.date.startsWith(reference.slice(0, 4));
    return true;
  }
  function deletePeriod(period) {
    const labels = { week: "kiválasztott hét", month: "kiválasztott hónap", year: "kiválasztott év", all: "összes napi terv" };
    const matching = data.plans.filter(plan => planMatchesPeriod(plan, period, workingPlan.date));
    if (!matching.length) { toast("Ebben az időszakban nincs törölhető napi terv."); return; }
    if (!confirm(`Biztosan törlöd a(z) ${labels[period]} terveit (${matching.length} nap)? A törlés előtt töltsd le az adatmentést.`)) return;
    const dates = new Set(matching.map(plan => plan.date)); data.plans = data.plans.filter(plan => !dates.has(plan.date));
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    syncDeletedDates([...dates]);
    if (dates.has(workingPlan.date)) { localStorage.removeItem(RECOVERY_KEY); dirty = false; loadPlan(workingPlan.date); }
    else { renderWeek(); renderMonth(); }
    toast(`${matching.length} napi terv törölve.`); $("#downloadsDialog").close();
  }
  async function importDataFile(file) {
    try {
      const imported = JSON.parse(await file.text());
      if (dirty && !confirm("A megnyitott adatfájl módosítja a mostani adatokat. Folytatod?")) return;
      if (imported.exportType && imported.exportType !== "all") {
        const incoming = normalizeData(imported); const mergedPlans = new Map(data.plans.map(plan => [plan.date, plan]));
        incoming.plans.forEach(plan => mergedPlans.set(plan.date, plan)); data.plans = [...mergedPlans.values()].sort((a, b) => b.date.localeCompare(a.date));
      } else data = normalizeData(imported);
      loadPlan($("#planDate").value || isoToday());
      markSaved(); toast("Az adatfájl megnyílt."); $("#fileFallbackDialog").close();
    } catch (error) { toast(`Az adatfájl nem nyitható meg: ${readableError(error)}`, true); }
  }

  function upsertWorkingPlan() {
    workingPlan.updatedAt = new Date().toISOString();
    const index = data.plans.findIndex(plan => plan.date === workingPlan.date);
    const clean = deepCopy(workingPlan);
    if (index >= 0) data.plans[index] = clean; else data.plans.push(clean);
    data.plans.sort((a, b) => b.date.localeCompare(a.date));
  }
  function materializeRecurrence(recurrence) {
    const frequency = recurrence.frequency || "weekly";
    const dates = [];
    if (frequency === "custom") dates.push(...(recurrence.customDates || []).filter(date => date >= recurrence.startDate && date <= recurrence.endDate));
    else if (frequency === "monthly") {
      let cursor = `${recurrence.startDate.slice(0, 7)}-01`; let guard = 0;
      while (cursor <= recurrence.endDate && guard < 36) {
        const [year, month] = cursor.split("-").map(Number); const lastDay = new Date(year, month, 0).getDate();
        const date = `${cursor.slice(0, 7)}-${String(Math.min(Number(recurrence.monthDay || recurrence.startDate.slice(8, 10)), lastDay)).padStart(2, "0")}`;
        if (date >= recurrence.startDate && date <= recurrence.endDate) dates.push(date);
        cursor = new Date(year, month, 1); cursor = new Date(cursor.getTime() - cursor.getTimezoneOffset() * 60000).toISOString().slice(0, 10); guard += 1;
      }
    } else {
      let date = recurrence.startDate; let guard = 0;
      while (date <= recurrence.endDate && guard < 750) {
        const daysFromStart = Math.round((dateFromISO(date) - dateFromISO(recurrence.startDate)) / 86400000);
        const intervalWeeks = frequency === "biweekly" ? 2 : 1;
        if (dateFromISO(date).getDay() === Number(recurrence.weekday) && Math.floor(daysFromStart / 7) % intervalWeeks === 0) dates.push(date);
        date = dateOffset(date, 1); guard += 1;
      }
    }
    [...new Set(dates)].sort().forEach(date => {
      let plan = data.plans.find(item => item.date === date);
      if (!plan) { plan = blankPlan(date); data.plans.push(plan); }
      if (!plan.tasks.some(task => task.recurrenceId === recurrence.id)) {
        const task = blankTask(); task.recurrenceId = recurrence.id; task.customerName = recurrence.customerName; task.address = recurrence.address; task.startTime = recurrence.startTime || "";
        const template = recurrence.templateId ? byId(data.templates, recurrence.templateId) : null;
        task.jobs = [{ id: uid(), templateId: template?.id || null, name: recurrence.jobName, steps: deepCopy(template?.steps || []) }];
        task.toolIds = deepCopy(template?.toolIds || []); task.toolIds.forEach(id => { task.toolQuantities[id] = "1"; });
        task.materials = deepCopy(template?.materials || []); plan.tasks.push(task); plan.updatedAt = new Date().toISOString();
        if (date === workingPlan.date && !workingPlan.tasks.some(item => item.recurrenceId === recurrence.id)) workingPlan.tasks.push(deepCopy(task));
        pendingCloudPlanDates.add(date);
      }
    });
    data.plans.sort((a, b) => b.date.localeCompare(a.date));
  }
  function removeRecurrence(id) {
    data.recurrences = data.recurrences.filter(item => item.id !== id);
    workingPlan.tasks = workingPlan.tasks.filter(task => task.recurrenceId !== id);
    data.plans.forEach(plan => {
      if (!plan.tasks.some(task => task.recurrenceId === id)) return;
      plan.tasks = plan.tasks.filter(task => task.recurrenceId !== id); plan.updatedAt = new Date().toISOString();
      if (plan.tasks.length || plan.meeting !== DEFAULT_MEETING || plan.stops !== DEFAULT_STOPS) pendingCloudPlanDates.add(plan.date);
      else pendingCloudDeletedDates.add(plan.date);
    });
    data.plans = data.plans.filter(plan => plan.tasks.length || plan.meeting !== DEFAULT_MEETING || plan.stops !== DEFAULT_STOPS);
  }
  function loadPlan(date) {
    const stored = data.plans.find(plan => plan.date === date);
    workingPlan = stored ? deepCopy(stored) : blankPlan(date);
    activeTaskId = stored ? null : (workingPlan.tasks[0]?.id || null);
    collapsedTaskIds = new Set(stored ? workingPlan.tasks.map(task => task.id) : []);
    $("#planDate").value = date;
    $("#meetingInput").value = workingPlan.meeting ?? DEFAULT_MEETING;
    $("#stopsInput").value = workingPlan.stops ?? DEFAULT_STOPS;
    weekAnchor = date;
    monthAnchor = date.slice(0, 7);
    dirty = false;
    $("#saveState").textContent = stored ? "Betöltve • nincs mentetlen módosítás" : "Új napi terv";
    renderTasks();
    renderPrintView();
    if ($("#weekView").open) renderWeek();
    if ($("#monthView")?.open) renderMonth();
  }
  function changeDate(date) {
    if (dirty && !confirm("A dátumváltás elveti a még nem mentett módosításokat. Folytatod?")) { $("#planDate").value = workingPlan.date; return; }
    loadPlan(date);
  }

  function makeChip(label, pressed, className, attributes = {}) {
    const button = document.createElement("button"); button.type = "button"; button.className = `choice-chip ${className || ""}`.trim(); button.textContent = label; button.setAttribute("aria-pressed", String(Boolean(pressed)));
    button.title = pressed ? "Kattints újra a kijelölés levételéhez" : "Kattints a kiválasztáshoz";
    Object.entries(attributes).forEach(([key, value]) => { if (key === "style") button.setAttribute("style", value); else button.dataset[key] = value; });
    return button;
  }
  function renderMaterial(container, material, index) {
    const row = $("#materialTemplate").content.firstElementChild.cloneNode(true); row.dataset.materialIndex = index;
    row.classList.toggle("is-preset", Boolean(material.materialId));
    row.querySelector(".material-source").value = material.source || ""; row.querySelector(".material-name").value = material.name || ""; row.querySelector(".material-quantity").value = material.quantity || ""; row.querySelector(".material-unit").value = material.unit || "";
    if (material.materialId) [".material-name", ".material-unit"].forEach(selector => { row.querySelector(selector).readOnly = true; });
    container.append(row);
  }
  function tasksByTeam(plan = workingPlan) {
    const groups = [];
    plan.tasks.forEach(task => {
      const teamId = task.teamId || task.id;
      let group = groups.find(item => item.id === teamId);
      if (!group) { group = { id: teamId, tasks: [] }; groups.push(group); }
      group.tasks.push(task);
    });
    return groups;
  }
  function planHasTasks(plan) { return Boolean(plan && Array.isArray(plan.tasks) && plan.tasks.length); }
  function clientIndexInTeam(task) { return tasksByTeam().find(group => group.id === (task.teamId || task.id))?.tasks.indexOf(task) ?? 0; }
  function taskJobs(task) { return Array.isArray(task.jobs) ? task.jobs : []; }
  function selectedJobNames(task) { return taskJobs(task).map(job => job.name).filter(Boolean); }
  function cleanStep(value) { return String(value || "").trim().replace(/^\d+[.)]\s*/, ""); }
  function renderJobWorkflows(container, task) {
    const jobs = taskJobs(task);
    if (!jobs.length) {
      container.innerHTML = `<p class="empty-detail">Előbb válassz ki legalább egy feladatot.</p>`;
      return;
    }
    jobs.forEach(job => {
      const block = document.createElement("label");
      block.className = "job-workflow";
      block.innerHTML = `<span class="job-workflow-heading"><strong>${escapeHTML(job.name)}</strong><button class="btn btn-soft job-info-button" type="button" data-job-info="${escapeHTML(job.id)}">Hasznos tudnivalók</button></span><textarea class="form-control job-steps-input" data-job-id="${escapeHTML(job.id)}" rows="4" maxlength="3000" placeholder="Soronként egy teendő"></textarea>`;
      block.querySelector("textarea").value = (job.steps || []).join("\n");
      container.append(block);
    });
  }
  function renderTask(task, index, clientIndex, firstInTeam) {
    const card = $("#taskTemplate").content.firstElementChild.cloneNode(true); card.dataset.taskId = task.id;
    card.classList.toggle("is-active", task.id === activeTaskId); card.querySelector(".active-badge").hidden = task.id !== activeTaskId;
    card.classList.toggle("is-collapsed", collapsedTaskIds.has(task.id));
    applyTaskVehicleTheme(card, task);
    card.querySelector(".task-number").textContent = `${clientIndex + 1}.`;
    updateTaskSummary(card, task, clientIndex);
    const groupTasks = workingPlan.tasks.filter(item => (item.teamId || item.id) === (task.teamId || task.id));
    const teamIndex = groupTasks.indexOf(task);
    card.querySelector(".move-up").disabled = teamIndex === 0; card.querySelector(".move-down").disabled = teamIndex === groupTasks.length - 1;
    card.querySelector(".customer-input").value = task.customerName || ""; card.querySelector(".address-input").value = task.address || "";
    card.querySelector(".start-time-input").value = task.startTime || "";
    card.querySelector(".extra-tools-input").value = task.extraTools || ""; card.querySelector(".notes-input").value = task.notes || "";
    card.querySelector(".worklog-required").checked = task.workLogRequired !== false;
    const workerContainer = card.querySelector(".worker-chips");
    activeSorted(data.workers).forEach(worker => workerContainer.append(makeChip(worker.name, task.workerIds.includes(worker.id), "worker-chip", { group: "worker", id: worker.id, style: `--worker-color:${worker.color};--chip-text:${bestTextColor(worker.color)}` })));
    const vehicleContainer = card.querySelector(".vehicle-chips");
    activeSorted(data.vehicles).forEach(vehicle => {
      const theme = vehicleTheme(vehicle);
      vehicleContainer.append(makeChip(vehicle.name, task.vehicleIds.includes(vehicle.id), "vehicle-chip", { group: "vehicle", id: vehicle.id, style: `--vehicle-color:${theme.background};--vehicle-accent:${theme.accent};--vehicle-chip-text:${theme.text}` }));
    });
    if (!firstInTeam) {
      card.querySelector(".vehicle-chips")?.closest(".task-step")?.remove();
      card.querySelector(".worker-chips")?.closest(".task-step")?.remove();
    }
    const templateContainer = card.querySelector(".template-chips");
    activeSorted(data.templates).forEach(template => templateContainer.append(makeChip(template.name, taskJobs(task).some(job => job.templateId === template.id), "", { templateId: template.id })));
    const jobCount = taskJobs(task).length; card.querySelector(".job-count").textContent = jobCount ? `${jobCount} kiválasztva` : "Nincs kiválasztva";
    const toolContainer = card.querySelector(".tool-chips");
    activeSorted(data.tools).forEach(tool => toolContainer.append(makeChip(tool.name, task.toolIds.includes(tool.id), "", { group: "tool", id: tool.id })));
    renderToolQuantities(card.querySelector(".tool-quantities"), task);
    const materialChipContainer = card.querySelector(".material-chips");
    activeSorted(data.materials).forEach(material => materialChipContainer.append(makeChip(material.name, task.materials.some(item => searchKey(item.name) === searchKey(material.name)), "", { materialId: material.id })));
    const materials = card.querySelector(".materials-list"); (task.materials || []).forEach((material, materialIndex) => renderMaterial(materials, material, materialIndex));
    renderJobWorkflows(card.querySelector(".job-workflows"), task);
    renderRatingSelect(card.querySelector(".work-intensity"), task.workIntensity, INTENSITY_DESCRIPTIONS);
    renderRatingSelect(card.querySelector(".work-quality"), task.workQuality, QUALITY_DESCRIPTIONS);
    updateRatingDescriptions(card, task);
    return card;
  }
  function renderToolQuantities(container, task) {
    container.innerHTML = task.toolIds.map(id => {
      const tool = byId(data.tools, id); if (!tool) return "";
      return `<label class="tool-quantity-row"><span>${escapeHTML(tool.name)}</span><input class="form-control tool-quantity-input" data-tool-id="${escapeHTML(id)}" value="${escapeHTML(task.toolQuantities?.[id] || "1")}" maxlength="20" inputmode="decimal" aria-label="${escapeHTML(tool.name)} mennyisége"><b>db</b></label>`;
    }).join("");
  }
  function renderRatingSelect(select, selected, descriptions) {
    select.innerHTML = Object.keys(descriptions).map(value => `<option value="${value}" ${Number(value) === validRating(selected) ? "selected" : ""}>${value} – ${escapeHTML(descriptions[value].split(" – ")[0])}</option>`).join("");
  }
  function updateRatingDescriptions(card, task) {
    card.querySelector(".intensity-description").textContent = INTENSITY_DESCRIPTIONS[validRating(task.workIntensity)];
    card.querySelector(".quality-description").textContent = QUALITY_DESCRIPTIONS[validRating(task.workQuality)];
  }
  function bestTextColor(hex) {
    const raw = String(hex || "#000000").replace("#", "");
    if (raw.length !== 6) return "#fff";
    const [r, g, b] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)].map(value => parseInt(value, 16));
    return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#172019" : "#fff";
  }
  function validWorkerColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#2f6944"; }
  function vehicleTheme(vehicle) {
    const themes = [
      { background: "#fff0ad", header: "#ffe27a", border: "#c18a00", accent: "#8a6200", text: "#fff" },
      { background: "#ffdeda", header: "#ffc2bd", border: "#c84b43", accent: "#a43731", text: "#fff" },
      { background: "#dcefff", header: "#bce1fa", border: "#3c82a8", accent: "#286a8b", text: "#fff" },
      { background: "#ebddff", header: "#d9c0f7", border: "#805eaa", accent: "#68488c", text: "#fff" }
    ];
    const known = { platos: 0, dobozos: 1, merci: 2, opel: 3 };
    const index = known[searchKey(vehicle?.name)] ?? Math.max(0, data.vehicles.findIndex(item => item.id === vehicle?.id)) % themes.length;
    return themes[index];
  }
  function applyTaskVehicleTheme(card, task) {
    const vehicle = (task.vehicleIds || []).map(id => byId(data.vehicles, id)).find(Boolean);
    const theme = vehicle ? vehicleTheme(vehicle) : { background: "#edf2eb", header: "#e2e9df", border: "#7b8e7e" };
    card.style.setProperty("--task-color", theme.background);
    card.style.setProperty("--task-header-color", theme.header);
    card.style.setProperty("--task-border-color", theme.border);
    card.classList.toggle("has-vehicle", Boolean(vehicle));
  }
  function renderTasks() {
    const list = $("#taskList");
    const anchorCard = document.activeElement?.closest?.(".task-card") || (activeTaskId ? list.querySelector(`[data-task-id="${CSS.escape(activeTaskId)}"]`) : null);
    const anchorTaskId = anchorCard?.dataset.taskId || null;
    const anchorTop = anchorCard?.getBoundingClientRect().top ?? null;
    const hadCards = Boolean(list.querySelector(".task-card"));
    const openDetails = new Map([...list.querySelectorAll(".task-card details[open]")].map(detail => [`${detail.closest(".task-card").dataset.taskId}:${detail.dataset.detail}`, true]));
    list.innerHTML = "";
    tasksByTeam().forEach(group => {
      const representative = group.tasks[0]; const { workers, vehicles } = taskPeopleAndVehicle(representative);
      const vehicle = (representative.vehicleIds || []).map(id => byId(data.vehicles, id)).find(Boolean);
      const theme = vehicle ? vehicleTheme(vehicle) : { background: "#edf2eb", border: "#7b8e7e", accent: "#173f2b" };
      const block = document.createElement("section"); block.className = "team-block"; block.dataset.teamId = group.id;
      block.style.cssText = `--team-color:${theme.background};--team-border:${theme.border};--team-accent:${theme.accent}`;
      block.innerHTML = `<header class="team-block-header"><div><h3>${escapeHTML(vehicles.join(" + ") || "Új autó / csapat")}</h3><p>${escapeHTML(workers.length ? `Dolgozók: ${workers.join(", ")}` : "Válaszd ki a dolgozókat")}</p></div><div class="team-header-actions"><strong>${group.tasks.length} ügyfél</strong><button type="button" class="team-delete-button" data-remove-team="${escapeHTML(group.id)}">Autó / csapat törlése</button></div></header><div class="task-list-inner"></div><button class="team-add-customer" type="button" data-add-team-customer="${escapeHTML(group.id)}">＋ Új ügyfél ehhez a csapathoz</button>`;
      const inner = block.querySelector(".task-list-inner");
      group.tasks.forEach((task, teamIndex) => inner.append(renderTask(task, workingPlan.tasks.indexOf(task), teamIndex, teamIndex === 0)));
      list.append(block);
    });
    if (hadCards) list.querySelectorAll(".task-card details").forEach(detail => { detail.open = openDetails.has(`${detail.closest(".task-card").dataset.taskId}:${detail.dataset.detail}`); });
    $("#emptyState").hidden = workingPlan.tasks.length > 0;
    $("#addTaskBottomButton").hidden = workingPlan.tasks.length === 0;
    $("#deleteDayButton").hidden = !workingPlan.tasks.length;
    updateCustomerDirectoryButtons();
    if (anchorTaskId && anchorTop !== null) {
      const replacement = list.querySelector(`[data-task-id="${CSS.escape(anchorTaskId)}"]`);
      if (replacement) window.scrollBy(0, replacement.getBoundingClientRect().top - anchorTop);
    }
  }
  function findTaskFromElement(element) { return workingPlan.tasks.find(task => task.id === element.closest(".task-card")?.dataset.taskId); }
  function setActiveTask(card, task) {
    if (!card || !task || activeTaskId === task.id) return;
    activeTaskId = task.id;
    document.querySelectorAll(".task-card").forEach(item => {
      const active = item.dataset.taskId === activeTaskId; item.classList.toggle("is-active", active); item.querySelector(".active-badge").hidden = !active;
    });
  }
  function taskPeopleAndVehicle(task) {
    return {
      workers: (task.workerIds || []).map(id => byId(data.workers, id)?.name).filter(Boolean),
      vehicles: (task.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean)
    };
  }
  function updateTaskSummary(card, task, index = clientIndexInTeam(task)) {
    const { workers, vehicles } = taskPeopleAndVehicle(task);
    card.querySelector(".task-number").textContent = `${index + 1}.`;
    const vehicleSummary = card.querySelector(".task-summary"); const workerSummary = card.querySelector(".task-team-summary");
    vehicleSummary.textContent = vehicles.join(" + "); vehicleSummary.hidden = vehicles.length === 0;
    workerSummary.textContent = workers.length ? `Dolgozók: ${workers.join(", ")}` : ""; workerSummary.hidden = workers.length === 0;
    card.querySelector(".task-client-name").textContent = task.customerName || "Nincs kiválasztva";
    card.querySelector(".task-client-address").textContent = task.address || "Nincs megadva";
  }
  function toggleInList(list, id) { const index = list.indexOf(id); if (index >= 0) list.splice(index, 1); else list.push(id); }
  function toggleTemplate(task, template) {
    const jobs = taskJobs(task); const selectedIndex = jobs.findIndex(job => job.templateId === template.id);
    if (selectedIndex >= 0) jobs.splice(selectedIndex, 1);
    else {
      jobs.push({ id: uid(), templateId: template.id, name: template.name, steps: deepCopy(template.steps || []) });
      task.toolIds = [...new Set([...(task.toolIds || []), ...(template.toolIds || [])])];
      task.toolIds.forEach(id => { if (!task.toolQuantities[id]) task.toolQuantities[id] = "1"; });
      (template.materials || []).forEach(material => {
        if (!task.materials.some(item => searchKey(item.name) === searchKey(material.name))) task.materials.push(normalizeMaterialItem(material));
      });
    }
    markDirty("Feladatlista módosítva • mentés szükséges"); renderTasks();
  }
  function addCustomJob(task, name) {
    const cleanedName = String(name || "").trim();
    if (!cleanedName) { toast("Írd be az új feladat nevét.", true); return; }
    let template = data.templates.find(item => searchKey(item.name) === searchKey(cleanedName));
    if (!template) {
      template = { id: uid(), name: cleanedName, active: true, toolIds: [], materials: [], steps: [], order: data.templates.length };
      data.templates.push(template);
    } else template.active = true;
    if (!taskJobs(task).some(job => job.templateId === template.id)) task.jobs.push({ id: uid(), templateId: template.id, name: template.name, steps: deepCopy(template.steps || []) });
    markDirty("Az új feladat megjegyezve • mentés szükséges"); renderTasks();
  }
  function updateCustomerDirectoryButtons() {
    const connected = Boolean(window.NapiCustomerDirectory?.hasSession?.());
    document.querySelectorAll(".add-customer").forEach(button => {
      button.hidden = connected;
      button.textContent = "🔒 Közös adatok csatlakoztatása";
    });
    $("#syncConnectionNotice").hidden = connected;
  }
  function openCustomerAuth() {
    const api = window.NapiCustomerDirectory;
    if (!api) { toast("Az ügyféllista-kapcsolat nem tölthető be.", true); return; }
    const form = $("#customerAuthForm");
    form.elements.pin.value = "";
    $("#customerAuthMessage").textContent = "";
    $("#customerAuthDialog").showModal();
    setTimeout(() => form.elements.pin.focus(), 0);
  }
  function customerDirectoryEntryForTask(task) {
    if (task.locationId) return customerDirectory.find(item => item.locationId === task.locationId) || null;
    if (!task.customerId) return null;
    const matches = customerDirectory.filter(item => item.customerId === task.customerId);
    return matches.find(item => searchKey(item.address) === searchKey(task.address)) || (matches.length === 1 ? matches[0] : null);
  }
  function reconcileCustomerSnapshots() {
    let changed = false;
    const updatePlan = plan => (plan.tasks || []).forEach(task => {
      const current = customerDirectoryEntryForTask(task);
      if (!current) return;
      if (task.customerName !== current.name || task.address !== current.address || task.locationId !== current.locationId) {
        task.customerName = current.name; task.address = current.address; task.locationId = current.locationId; changed = true;
      }
    });
    data.plans.forEach(updatePlan);
    updatePlan(workingPlan);
    return changed;
  }
  async function syncCustomerDirectory({ notify = false } = {}) {
    const api = window.NapiCustomerDirectory;
    if (!api || customerDirectorySyncing) return false;
    if (!api.hasSession()) {
      customerDirectoryState = customerDirectory.length ? "cache" : "disconnected";
      updateCustomerDirectoryButtons();
      if (notify) openCustomerAuth();
      return false;
    }
    customerDirectorySyncing = true;
    customerDirectoryState = "loading";
    updateCustomerDirectoryButtons();
    try {
      customerDirectory = await api.list();
      customerDirectoryState = "ready";
      customerDirectoryLastSync = new Date().toISOString();
      const snapshotsChanged = reconcileCustomerSnapshots();
      if (snapshotsChanged) markDirty("Az ügyféladatok frissültek • mentés szükséges");
      if (snapshotsChanged && !document.activeElement?.closest?.("#taskList .task-card")) renderTasks();
      else updateCustomerDirectoryButtons();
      if (activeSettingsTab === "customers" && $("#settingsDialog").open) renderSettings();
      if (notify) toast(`Az ügyféllista frissült: ${customerDirectory.length} cím elérhető.`);
      return true;
    } catch (error) {
      customerDirectoryState = customerDirectory.length ? "cache" : "error";
      updateCustomerDirectoryButtons();
      if (notify) toast(readableError(error), true);
      return false;
    } finally { customerDirectorySyncing = false; }
  }
  function customerDirectorySettingsHTML() {
    const connected = window.NapiCustomerDirectory?.hasSession?.();
    const lastSync = customerDirectoryLastSync ? new Date(customerDirectoryLastSync).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" }) : "még nem történt";
    const status = customerDirectoryState === "ready" ? "Csatlakoztatva" : customerDirectoryState === "loading" ? "Frissítés folyamatban…" : customerDirectory.length ? "Offline lista" : "Nincs csatlakoztatva";
    const grouped = new Map();
    customerDirectory.forEach(item => {
      if (!grouped.has(item.customerId)) grouped.set(item.customerId, { name: item.name, addresses: [] });
      if (item.address) grouped.get(item.customerId).addresses.push(item.address);
    });
    const customers = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "hu"));
    const rows = customers.map(customer => `<div class="settings-row" data-settings-row data-search-key="${escapeHTML(searchKey(`${customer.name} ${customer.addresses.join(" ")}`))}"><div><strong>${escapeHTML(customer.name)}</strong><p>${escapeHTML(customer.addresses.join(" · ") || "Nincs megadott cím")}</p></div></div>`).join("");
    return `<div class="customer-directory-panel"><div><p class="directory-state"><span class="directory-dot ${customerDirectoryState === "ready" ? "ready" : ""}"></span><strong>${status}</strong> · utolsó frissítés: ${escapeHTML(lastSync)}</p><p>A lista a Munkalap jóváhagyott ügyfeleit és címeit mutatja. Új ügyfelet és módosítást a Munkalapban lehet rögzíteni.</p></div><div class="fallback-actions"><button class="btn btn-outline-green" type="button" data-customer-directory="${connected ? "refresh" : "connect"}">${connected ? "Lista frissítése" : "Csatlakoztatás"}</button>${connected ? `<button class="btn btn-soft" type="button" data-customer-directory="disconnect">Leválasztás</button>` : ""}</div></div>${searchableSettingsListHTML(rows || `<p>Nincs megjeleníthető ügyfél. Csatlakoztasd az ügyféllistát.</p>`, customers.length, "Mentett ügyfelek")}`;
  }
  function customerMatches(query, showAll = false) {
    const needle = searchKey(query);
    if (!showAll && needle.length < 2) return [];
    return activeSorted(customerDirectory).filter(customer => !needle || searchKey(`${customer.name} ${customer.address}`).includes(needle)).slice(0, 12);
  }
  function showCustomerSuggestions(card, query, showAll = false) {
    const box = card.querySelector(".customer-suggestions"); const matches = customerMatches(query, showAll);
    box.innerHTML = matches.map(customer => `<button type="button" data-customer-choice="${escapeHTML(customer.id)}"><b>${escapeHTML(customer.name)}</b><small>${escapeHTML(customer.address || "Nincs megadott cím")}</small></button>`).join("");
    box.hidden = matches.length === 0;
  }

  $("#taskList").addEventListener("click", event => {
    const teamRemove = event.target.closest("[data-remove-team]");
    if (teamRemove) {
      const group = tasksByTeam().find(item => item.id === teamRemove.dataset.removeTeam); if (!group) return;
      const label = taskPeopleAndVehicle(group.tasks[0]).vehicles.join(" + ") || "autó nélküli csapat";
      if (!confirm(`Biztosan törlöd a(z) ${label} csapatot és a hozzá tartozó ${group.tasks.length} ügyfelet?`)) return;
      const removedIds = new Set(group.tasks.map(task => task.id));
      workingPlan.tasks = workingPlan.tasks.filter(task => !removedIds.has(task.id));
      activeTaskId = workingPlan.tasks[0]?.id || null;
      markDirty("Az autó / csapat törölve • szinkronizálás folyamatban");
      if (!workingPlan.tasks.length && workingPlan.meeting === DEFAULT_MEETING && workingPlan.stops === DEFAULT_STOPS) syncDeletedDates([workingPlan.date]);
      renderTasks(); renderWeek(); renderMonth();
      toast("Az autó / csapat törölve.");
      return;
    }
    const teamAdd = event.target.closest("[data-add-team-customer]");
    if (teamAdd) {
      const group = tasksByTeam().find(item => item.id === teamAdd.dataset.addTeamCustomer); if (!group) return;
      const task = blankTask(); const representative = group.tasks[0]; task.teamId = group.id; task.vehicleIds = deepCopy(representative.vehicleIds); task.workerIds = deepCopy(representative.workerIds);
      const insertAt = Math.max(...group.tasks.map(item => workingPlan.tasks.indexOf(item))) + 1; workingPlan.tasks.splice(insertAt, 0, task);
      activeTaskId = task.id; collapsedTaskIds.delete(task.id); markDirty("Új ügyfél hozzáadva • mentés szükséges"); renderTasks();
      $("#taskList").querySelector(`[data-task-id="${CSS.escape(task.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    const card = event.target.closest(".task-card"); if (!card) return;
    const task = findTaskFromElement(card); const index = workingPlan.tasks.indexOf(task); const clientIndex = clientIndexInTeam(task);
    setActiveTask(card, task);
    if (event.target.closest(".edit-task")) { collapsedTaskIds.delete(task.id); activeTaskId = task.id; renderTasks(); const refreshedCard = $("#taskList").querySelector(`[data-task-id="${CSS.escape(task.id)}"]`); refreshedCard?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const infoButton = event.target.closest("[data-job-info]");
    if (infoButton) {
      const job = taskJobs(task).find(item => item.id === infoButton.dataset.jobInfo); if (!job) return;
      $("#jobInfoTitle").textContent = job.name;
      $("#jobInfoContent").innerHTML = job.steps.length ? `<ol class="job-info-steps">${job.steps.map(step => `<li>${escapeHTML(step)}</li>`).join("")}</ol>` : `<p>Ehhez a feladathoz még nincs külön kivitelezési tudnivaló. A Feladatleírások résznél hozzáadhatod.</p>`;
      $("#jobInfoDialog").showModal(); return;
    }
    const chip = event.target.closest(".choice-chip");
    if (chip?.dataset.group) {
      const target = chip.dataset.group === "worker" ? task.workerIds : chip.dataset.group === "vehicle" ? task.vehicleIds : task.toolIds;
      toggleInList(target, chip.dataset.id);
      if (chip.dataset.group === "tool") { if (target.includes(chip.dataset.id)) task.toolQuantities[chip.dataset.id] ||= "1"; else delete task.toolQuantities[chip.dataset.id]; }
      if (["worker", "vehicle"].includes(chip.dataset.group)) workingPlan.tasks.filter(item => item.teamId === task.teamId).forEach(item => { item[chip.dataset.group === "worker" ? "workerIds" : "vehicleIds"] = deepCopy(target); });
      chip.setAttribute("aria-pressed", String(target.includes(chip.dataset.id))); updateTaskSummary(card, task); if (chip.dataset.group === "vehicle") applyTaskVehicleTheme(card, task); if (chip.dataset.group === "tool") renderToolQuantities(card.querySelector(".tool-quantities"), task); markDirty(); renderTasks(); return;
    }
    if (chip?.dataset.templateId) { const template = byId(data.templates, chip.dataset.templateId); if (template) toggleTemplate(task, template); return; }
    if (chip?.dataset.materialId) {
      const material = byId(data.materials, chip.dataset.materialId); if (!material) return;
      const selectedIndex = task.materials.findIndex(item => item.materialId === material.id || searchKey(item.name) === searchKey(material.name));
      if (selectedIndex >= 0) task.materials.splice(selectedIndex, 1); else task.materials.push({ materialId: material.id, source: material.source || "", name: material.name, quantity: "", unit: material.unit || "" });
      markDirty(); renderTasks(); return;
    }
    const customerChoice = event.target.closest("[data-customer-choice]");
    if (customerChoice) {
      const customer = byId(customerDirectory, customerChoice.dataset.customerChoice); if (!customer) return;
      task.customerId = customer.customerId; task.locationId = customer.locationId; task.customerName = customer.name; task.address = customer.address || "";
      card.querySelector(".customer-input").value = task.customerName; card.querySelector(".address-input").value = task.address; card.querySelector(".customer-suggestions").hidden = true;
      updateTaskSummary(card, task); markDirty(); return;
    }
    if (event.target.closest(".customer-dropdown")) { if (!customerDirectory.length) openCustomerAuth(); else showCustomerSuggestions(card, "", true); return; }
    if (event.target.closest(".add-customer")) { if (window.NapiCustomerDirectory?.hasSession?.()) syncCustomerDirectory({ notify: true }); else openCustomerAuth(); return; }
    if (event.target.closest(".add-custom-job")) { const input = card.querySelector(".new-job-input"); addCustomJob(task, input.value); return; }
    if (event.target.closest(".add-material")) { task.materials.push({ materialId: null, source: "", name: "", quantity: "", unit: "" }); markDirty(); renderTasks(); return; }
    const materialRow = event.target.closest(".material-row");
    if (event.target.closest(".remove-material") && materialRow) { task.materials.splice(Number(materialRow.dataset.materialIndex), 1); markDirty(); renderTasks(); return; }
    if (event.target.closest(".duplicate-task")) { const duplicate = deepCopy(task); duplicate.id = uid(); workingPlan.tasks.splice(index + 1, 0, duplicate); markDirty(); renderTasks(); return; }
    if (event.target.closest(".remove-task")) { if (confirm("Eltávolítod ezt az ügyfelet a napi tervből?")) { workingPlan.tasks.splice(index, 1); activeTaskId = workingPlan.tasks[Math.min(index, workingPlan.tasks.length - 1)]?.id || null; markDirty("Az ügyfél törölve • szinkronizálás folyamatban"); if (!workingPlan.tasks.length && workingPlan.meeting === DEFAULT_MEETING && workingPlan.stops === DEFAULT_STOPS) syncDeletedDates([workingPlan.date]); renderTasks(); renderWeek(); renderMonth(); toast("Az ügyfél törölve."); } return; }
    const groupTasks = workingPlan.tasks.filter(item => item.teamId === task.teamId);
    if (event.target.closest(".move-up") && clientIndex > 0) { const other = workingPlan.tasks.indexOf(groupTasks[clientIndex - 1]); [workingPlan.tasks[other], workingPlan.tasks[index]] = [workingPlan.tasks[index], workingPlan.tasks[other]]; markDirty(); renderTasks(); return; }
    if (event.target.closest(".move-down") && clientIndex < groupTasks.length - 1) { const other = workingPlan.tasks.indexOf(groupTasks[clientIndex + 1]); [workingPlan.tasks[other], workingPlan.tasks[index]] = [workingPlan.tasks[index], workingPlan.tasks[other]]; markDirty(); renderTasks(); }
  });
  $("#taskList").addEventListener("input", event => {
    const card = event.target.closest(".task-card"); if (!card) return; const task = findTaskFromElement(card); if (!task) return;
    if (event.target.matches(".customer-input")) { task.customerId = null; task.locationId = null; task.customerName = event.target.value; showCustomerSuggestions(card, event.target.value); }
    else if (event.target.matches(".address-input")) task.address = event.target.value;
    else if (event.target.matches(".start-time-input")) task.startTime = event.target.value;
    else if (event.target.matches(".tool-quantity-input")) task.toolQuantities[event.target.dataset.toolId] = event.target.value;
    else if (event.target.matches(".work-intensity")) { task.workIntensity = validRating(event.target.value); updateRatingDescriptions(card, task); }
    else if (event.target.matches(".work-quality")) { task.workQuality = validRating(event.target.value); updateRatingDescriptions(card, task); }
    else if (event.target.matches(".extra-tools-input")) task.extraTools = event.target.value;
    else if (event.target.matches(".job-steps-input")) {
      const job = taskJobs(task).find(item => item.id === event.target.dataset.jobId);
      if (job) {
        job.steps = event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const template = job.templateId ? byId(data.templates, job.templateId) : null;
        if (template) { template.steps = deepCopy(job.steps); cloudConfigDirty = true; }
      }
    }
    else if (event.target.matches(".notes-input")) task.notes = event.target.value;
    else if (event.target.closest(".material-row")) {
      const row = event.target.closest(".material-row"); const material = task.materials[Number(row.dataset.materialIndex)];
      if (event.target.matches(".material-source")) material.source = event.target.value;
      if (event.target.matches(".material-name")) material.name = event.target.value;
      if (event.target.matches(".material-quantity")) material.quantity = event.target.value;
      if (event.target.matches(".material-unit")) material.unit = event.target.value;
    }
    updateTaskSummary(card, task, clientIndexInTeam(task)); markDirty();
  });
  $("#taskList").addEventListener("change", event => {
    const card = event.target.closest(".task-card"); if (!card) return; const task = findTaskFromElement(card); if (!task) return;
    if (event.target.matches(".worklog-required")) { task.workLogRequired = event.target.checked; markDirty(); }
  });
  $("#taskList").addEventListener("keydown", event => {
    if (!event.target.matches(".new-job-input") || event.key !== "Enter") return;
    event.preventDefault(); const task = findTaskFromElement(event.target); if (task) addCustomJob(task, event.target.value);
  });
  $("#taskList").addEventListener("focusin", event => { const card = event.target.closest(".task-card"); if (card) setActiveTask(card, findTaskFromElement(card)); if (event.target.matches(".customer-input") && searchKey(event.target.value).length >= 2) showCustomerSuggestions(card, event.target.value); });
  $("#taskList").addEventListener("wheel", event => { if (event.target.closest(".start-time-input")) event.preventDefault(); }, { passive: false });
  document.addEventListener("click", event => { if (!event.target.closest(".customer-picker")) document.querySelectorAll(".customer-suggestions").forEach(box => box.hidden = true); });

  function addTask() { const task = blankTask(); workingPlan.tasks.push(task); activeTaskId = task.id; collapsedTaskIds.delete(task.id); markDirty(); renderTasks(); $("#taskList .team-block:last-child")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  $("#addTaskButton").addEventListener("click", addTask);
  $("#addTaskBottomButton").addEventListener("click", addTask);
  $("#connectSyncButton").addEventListener("click", openCustomerAuth);
  $("#customerAuthForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector("button[value='default']");
    const pin = form.elements.pin.value;
    button.disabled = true; $("#customerAuthMessage").textContent = "Csatlakozás…";
    try {
      await window.NapiCustomerDirectory.signIn(pin);
      if (!(await syncCustomerDirectory())) throw new Error("A belépés sikerült, de az ügyféllista nem tölthető be.");
      await pullSharedData({ initial: true });
      form.elements.pin.value = ""; $("#customerAuthDialog").close(); updateCustomerDirectoryButtons(); toast("A közös adatok szinkronizálása bekapcsolva ezen az eszközön.");
    } catch (error) { $("#customerAuthMessage").textContent = readableError(error); }
    finally { button.disabled = false; }
  });
  $("#customerAuthDialog").addEventListener("click", event => { if (event.target.closest("[data-close-customer-auth]")) $("#customerAuthDialog").close(); });
  $("#customerForm").addEventListener("submit", event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const address = String(form.get("address") || "").trim();
    if (!name || !address) return;
    const duplicate = data.customers.find(customer => searchKey(customer.name) === searchKey(name) && searchKey(customer.address) === searchKey(address));
    const customer = duplicate || { id: uid(), name, address, active: true, order: data.customers.length };
    if (!duplicate) { data.customers.push(customer); cloudConfigDirty = true; }
    const task = workingPlan.tasks.find(item => item.id === pendingCustomerTaskId);
    if (task) { task.customerId = customer.id; task.customerName = customer.name; task.address = customer.address; }
    markDirty("Ügyfél hozzáadva • mentés szükséges"); renderTasks(); $("#customerDialog").close();
  });

  function copyPlanFrom(date) {
    const source = data.plans.find(plan => plan.date === date);
    if (!source) { toast("Ehhez a dátumhoz nincs elmentett napi terv.", true); return; }
    workingPlan = deepCopy(source); workingPlan.id = uid(); workingPlan.date = $("#planDate").value;
    workingPlan.tasks.forEach(task => task.id = uid()); markDirty("Korábbi terv másolva • mentés szükséges"); renderTasks(); toast("A terv átmásolva az új dátumra.");
  }
  $("#copyYesterdayButton").addEventListener("click", () => copyPlanFrom(dateOffset(workingPlan.date, -1)));
  $("#copyEarlierButton").addEventListener("click", () => {
    const plans = data.plans.filter(plan => plan.date !== workingPlan.date && planHasTasks(plan)).sort((a, b) => b.date.localeCompare(a.date));
    $("#historyList").innerHTML = plans.length ? plans.map(plan => `<button class="history-item" type="button" data-copy-date="${plan.date}"><span><b>${escapeHTML(formatDate(plan.date))}</b><span>${plan.tasks.length} feladat</span></span><strong>Másolás →</strong></button>`).join("") : `<p>Még nincs másolható korábbi terv.</p>`;
    $("#historyDialog").showModal();
  });
  $("#historyList").addEventListener("click", event => { const item = event.target.closest("[data-copy-date]"); if (item) { copyPlanFrom(item.dataset.copyDate); $("#historyDialog").close(); } });

  function renderWeek() {
    const start = startOfWeek(weekAnchor); const days = Array.from({ length: 7 }, (_, index) => dateOffset(start, index));
    $("#weekRange").textContent = `${formatDate(days[0], { year: "numeric", month: "long", day: "numeric" })} – ${formatDate(days[6], { year: "numeric", month: "long", day: "numeric" })}`;
    $("#weekGrid").innerHTML = days.map(date => {
      const savedPlan = data.plans.find(item => item.date === date);
      const plan = planHasTasks(savedPlan) ? savedPlan : null;
      const tasks = plan?.tasks || [];
      const taskHTML = tasks.length ? tasksByTeam(plan).map(group => {
        const lead = group.tasks[0];
        const workers = (lead.workerIds || []).map(id => byId(data.workers, id)?.name).filter(Boolean).join(", ");
        const vehicles = (lead.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
        const clients = group.tasks.map((task, teamIndex) => `<span><strong>${teamIndex + 1}. ${escapeHTML(task.customerName || "Ügyfél nélkül")}</strong>${task.startTime ? `<small>${escapeHTML(task.startTime)}</small>` : ""}${task.address ? `<em>${escapeHTML(task.address)}</em>` : ""}</span>`).join("");
        return `<div class="week-task"><b>${escapeHTML(vehicles || "Autó nélkül")}</b><small class="week-workers">Dolgozók: ${escapeHTML(workers || "nincs kiválasztva")}</small>${clients}</div>`;
      }).join("") : `<p class="week-empty">Nincs elmentett feladat.</p>`;
      const holiday = hungarianHoliday(date);
      return `<article class="week-day${date === isoToday() ? " today" : ""}${holiday ? " holiday" : ""}"><header><div><p class="week-day-name">${escapeHTML(formatDate(date, { weekday: "long" }))}</p><p class="week-day-date">${escapeHTML(formatDate(date, { month: "short", day: "numeric" }))}</p></div>${holiday ? `<span class="holiday-label">${escapeHTML(holiday)}</span>` : ""}</header><div class="week-day-tasks">${taskHTML}</div><div class="week-day-actions"><button class="week-open" type="button" data-open-date="${date}">${tasks.length ? "Nap megnyitása" : "Terv készítése"}</button>${plan ? `<button class="week-delete" type="button" data-delete-date="${date}">Teljes nap törlése</button>` : ""}</div></article>`;
    }).join("");
  }
  function deleteDay(date) {
    if (!confirm(`Biztosan törlöd a(z) ${formatDate(date)} teljes napi tervét? Előtte tölts le adatmentést, ha meg szeretnéd őrizni.`)) return false;
    data.plans = data.plans.filter(plan => plan.date !== date);
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    const syncPromise = syncDeletedDates([date]);
    if (workingPlan.date === date) { localStorage.removeItem(RECOVERY_KEY); dirty = false; loadPlan(date); }
    renderWeek(); renderMonth(); toast("A teljes napi terv törölve • szinkronizálás folyamatban.");
    syncPromise.then(synced => {
      if (synced) toast("A teljes napi terv minden eszközről törölve.");
      else toast("A törlés ezen az eszközön megtörtént. A közös törlés internetkapcsolatkor automatikusan befejeződik.", true);
    });
    return true;
  }
  function renderMonth() {
    const first = `${monthAnchor}-01`;
    const firstDate = dateFromISO(first);
    const mondayOffset = (firstDate.getDay() + 6) % 7;
    const gridStart = dateOffset(first, -mondayOffset);
    const days = Array.from({ length: 42 }, (_, index) => dateOffset(gridStart, index));
    $("#monthTitle").textContent = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(firstDate);
    $("#monthGrid").innerHTML = days.map(date => {
      const savedPlan = data.plans.find(item => item.date === date);
      const plan = planHasTasks(savedPlan) ? savedPlan : null;
      const holiday = hungarianHoliday(date);
      const clients = plan?.tasks.length || 0;
      const details = plan ? tasksByTeam(plan).map(group => {
        const lead = group.tasks[0];
        const vehicle = (lead.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ") || "Autó nélkül";
        const customers = group.tasks.map(task => task.customerName || "Ügyfél nélkül").join(", ");
        return `${vehicle}: ${customers}`;
      }).join(" • ") : "";
      const classes = `month-day${date.slice(0, 7) !== monthAnchor ? " outside" : ""}${date === isoToday() ? " today" : ""}${holiday ? " holiday" : ""}`;
      return `<article class="${classes}"><button class="month-day-open" type="button" data-month-date="${date}" aria-label="${escapeHTML(formatDate(date))}${clients ? `, ${clients} ügyfél` : ""}"><span class="month-day-number">${Number(date.slice(8, 10))}</span>${holiday ? `<strong>${escapeHTML(holiday)}</strong>` : ""}${clients ? `<small>${escapeHTML(details)}</small>` : ""}</button>${clients ? `<button class="month-day-delete" type="button" data-month-delete="${date}" aria-label="${escapeHTML(formatDate(date))} teljes napi tervének törlése">Törlés</button>` : ""}</article>`;
    }).join("");
  }
  function switchView(view) {
    const weekly = view === "week"; const monthly = view === "month"; const daily = view === "day";
    setDockOpen(false);
    $("#dayViewButton").classList.toggle("active", daily); $("#dayViewButton").setAttribute("aria-pressed", String(daily));
    $("#weekViewButton").classList.toggle("active", weekly); $("#weekViewButton").setAttribute("aria-pressed", String(weekly));
    $("#monthViewButton").classList.toggle("active", monthly); $("#monthViewButton").setAttribute("aria-pressed", String(monthly));
    if (weekly) { if (dirty) upsertWorkingPlan(); $("#weekView").open = true; renderWeek(); $("#weekView").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (monthly) { if (dirty) upsertWorkingPlan(); $("#monthView").open = true; renderMonth(); $("#monthView").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else $("#dayView").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#dayViewButton").addEventListener("click", () => switchView("day")); $("#weekViewButton").addEventListener("click", () => switchView("week")); $("#monthViewButton").addEventListener("click", () => switchView("month"));
  $("#weekGrid").addEventListener("click", event => {
    const deleteButton = event.target.closest("[data-delete-date]");
    if (deleteButton) {
      const date = deleteButton.dataset.deleteDate;
      deleteDay(date); return;
    }
    const button = event.target.closest("[data-open-date]"); if (!button) return; loadPlan(button.dataset.openDate); switchView("day");
  });
  $("#weekView").addEventListener("toggle", () => { if ($("#weekView").open) renderWeek(); });
  $("#previousWeekButton").addEventListener("click", () => { weekAnchor = dateOffset(weekAnchor, -7); renderWeek(); });
  $("#nextWeekButton").addEventListener("click", () => { weekAnchor = dateOffset(weekAnchor, 7); renderWeek(); });
  $("#currentWeekButton").addEventListener("click", () => { weekAnchor = isoToday(); renderWeek(); });
  $("#monthView").addEventListener("toggle", () => { if ($("#monthView").open) renderMonth(); });
  $("#previousMonthButton").addEventListener("click", () => { monthAnchor = monthOffset(monthAnchor, -1); renderMonth(); });
  $("#nextMonthButton").addEventListener("click", () => { monthAnchor = monthOffset(monthAnchor, 1); renderMonth(); });
  $("#currentMonthButton").addEventListener("click", () => { monthAnchor = isoToday().slice(0, 7); renderMonth(); });
  $("#monthGrid").addEventListener("click", event => {
    const deleteButton = event.target.closest("[data-month-delete]");
    if (deleteButton) { deleteDay(deleteButton.dataset.monthDelete); return; }
    const day = event.target.closest("[data-month-date]"); if (!day) return; loadPlan(day.dataset.monthDate); switchView("day");
  });

  function jobDescriptions(task) {
    const seen = new Set();
    return taskJobs(task).map(job => {
      const steps = (job.steps || []).map(cleanStep).filter(step => {
        const key = searchKey(step); if (!key || seen.has(key)) return false; seen.add(key); return true;
      });
      return { name: job.name, steps };
    });
  }

  function planText() {
    const lines = [`${formatDate(workingPlan.date)} – Napi feladatok`, ""];
    if (workingPlan.meeting) lines.push(`Találkozó: ${workingPlan.meeting}`);
    if (workingPlan.stops) lines.push(`Megálló: ${workingPlan.stops}`);
    if (workingPlan.meeting || workingPlan.stops) lines.push("");
    tasksByTeam().forEach(group => {
      const lead = group.tasks[0];
      const workers = (lead.workerIds || []).map(id => byId(data.workers, id)?.name).filter(Boolean).join(", ");
      const vehicles = (lead.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
      lines.push(`${vehicles || "Autó nélkül"} – ${workers || "nincs dolgozó kiválasztva"}`, "");
      group.tasks.forEach((task, teamIndex) => {
        const tools = [...task.toolIds.map(id => { const tool = byId(data.tools, id); return tool ? `${tool.name} – ${task.toolQuantities?.[id] || "1"} db` : ""; }).filter(Boolean), ...String(task.extraTools || "").split(",").map(item => item.trim()).filter(Boolean)];
        lines.push(`${teamIndex + 1}. ${task.customerName || "nincs kiválasztva"}`);
        lines.push(`Cím: ${task.address || "nincs megadva"}${task.startTime ? ` · Kezdés: ${task.startTime}` : ""}`);
        const descriptions = jobDescriptions(task);
        if (descriptions.length) {
          lines.push("Feladatok:");
          descriptions.forEach(item => { lines.push(`- ${item.name}`); item.steps.forEach(step => lines.push(`  • ${step}`)); });
        }
        if (tools.length) { lines.push("Szükséges eszközök:"); tools.forEach(item => lines.push(`- ${item}`)); }
        const materials = task.materials.filter(item => item.name);
        if (materials.length) { lines.push("Anyagok:"); materials.forEach(item => lines.push(`- ${item.source ? `${item.source}: ` : ""}${item.name}${item.quantity ? ` – ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""}`)); }
        if (task.notes) lines.push(`Megjegyzés: ${task.notes}`);
        lines.push("Munkavégzés:");
        lines.push(task.workLogRequired === false ? "Munkanaplót nem kell megírni." : "Munkanaplót megírni.");
        lines.push(INTENSITY_DESCRIPTIONS[validRating(task.workIntensity)]);
        lines.push(QUALITY_DESCRIPTIONS[validRating(task.workQuality)]);
        lines.push("");
      });
    });
    lines.push(FINAL_NOTE); return lines.join("\n");
  }
  function renderPrintView() {
    const departure = workingPlan.meeting || workingPlan.stops ? `<div class="print-departure">${workingPlan.meeting ? `<p><strong>Találkozó:</strong> ${escapeHTML(workingPlan.meeting)}</p>` : ""}${workingPlan.stops ? `<p><strong>Megálló:</strong> ${escapeHTML(workingPlan.stops)}</p>` : ""}</div>` : "";
    const logoUrl = new URL("assets/diszkertek-logo.png", document.baseURI).href;
    const printHeader = `<header class="print-header"><img src="${escapeHTML(logoUrl)}" alt="Díszkertek logó" width="416" height="512"><div><h1>Napi feladatok</h1><div class="print-date">${escapeHTML(formatDate(workingPlan.date))}</div></div></header>`;
    const tasks = tasksByTeam().map((group, groupIndex) => {
      const lead = group.tasks[0];
      const workers = (lead.workerIds || []).map(id => byId(data.workers, id)).filter(Boolean).map(worker => `<span class="print-worker" style="--print-worker-color:${escapeHTML(worker.color)};--print-worker-text:${bestTextColor(worker.color)}">${escapeHTML(worker.name)}</span>`).join("");
      const vehicles = (lead.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
      const printVehicle = (lead.vehicleIds || []).map(id => byId(data.vehicles, id)).find(Boolean);
      const printTheme = printVehicle ? vehicleTheme(printVehicle) : { background: "#edf2eb", border: "#7b8e7e", accent: "#173f2b" };
      const clients = group.tasks.map((task, teamIndex) => {
        const tools = [...task.toolIds.map(id => { const tool = byId(data.tools, id); return tool ? `${tool.name} - ${task.toolQuantities?.[id] || "1"} db` : ""; }).filter(Boolean), ...String(task.extraTools || "").split(",").map(item => item.trim()).filter(Boolean)];
        const materials = task.materials.filter(item => item.name);
        const jobs = jobDescriptions(task).map(item => `<div class="print-job-description"><h4>${escapeHTML(item.name)}</h4>${item.steps.length ? `<ul>${item.steps.map(step => `<li>${escapeHTML(step.replaceAll("–", "-"))}</li>`).join("")}</ul>` : ""}</div>`).join("");
        const expectations = `<section class="print-section wide print-expectations"><h3>Munkavégzés</h3><p>${task.workLogRequired === false ? "Munkanaplót nem kell megírni." : "Munkanaplót megírni."}<br>${escapeHTML(INTENSITY_DESCRIPTIONS[validRating(task.workIntensity)].replaceAll("–", "-"))}<br>${escapeHTML(QUALITY_DESCRIPTIONS[validRating(task.workQuality)].replaceAll("–", "-"))}</p></section>`;
        return `<section class="print-client-block"><div class="print-client-row"><section><small>${teamIndex + 1}. Ügyfél</small><strong>${escapeHTML(task.customerName || "Nincs kiválasztva")}</strong></section><section><small>Cím${task.startTime ? ` · Kezdés: ${escapeHTML(task.startTime)}` : ""}</small><strong>${escapeHTML(task.address || "Nincs megadva")}</strong></section></div><div class="print-grid">${jobs ? `<section class="print-section wide"><h3>Feladatok</h3>${jobs}</section>` : ""}${tools.length ? `<section class="print-section"><h3>Szükséges eszközök</h3><ul>${tools.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>` : ""}${materials.length ? `<section class="print-section"><h3>Anyagok</h3><ul>${materials.map(item => `<li>${item.source ? `<strong>${escapeHTML(item.source)}:</strong> ` : ""}${escapeHTML(item.name)}${item.quantity ? ` - ${escapeHTML(item.quantity)}${item.unit ? ` ${escapeHTML(item.unit)}` : ""}` : ""}</li>`).join("")}</ul></section>` : ""}${task.notes ? `<section class="print-section wide"><h3>Megjegyzés</h3><p>${escapeHTML(task.notes)}</p></section>` : ""}${expectations}</div></section>`;
      }).join("");
      const printTask = `<article class="print-task" style="--print-task-color:${printTheme.background};--print-task-border:${printTheme.border};--print-task-accent:${printTheme.accent}"><div class="print-task-heading"><h2>${escapeHTML(vehicles || "Autó nélkül")}</h2><div class="print-heading-workers">${workers || `<span>Nincs dolgozó kiválasztva</span>`}</div></div>${clients}</article>`;
      return `${groupIndex ? `<div class="print-divider">Következő csapat</div>` : ""}${printTask}`;
    }).join("");
    $("#printView").innerHTML = `<section class="print-sheet">${printHeader}${departure}${tasks || `<p>Nincs feladat erre a napra.</p>`}${tasks ? `<div class="print-footer-note">${FINAL_NOTE}</div>` : ""}</section>`;
  }
  window.addEventListener("beforeprint", renderPrintView);
  $("#printButton").addEventListener("click", async () => {
    renderPrintView();
    const logo = $("#printView .print-header img");
    try { if (logo?.decode) await logo.decode(); else if (logo && !logo.complete) await new Promise(resolve => { logo.addEventListener("load", resolve, { once: true }); logo.addEventListener("error", resolve, { once: true }); }); } catch (_) { /* A böngésző a gyorsítótárból is nyomtathat. */ }
    window.print();
  });
  async function copyText() {
    const text = planText();
    try { await navigator.clipboard.writeText(text); toast("A napi terv szövege a vágólapra került."); }
    catch (_) { const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); toast("A napi terv szövege a vágólapra került."); }
  }
  async function copyTextImmediately(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* Régebbi böngészőn az alábbi megoldás fut. */ }
    }
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select();
    let copied = false; try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
    area.remove(); return copied;
  }
  $("#copyTextButton").addEventListener("click", copyText);
  const shareButton = $("#shareButton");
  const isAndroid = /Android/i.test(navigator.userAgent);
  shareButton.textContent = isAndroid ? "Megosztás" : "Teljes szöveg Viberhez";
  shareButton.title = isAndroid ? "A telefon megosztási ablakának megnyitása" : "A teljes napi terv másolása Viberbe illesztéshez";
  shareButton.addEventListener("click", async () => {
    const text = planText();
    if (isAndroid && navigator.share) {
      try { await navigator.share({ title: `${workingPlan.date} – Napi feladatok`, text }); }
      catch (error) { if (error?.name !== "AbortError") { await copyText(); toast("A megosztás helyett a szöveget a vágólapra másoltam."); } }
      return;
    }

    // A böngésző külső alkalmazást megnyitó ablaka nem fordítható le az appból.
    // PC-n ezért a teljes tervet másoljuk, így nem jelenik meg angol rendszerüzenet.
    const copied = await copyTextImmediately(text);
    toast(copied ? "A teljes napi tervet kimásoltam. Nyisd meg a Vibert, majd illeszd be az üzenetbe." : "A másolás nem sikerült. Használd a Szöveg másolása gombot.", !copied);
  });

  function settingsType() {
    return activeSettingsTab === "workers" ? data.workers : activeSettingsTab === "vehicles" ? data.vehicles : activeSettingsTab === "tools" ? data.tools : activeSettingsTab === "materials" ? data.materials : activeSettingsTab === "templates" ? data.templates : data.customers;
  }
  function recurringSettingsHTML() {
    const editing = data.recurrences.find(item => item.id === editingSettingsId);
    const today = isoToday(); const yearEnd = `${today.slice(0, 4)}-12-31`;
    const customerOptions = customerDirectory.map(customer => `<option value="${escapeHTML(`${customer.name} | ${customer.address}`)}"></option>`).join("");
    const templateOptions = activeSorted(data.templates).map(template => `<option value="${template.id}" ${editing?.templateId === template.id ? "selected" : ""}>${escapeHTML(template.name)}</option>`).join("");
    const weekdays = [[1,"Hétfő"],[2,"Kedd"],[3,"Szerda"],[4,"Csütörtök"],[5,"Péntek"],[6,"Szombat"],[0,"Vasárnap"]].map(([value,label]) => `<option value="${value}" ${Number(editing?.weekday ?? 5) === value ? "selected" : ""}>${label}</option>`).join("");
    const frequencyLabels = { weekly: "Hetente", biweekly: "Kéthetente", monthly: "Havonta", custom: "Egyedi dátumokon" };
    const customDates = (editing?.customDates || []).map(date => `<button class="btn btn-soft" type="button" data-recurring-date="${date}" title="Dátum eltávolítása">${escapeHTML(formatDate(date, { month:"short", day:"numeric" }))} ×</button>`).join("");
    const rows = data.recurrences.map(item => `<div class="settings-row" data-settings-row data-search-key="${escapeHTML(searchKey(`${item.customerName} ${item.address} ${item.jobName}`))}"><div><strong>${escapeHTML(item.customerName)}</strong><p>${escapeHTML(item.address)} · ${escapeHTML(frequencyLabels[item.frequency || "weekly"])} · ${escapeHTML(item.jobName)}</p><p>${escapeHTML(formatDate(item.startDate, { year:"numeric", month:"short", day:"numeric" }))} - ${escapeHTML(formatDate(item.endDate, { year:"numeric", month:"short", day:"numeric" }))}${item.startTime ? ` · kezdés: ${escapeHTML(item.startTime)}` : ""}</p></div><div class="settings-row-actions"><button class="icon-button" type="button" data-recurring-edit="${item.id}" aria-label="Szerkesztés">✎</button><button class="icon-button danger" type="button" data-recurring-delete="${item.id}" aria-label="Törlés">×</button></div></div>`).join("");
    const frequency = editing?.frequency || "weekly";
    return `<div class="settings-editor recurring-editor"><h3>${editing ? "Ismétlődő terv szerkesztése" : "Új ismétlődő terv"}</h3><p class="field-help">A terv hetente, kéthetente, havonta vagy külön kiválasztott napokon is előre beírható.</p><label>Ügyfél és cím<input class="form-control" id="recurringCustomer" list="recurringCustomerOptions" value="${escapeHTML(editing ? `${editing.customerName} | ${editing.address}` : "")}" placeholder="Kezdd el írni az ügyfél nevét" autocomplete="off"><datalist id="recurringCustomerOptions">${customerOptions}</datalist></label><label>Feladat<select class="form-select" id="recurringTemplate"><option value="">Válassz feladatot</option>${templateOptions}</select></label><label>Ismétlődés<select class="form-select" id="recurringFrequency"><option value="weekly" ${frequency === "weekly" ? "selected" : ""}>Hetente</option><option value="biweekly" ${frequency === "biweekly" ? "selected" : ""}>Kéthetente</option><option value="monthly" ${frequency === "monthly" ? "selected" : ""}>Havonta</option><option value="custom" ${frequency === "custom" ? "selected" : ""}>Egyedi dátumokon</option></select></label><label data-recurring-weekday ${["weekly","biweekly"].includes(frequency) ? "" : "hidden"}>Hét napja<select class="form-select" id="recurringWeekday">${weekdays}</select></label><label data-recurring-monthday ${frequency === "monthly" ? "" : "hidden"}>Hónap napja<input class="form-control" id="recurringMonthDay" type="number" min="1" max="31" value="${editing?.monthDay || Number((editing?.startDate || today).slice(8,10))}"></label><div data-recurring-custom ${frequency === "custom" ? "" : "hidden"}><label>Egyedi dátum<input class="form-control" id="recurringCustomDate" type="date"></label><button class="btn btn-soft mt-2" type="button" data-recurring-add-date>＋ Dátum hozzáadása</button><div class="chip-grid mt-2" id="recurringCustomDateList">${customDates}</div></div><div class="form-grid"><label>Első nap<input class="form-control" id="recurringStart" type="date" value="${editing?.startDate || today}"></label><label>Utolsó nap<input class="form-control" id="recurringEnd" type="date" value="${editing?.endDate || yearEnd}"></label><label>Kezdés a címen (nem kötelező)<input class="form-control" id="recurringStartTime" type="time" value="${escapeHTML(editing?.startTime || "")}"></label></div><button class="btn btn-outline-green" type="button" data-recurring-submit>Előre beírás a naptárba</button></div>${searchableSettingsListHTML(rows || `<p class="empty-detail">Még nincs ismétlődő terv.</p>`, data.recurrences.length, "Ismétlődő tervek")}`;
  }
  function renderSettings() {
    $("#settingsDialogTitle").textContent = "Adatok kezelése";
    document.querySelectorAll("[data-settings-tab]").forEach(button => button.classList.toggle("active", button.dataset.settingsTab === activeSettingsTab));
    const container = $("#settingsContent");
    if (activeSettingsTab === "data") {
      container.innerHTML = `<div class="settings-editor"><h3>Helyi adatfájl</h3><p>Az alkalmazás minden adatot a <strong>${DATA_FILE_NAME}</strong> fájlba ment. Érdemes erről időnként biztonsági másolatot készíteni.</p><div class="fallback-actions"><button class="btn btn-outline-green" type="button" data-data-action="choose">Mappa kiválasztása</button><button class="btn btn-soft" type="button" data-data-action="download">Biztonsági másolat letöltése</button><label class="btn btn-soft mb-0">Másolat visszatöltése<input type="file" data-data-import accept="application/json,.json" hidden></label></div></div>`;
      return;
    }
    if (activeSettingsTab === "recurring") { container.innerHTML = recurringSettingsHTML(); return; }
    const list = settingsType(); const editing = list.find(item => item.id === editingSettingsId);
    if (activeSettingsTab === "workers") {
      const selectedColor = validWorkerColor(editing?.color);
      const palette = workerPalette.map(color => `<button class="worker-color-choice" type="button" data-worker-color="${color}" style="--choice-color:${color}" aria-label="${color} szín" aria-pressed="${color === selectedColor}"><span></span></button>`).join("");
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Dolgozó szerkesztése" : "Új dolgozó"}</h3><div class="form-grid"><label>Név<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="80"></label><fieldset class="worker-color-editor wide"><legend>Dolgozó színe</legend><div class="worker-color-palette">${palette}</div><label class="worker-custom-color"><span>Egyedi szín</span><input id="settingColor" type="color" value="${selectedColor}"><output id="settingColorCode">${selectedColor.toUpperCase()}</output></label></fieldset><label class="wide"><span><input id="settingManager" type="checkbox" ${editing?.manager ? "checked" : ""}> Csoportvezető</span></label></div><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => item.manager ? "Csoportvezető" : "Dolgozó", true)}`;
    } else if (activeSettingsTab === "materials") {
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Anyag szerkesztése" : "Új anyag"}</h3><div class="form-grid"><label>Anyag neve<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="100"></label><label>Mértékegység<input class="form-control" id="settingUnit" value="${escapeHTML(editing?.unit || "")}" maxlength="40" placeholder="például: db, kg, m³"></label><label class="wide">Alapértelmezett beszerzési hely<input class="form-control" id="settingSource" value="${escapeHTML(editing?.source || "")}" maxlength="160"></label></div><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => [item.source, item.unit].filter(Boolean).join(" · "))}`;
    } else if (activeSettingsTab === "vehicles" || activeSettingsTab === "tools") {
      const title = activeSettingsTab === "vehicles" ? "autó" : "eszköz";
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? `${title[0].toUpperCase() + title.slice(1)} szerkesztése` : `Új ${title}`}</h3><label>Név<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="100"></label><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list)}`;
    } else if (activeSettingsTab === "customers") {
      container.innerHTML = customerDirectorySettingsHTML();
    } else {
      const template = editing || { name: "", toolIds: [], materials: [], steps: [] };
      const toolNames = template.toolIds.map(id => byId(data.tools, id)?.name).filter(Boolean).join(", ");
      const materialLines = template.materials.map(item => [item.source, item.name, item.unit].join(" | ")).join("\n");
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Sablon szerkesztése" : "Új feladatsablon"}</h3><label>Név<input class="form-control" id="settingName" value="${escapeHTML(template.name)}" maxlength="120"></label><label>Alapértelmezett eszközök vesszővel elválasztva<input class="form-control" id="settingTools" value="${escapeHTML(toolNames)}" placeholder="például: lapát, gereblye"></label><label>Anyagok – soronként: beszerzés helye | megnevezés | mértékegység<textarea class="form-control" id="settingMaterials" rows="3">${escapeHTML(materialLines)}</textarea></label><label>Kivitelezési tudnivalók – soronként egy lépés<textarea class="form-control" id="settingSteps" rows="5">${escapeHTML(template.steps.join("\n"))}</textarea></label><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => `${item.steps?.length || 0} lépés • ${item.toolIds?.length || 0} eszköz`)}`;
    }
  }
  function saveRecurringEditor() {
    const value = $("#recurringCustomer")?.value.trim() || ""; const separator = value.indexOf("|");
    const customerName = (separator >= 0 ? value.slice(0, separator) : value).trim(); const address = (separator >= 0 ? value.slice(separator + 1) : "").trim();
    const template = byId(data.templates, $("#recurringTemplate")?.value); let startDate = $("#recurringStart")?.value; let endDate = $("#recurringEnd")?.value;
    if (!customerName || !address) { toast("Válassz ügyfelet és címet a listából.", true); return; }
    if (!template) { toast("Válassz feladatot.", true); return; }
    const frequency = $("#recurringFrequency")?.value || "weekly";
    const customDates = [...document.querySelectorAll("#recurringCustomDateList [data-recurring-date]")].map(button => button.dataset.recurringDate);
    if (frequency === "custom" && !customDates.length) { toast("Adj hozzá legalább egy egyedi dátumot.", true); return; }
    if (frequency === "custom") { customDates.sort(); startDate = customDates[0]; endDate = customDates.at(-1); }
    if (!startDate || !endDate || endDate < startDate) { toast("Ellenőrizd az első és az utolsó napot.", true); return; }
    let item = data.recurrences.find(entry => entry.id === editingSettingsId);
    if (item) removeRecurrence(item.id);
    item = { id: item?.id || uid(), customerName, address, templateId: template.id, jobName: template.name, frequency, weekday: Number($("#recurringWeekday")?.value || 5), monthDay: Number($("#recurringMonthDay")?.value || startDate.slice(8,10)), customDates, startTime: $("#recurringStartTime")?.value || "", startDate, endDate };
    data.recurrences.push(item); materializeRecurrence(item); editingSettingsId = null; cloudConfigDirty = true; markDirty("Ismétlődő tervek elkészítve • mentés szükséges"); renderSettings(); renderWeek(); renderMonth();
    toast("Az ismétlődő feladatok bekerültek a naptárba.");
  }
  function settingsListHTML(list, description = () => "", showWorkerColor = false) {
    const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "hu"));
    const rows = sorted.map(item => {
      const color = validWorkerColor(item.color);
      const detail = description(item);
      return `<div class="settings-row${item.active === false ? " inactive" : ""}" data-settings-row data-search-key="${escapeHTML(searchKey(`${item.name} ${detail}`))}"><div class="settings-item-copy">${showWorkerColor ? `<span class="worker-list-color" style="--worker-list-color:${color}" aria-hidden="true"></span>` : ""}<span><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(detail)}${showWorkerColor ? ` • ${color.toUpperCase()}` : ""}</p></span></div><div class="settings-row-actions"><button class="icon-button" type="button" data-setting-edit="${item.id}" aria-label="Szerkesztés">✎</button><button class="icon-button${item.active === false ? "" : " danger"}" type="button" data-setting-toggle="${item.id}" aria-label="${item.active === false ? "Aktiválás" : "Inaktiválás"}">${item.active === false ? "↺" : "×"}</button></div></div>`;
    }).join("");
    return searchableSettingsListHTML(rows, sorted.length);
  }
  function searchableSettingsListHTML(rows, count, title = "Mentett elemek") {
    return `<details class="settings-saved-list"><summary>${escapeHTML(title)} <span>(${count})</span></summary><div class="settings-search"><label>Keresés a mentett adatok között<input class="form-control" type="search" data-settings-search placeholder="Írj be legalább 2 betűt" autocomplete="off"></label><p data-settings-search-info>Írj be legalább 2 betűt a szűréshez.</p></div><div class="settings-list">${rows}</div><p class="settings-no-results" data-settings-no-results hidden>Nincs találat.</p></details>`;
  }
  function filterSettingsList(input) {
    const details = input.closest(".settings-saved-list");
    const query = searchKey(input.value); const active = query.length >= 2;
    let visible = 0;
    details.querySelectorAll("[data-settings-row]").forEach(row => {
      const matches = !active || row.dataset.searchKey.includes(query);
      row.hidden = !matches; if (matches) visible += 1;
    });
    details.querySelector("[data-settings-search-info]").textContent = active ? `${visible} találat` : "Írj be legalább 2 betűt a szűréshez.";
    details.querySelector("[data-settings-no-results]").hidden = visible > 0;
  }
  function setWorkerColor(color) {
    const normalized = validWorkerColor(color); const input = $("#settingColor"); const output = $("#settingColorCode");
    if (input) input.value = normalized; if (output) output.value = normalized.toUpperCase();
    document.querySelectorAll("[data-worker-color]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.workerColor === normalized)));
  }
  function saveSettingEditor() {
    const list = settingsType(); const existing = list.find(item => item.id === editingSettingsId); const name = $("#settingName")?.value.trim(); if (!name) { toast("A név megadása kötelező.", true); return; }
    const item = existing || { id: uid(), active: true, order: list.length };
    item.name = name;
    if (activeSettingsTab === "workers") { item.color = $("#settingColor").value; item.manager = $("#settingManager").checked; }
    if (activeSettingsTab === "materials") { item.source = $("#settingSource")?.value.trim() || ""; item.unit = $("#settingUnit")?.value.trim() || ""; }
    if (activeSettingsTab === "customers") item.address = $("#settingAddress").value.trim();
    if (activeSettingsTab === "templates") {
      const names = $("#settingTools").value.split(",").map(value => value.trim()).filter(Boolean);
      item.toolIds = names.map(nameValue => {
        let tool = data.tools.find(entry => searchKey(entry.name) === searchKey(nameValue));
        if (!tool) { tool = { id: uid(), name: nameValue, active: true, order: data.tools.length }; data.tools.push(tool); }
        return tool.id;
      });
      item.materials = $("#settingMaterials").value.split(/\r?\n/).map(line => line.split("|").map(value => value.trim())).filter(parts => parts.some(Boolean)).map(([source = "", materialName = "", unit = ""]) => ({ source, name: materialName, quantity: "", unit })).filter(material => material.name);
      item.steps = $("#settingSteps").value.split(/\r?\n/).map(value => value.trim()).filter(value => value && !searchKey(value).includes("munkanaplo"));
    }
    if (!existing) list.push(item); editingSettingsId = null; cloudConfigDirty = true; markDirty("Beállítás módosítva • mentés szükséges"); renderSettings(); renderTasks();
  }
  $("#settingsButton").addEventListener("click", () => { activeSettingsTab = "workers"; editingSettingsId = null; renderSettings(); $("#settingsDialog").showModal(); });
  $("#settingsDialog").addEventListener("click", async event => {
    const tab = event.target.closest("[data-settings-tab]"); if (tab) { activeSettingsTab = tab.dataset.settingsTab; editingSettingsId = null; renderSettings(); return; }
    if (event.target.closest("[data-recurring-submit]")) { saveRecurringEditor(); return; }
    if (event.target.closest("[data-recurring-add-date]")) {
      const input = $("#recurringCustomDate"); const date = input?.value;
      if (!date) { toast("Válassz dátumot.", true); return; }
      const list = $("#recurringCustomDateList");
      if (!list.querySelector(`[data-recurring-date="${date}"]`)) list.insertAdjacentHTML("beforeend", `<button class="btn btn-soft" type="button" data-recurring-date="${date}" title="Dátum eltávolítása">${escapeHTML(formatDate(date, { month:"short", day:"numeric" }))} ×</button>`);
      input.value = ""; return;
    }
    const recurringDate = event.target.closest("[data-recurring-date]"); if (recurringDate) { recurringDate.remove(); return; }
    const recurringEdit = event.target.closest("[data-recurring-edit]"); if (recurringEdit) { editingSettingsId = recurringEdit.dataset.recurringEdit; renderSettings(); return; }
    const recurringDelete = event.target.closest("[data-recurring-delete]");
    if (recurringDelete) {
      if (!confirm("Törlöd ezt az ismétlődő tervet és az általa előre létrehozott napi feladatokat?")) return;
      removeRecurrence(recurringDelete.dataset.recurringDelete); editingSettingsId = null; cloudConfigDirty = true; markDirty("Ismétlődő terv törölve • mentés szükséges"); renderSettings(); renderWeek(); renderMonth(); return;
    }
    const directoryAction = event.target.closest("[data-customer-directory]");
    if (directoryAction?.dataset.customerDirectory === "connect") { openCustomerAuth(); return; }
    if (directoryAction?.dataset.customerDirectory === "refresh") { await syncCustomerDirectory({ notify: true }); return; }
    if (directoryAction?.dataset.customerDirectory === "disconnect") { await window.NapiCustomerDirectory.signOut(); customerDirectory = []; customerDirectoryLastSync = null; customerDirectoryState = "disconnected"; renderSettings(); renderTasks(); toast("Az ügyféllista leválasztva, a helyi gyorsítótár törölve."); return; }
    const colorChoice = event.target.closest("[data-worker-color]"); if (colorChoice) { setWorkerColor(colorChoice.dataset.workerColor); return; }
    if (event.target.closest("[data-setting-submit]")) { saveSettingEditor(); return; }
    const edit = event.target.closest("[data-setting-edit]"); if (edit) { editingSettingsId = edit.dataset.settingEdit; renderSettings(); return; }
    const toggle = event.target.closest("[data-setting-toggle]"); if (toggle) { const item = settingsType().find(entry => entry.id === toggle.dataset.settingToggle); if (item) { item.active = item.active === false; cloudConfigDirty = true; markDirty("Beállítás módosítva • mentés szükséges"); renderSettings(); renderTasks(); } return; }
    const dataAction = event.target.closest("[data-data-action]"); if (dataAction?.dataset.dataAction === "choose") chooseFolder(); if (dataAction?.dataset.dataAction === "download") downloadData();
  });
  $("#settingsDialog").addEventListener("input", event => {
    if (event.target.matches("#settingColor")) setWorkerColor(event.target.value);
    if (event.target.matches("[data-settings-search]")) filterSettingsList(event.target);
  });
  $("#settingsDialog").addEventListener("change", event => {
    if (event.target.matches("[data-data-import]")) importDataFile(event.target.files[0]);
    if (event.target.matches("#recurringFrequency")) {
      const frequency = event.target.value;
      $("[data-recurring-weekday]").hidden = !["weekly", "biweekly"].includes(frequency);
      $("[data-recurring-monthday]").hidden = frequency !== "monthly";
      $("[data-recurring-custom]").hidden = frequency !== "custom";
    }
  });
  $("#settingsSaveButton").addEventListener("click", async event => { event.preventDefault(); try { if (await saveCurrentPlan()) $("#settingsDialog").close(); } catch (error) { $("#saveState").textContent = "Mentési hiba"; toast(`A mentés nem sikerült: ${readableError(error)}`, true); } });

  $("#planDate").addEventListener("change", event => changeDate(event.target.value));
  $("#meetingInput").addEventListener("input", event => { workingPlan.meeting = event.target.value; markDirty(); });
  $("#stopsInput").addEventListener("input", event => { workingPlan.stops = event.target.value; markDirty(); });
  $("#todayButton").addEventListener("click", () => changeDate(isoToday()));
  $("#folderButton").addEventListener("click", chooseFolder); $("#refreshButton").addEventListener("click", refreshApplication);
  $("#downloadButton").addEventListener("click", () => {
    $("#downloadReference").textContent = `A heti, havi és éves mentés alapdátuma: ${formatDate(workingPlan.date)}.`;
    $("#downloadsDialog").showModal();
  });
  $("#downloadsDialog").addEventListener("click", event => {
    const exportButton = event.target.closest("[data-export-period]"); if (exportButton) { exportPeriod(exportButton.dataset.exportPeriod); return; }
    const deleteButton = event.target.closest("[data-delete-period]"); if (deleteButton) deletePeriod(deleteButton.dataset.deletePeriod);
  });
  function appRunsStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function updateInstallButtons() {
    const installed = appRunsStandalone() || localStorage.getItem(INSTALLED_KEY) === "true";
    const available = Boolean(installPrompt);
    $("#quickInstallButton").hidden = installed || !available;
    $("#installAppButton").hidden = installed || !available;
  }
  async function installApplication() {
    if (appRunsStandalone()) { toast("Az alkalmazás már telepítve van ezen az eszközön."); return; }
    if (!installPrompt) { updateInstallButtons(); return; }
    if ($("#downloadsDialog").open) $("#downloadsDialog").close();
    await installPrompt.prompt(); const choice = await installPrompt.userChoice; installPrompt = null;
    if (choice.outcome === "accepted") localStorage.setItem(INSTALLED_KEY, "true");
    updateInstallButtons();
  }
  $("#installAppButton").addEventListener("click", installApplication);
  $("#quickInstallButton").addEventListener("click", installApplication);
  $("#saveButton").addEventListener("click", async () => { try { await saveCurrentPlan(); } catch (error) { $("#saveState").textContent = "Mentési hiba"; toast(`A mentés nem sikerült: ${readableError(error)}`, true); } });
  $("#deleteDayButton").addEventListener("click", () => deleteDay(workingPlan.date));
  $("#downloadDataButton").addEventListener("click", downloadData); $("#openDataInput").addEventListener("change", event => importDataFile(event.target.files[0]));
  document.addEventListener("pointerdown", event => { const button = event.target.closest("[data-tooltip]"); if (button && event.pointerType !== "mouse") button.dataset.tooltipVisible = "true"; });
  ["pointerup", "pointercancel"].forEach(type => document.addEventListener(type, () => document.querySelectorAll("[data-tooltip-visible]").forEach(button => button.removeAttribute("data-tooltip-visible"))));
  document.addEventListener("click", event => event.target.closest("[data-tooltip]")?.removeAttribute("data-tooltip-visible"));
  window.addEventListener("beforeunload", event => { if (!dirty || allowPageReload) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; localStorage.removeItem(INSTALLED_KEY); updateInstallButtons(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; localStorage.setItem(INSTALLED_KEY, "true"); updateInstallButtons(); toast("A Napi feladatok app telepítése sikerült."); });
  function refreshSharedDataSilently({ includeCustomers = false } = {}) {
    if (document.hidden || !navigator.onLine || !window.NapiCustomerDirectory?.hasSession?.()) return;
    if (includeCustomers) syncCustomerDirectory();
    pullSharedData();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSharedDataSilently({ includeCustomers: true }); });
  window.addEventListener("focus", () => refreshSharedDataSilently({ includeCustomers: true }));
  window.addEventListener("pageshow", () => refreshSharedDataSilently({ includeCustomers: true }));
  window.addEventListener("online", () => { if (window.NapiCustomerDirectory?.hasSession?.()) { syncCustomerDirectory(); pullSharedData({ initial: true }).then(() => pushCurrentState()); } });
  setInterval(() => { if (!document.hidden && navigator.onLine && window.NapiCustomerDirectory?.hasSession?.()) syncCustomerDirectory(); }, 120000);
  setInterval(refreshSharedDataSilently, 5000);

  async function initialize() {
    $("#planDate").value = isoToday();
    try {
      const storedData = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY));
      if (storedData) data = normalizeData(storedData);
    } catch (_) { /* Hibás helyi mentést figyelmen kívül hagyunk. */ }
    try {
      if ("showDirectoryPicker" in window) {
        const stored = await readStoredDirectoryHandle();
        if (stored && await hasWritePermission(stored, false)) { directoryHandle = stored; const loaded = await readDataFile(stored); if (loaded) data = loaded; }
      }
    } catch (_) { directoryHandle = null; }
    if (!directoryHandle) {
      try {
        const recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY));
        if (recovery?.data) {
          data = normalizeData(recovery.data);
          const recovered = recovery.workingPlan ? normalizeData({ ...recovery.data, plans: [recovery.workingPlan] }).plans[0] : null;
          workingPlan = recovered || blankPlan(isoToday());
          workingPlan.meeting = typeof workingPlan.meeting === "string" ? workingPlan.meeting : DEFAULT_MEETING;
          workingPlan.stops = typeof workingPlan.stops === "string" ? workingPlan.stops : DEFAULT_STOPS;
          $("#planDate").value = workingPlan.date; $("#meetingInput").value = workingPlan.meeting; $("#stopsInput").value = workingPlan.stops; dirty = true;
        }
      } catch (_) { /* Hibás helyreállítási adatot figyelmen kívül hagyunk. */ }
    }
    updateStorageStatus();
    if (!dirty) loadPlan($("#planDate").value); else { renderTasks(); $("#saveState").textContent = "Helyreállított piszkozat • mentés szükséges"; }
    renderWeek();
    renderMonth();
    if (navigator.onLine && window.NapiCustomerDirectory?.hasSession?.()) { await syncCustomerDirectory(); await pullSharedData({ initial: true }); if (pendingCloudDeletedDates.size) await pushCurrentState(); }
    if (appRunsStandalone()) localStorage.setItem(INSTALLED_KEY, "true");
    updateInstallButtons();
    if ("serviceWorker" in navigator) {
      let reloadingForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", async () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        if (dirty && navigator.onLine && window.NapiCustomerDirectory?.hasSession?.()) {
          await waitForCurrentCloudSync();
          await pullSharedData();
          saveDataLocally();
          await pushCurrentState();
        }
        allowPageReload = true;
        window.location.reload();
      });
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(registration => {
        registration.update();
        setInterval(() => { if (!document.hidden && navigator.onLine) registration.update(); }, 60000);
      }).catch(() => {});
    }
  }
  initialize();
})();
