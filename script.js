const API_BASE = "https://thebibleapi.netlify.app/.netlify/functions";
const TRANSLATION = "almeida";

const verseButton     = document.querySelector("#verseButton");
const verseButtonLabel= document.querySelector("#verseButtonLabel");
const verseText       = document.querySelector("#verseText");
const verseReference  = document.querySelector("#verseReference");
const verseStatus     = document.querySelector("#verseStatus");
const heroSlides      = Array.from(document.querySelectorAll(".hero-slide"));
const chatForm        = document.querySelector("#faithChatForm");
const chatMessages    = document.querySelector("#faithChatMessages");
const chatInput       = document.querySelector("#faithChatInput");
const chatButton      = document.querySelector("#faithChatButton");
const chatStatus      = document.querySelector("#faithChatStatus");
const chatProvider    = document.querySelector("#faithChatProvider");

let booksCache = null;
const chatHistory = [];

const bookNamesPtBr = {
  Genesis:"Gênesis",Exodus:"Êxodo",Leviticus:"Levítico",Numbers:"Números",
  Deuteronomy:"Deuteronômio",Joshua:"Josué",Judges:"Juízes",Ruth:"Rute",
  "1 Samuel":"1 Samuel","2 Samuel":"2 Samuel","1 Kings":"1 Reis","2 Kings":"2 Reis",
  "1 Chronicles":"1 Crônicas","2 Chronicles":"2 Crônicas",Ezra:"Esdras",
  Nehemiah:"Neemias",Esther:"Ester",Job:"Jó",Psalm:"Salmos",Psalms:"Salmos",
  Proverbs:"Provérbios",Ecclesiastes:"Eclesiastes","Song of Solomon":"Cânticos",
  "Song of Songs":"Cânticos",Isaiah:"Isaías",Jeremiah:"Jeremias",
  Lamentations:"Lamentações",Ezekiel:"Ezequiel",Daniel:"Daniel",Hosea:"Oséias",
  Joel:"Joel",Amos:"Amós",Obadiah:"Obadias",Jonah:"Jonas",Micah:"Miquéias",
  Nahum:"Naum",Habakkuk:"Habacuque",Zephaniah:"Sofonias",Haggai:"Ageu",
  Zechariah:"Zacarias",Malachi:"Malaquias",Matthew:"Mateus",Mark:"Marcos",
  Luke:"Lucas",John:"João",Acts:"Atos",Romans:"Romanos",
  "1 Corinthians":"1 Coríntios","2 Corinthians":"2 Coríntios",Galatians:"Gálatas",
  Ephesians:"Efésios",Philippians:"Filipenses",Colossians:"Colossenses",
  "1 Thessalonians":"1 Tessalonicenses","2 Thessalonians":"2 Tessalonicenses",
  "1 Timothy":"1 Timóteo","2 Timothy":"2 Timóteo",Titus:"Tito",Philemon:"Filemom",
  Hebrews:"Hebreus",James:"Tiago","1 Peter":"1 Pedro","2 Peter":"2 Pedro",
  "1 John":"1 João","2 John":"2 João","3 John":"3 João",Jude:"Judas",
  Revelation:"Apocalipse"
};

// ─── HERO SLIDESHOW ──────────────────────────────────────────────────────────
function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }

function getSlideImageUrl(slide) {
  const v = getComputedStyle(slide).getPropertyValue("--hero-image").trim();
  const m = v.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : "";
}

function preloadHeroSlides() {
  heroSlides.forEach((slide) => {
    const url = getSlideImageUrl(slide);
    if (url) { const img = new Image(); img.src = url; }
  });
}

function setupHeroSlideshow() {
  if (heroSlides.length < 2) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let idx = heroSlides.findIndex((s) => s.classList.contains("is-active"));
  if (idx < 0) { idx = 0; heroSlides[0].classList.add("is-active"); }
  preloadHeroSlides();
  if (reduced) return;
  window.setInterval(() => {
    const next = (idx + 1) % heroSlides.length;
    heroSlides[idx].classList.remove("is-active");
    heroSlides[next].classList.add("is-active");
    idx = next;
  }, 6500);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getBookNamePtBr(name) { return bookNamesPtBr[name] || name; }

function setLoading(loading) {
  verseButton.disabled = loading;
  verseButton.setAttribute("aria-busy", String(loading));
  verseButtonLabel.textContent = loading ? "Buscando versículo..." : "Mostrar versículo";
}

function setStatus(msg, tone = "neutral") {
  verseStatus.textContent = msg;
  verseStatus.dataset.tone = tone;
}

function setChatStatus(msg, tone = "neutral") {
  if (!chatStatus) return;
  chatStatus.textContent = msg;
  chatStatus.dataset.tone = tone;
}

function setChatLoading(loading) {
  if (!chatButton || !chatInput) return;
  chatButton.disabled = loading;
  chatButton.textContent = loading ? "Orando..." : "Enviar";
  chatInput.disabled = loading;
  chatForm.setAttribute("aria-busy", String(loading));
}

function createChatParagraphs(text) {
  const frag = document.createDocumentFragment();
  const paras = String(text || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  (paras.length ? paras : [""]).forEach((para) => {
    const p = document.createElement("p");
    p.textContent = para;
    frag.appendChild(p);
  });
  return frag;
}

function addChatMessage(role, text) {
  if (!chatMessages) return;
  const msg = document.createElement("div");
  msg.className = `chat-message chat-message-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "V" : "✝";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.appendChild(createChatParagraphs(text));

  msg.append(avatar, bubble);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
async function loadChatStatus() {
  try {
    const res = await fetch("/api/chat/status");
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (chatProvider) chatProvider.textContent = data.providerLabel || "IA";
    setChatStatus(
      data.ready ? "Chat pronto para responder." : "Configure a chave de IA nas variáveis do Vercel.",
      data.ready ? "success" : "error"
    );
  } catch {
    setChatStatus("Não foi possível verificar o status do chat.", "error");
  }
}

async function sendFaithChatMessage(event) {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message) {
    setChatStatus("Escreva uma mensagem antes de enviar.", "error");
    return;
  }

  chatInput.value = "";
  addChatMessage("user", message);
  chatHistory.push({ role: "user", content: message });
  setChatLoading(true);
  setChatStatus("Buscando uma resposta com serenidade...", "neutral");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory.slice(-10) })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Não foi possível responder agora.");
    }

    const answer = data.answer || "Não consegui formar uma resposta. Tente novamente.";
    addChatMessage("assistant", answer);
    chatHistory.push({ role: "assistant", content: answer });

    if (chatProvider && data.providerLabel) chatProvider.textContent = data.providerLabel;
    setChatStatus("Resposta recebida.", "success");
  } catch (err) {
    const msg = err.message && err.message !== "Failed to fetch"
      ? err.message
      : "Erro de conexão. Verifique se a chave de IA foi configurada nas variáveis do Vercel.";
    addChatMessage("assistant", "Não consegui responder agora. " + msg);
    setChatStatus(msg, "error");
  } finally {
    setChatLoading(false);
    chatInput.focus();
  }
}

// ─── VERSÍCULO ───────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Resposta ${res.status}`);
  return res.json();
}

async function getBooks() {
  if (booksCache) return booksCache;
  const data = await fetchJson(`${API_BASE}/getBooks?translation=${TRANSLATION}`);
  const books = Array.isArray(data.books) ? data.books : [];
  if (!books.length) throw new Error("Nenhum livro retornado pela API.");
  booksCache = books.filter((b) => b.name && Number(b.chapters) > 0);
  return booksCache;
}

async function getChapter(book, chapter) {
  const params = new URLSearchParams({ book: book.name, chapter: String(chapter), translation: TRANSLATION });
  return fetchJson(`${API_BASE}/getChapter?${params}`);
}

async function getRandomVerse() {
  const books = await getBooks();
  for (let attempt = 0; attempt < 8; attempt++) {
    const book = randomItem(books);
    const chapter = Math.floor(Math.random() * Number(book.chapters)) + 1;
    const data = await getChapter(book, chapter);
    const verses = Array.isArray(data.verses) ? data.verses : [];
    const available = verses
      .map((item, idx) => {
        const text = typeof item === "object" && item !== null ? item.text : item;
        const verse = typeof item === "object" && item !== null && item.verse ? item.verse : idx + 1;
        return { text: String(text || "").trim(), verse };
      })
      .filter((v) => v.text.length > 0);
    if (available.length) {
      const picked = randomItem(available);
      return { book: getBookNamePtBr(data.book || book.name), chapter, verse: picked.verse, text: picked.text };
    }
  }
  throw new Error("Não foi possível encontrar um versículo neste momento.");
}

async function showRandomVerse() {
  setLoading(true);
  verseText.textContent = "Buscando uma palavra para este momento...";
  verseReference.textContent = "Aguarde";
  setStatus("Sorteando livro, capítulo e versículo.", "neutral");
  try {
    const v = await getRandomVerse();
    verseText.textContent = v.text;
    verseReference.textContent = `${v.book} ${v.chapter}:${v.verse}`;
    setStatus("Versículo sorteado em português do Brasil.", "success");
  } catch {
    verseText.textContent = "Não consegui buscar um versículo agora. Verifique sua internet e tente novamente.";
    verseReference.textContent = "Fonte online indisponível.";
    setStatus("A API não respondeu corretamente, mas a página continua funcionando.", "error");
  } finally {
    setLoading(false);
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function setupTabs(tabSel, panelSel, key) {
  const tabs   = Array.from(document.querySelectorAll(tabSel));
  const panels = Array.from(document.querySelectorAll(panelSel));
  if (!tabs.length || !panels.length) return;

  function activate(tab) {
    const target = tab.dataset[key];
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => {
      const on = p.dataset.panel === target;
      p.classList.toggle("active", on);
      p.toggleAttribute("hidden", !on);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      const cur  = tabs.indexOf(tab);
      const last = tabs.length - 1;
      let next   = cur;
      if      (e.key === "ArrowRight" || e.key === "ArrowDown") next = cur === last ? 0 : cur + 1;
      else if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   next = cur === 0 ? last : cur - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End")  next = last;
      else return;
      e.preventDefault();
      tabs[next].focus();
      activate(tabs[next]);
    });
  });

  activate(tabs.find((t) => t.classList.contains("active")) || tabs[0]);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
setupHeroSlideshow();
setupTabs(".saint-tab",  ".saint-panel",  "saint");
setupTabs(".study-tab",  ".study-panel",  "topic");
verseButton.addEventListener("click", showRandomVerse);
if (chatForm) {
  chatForm.addEventListener("submit", sendFaithChatMessage);
  loadChatStatus();
}
