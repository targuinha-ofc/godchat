const API_BASE = "https://thebibleapi.netlify.app/.netlify/functions";
const TRANSLATION = "almeida";

const verseButton = document.querySelector("#verseButton");
const verseButtonLabel = document.querySelector("#verseButtonLabel");
const verseText = document.querySelector("#verseText");
const verseReference = document.querySelector("#verseReference");
const verseStatus = document.querySelector("#verseStatus");
const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
const chatForm = document.querySelector("#faithChatForm");
const chatMessages = document.querySelector("#faithChatMessages");
const chatInput = document.querySelector("#faithChatInput");
const chatButton = document.querySelector("#faithChatButton");
const chatStatus = document.querySelector("#faithChatStatus");
const chatProvider = document.querySelector("#faithChatProvider");

let booksCache = null;
const chatHistory = [];

const CHRISTIAN_SYSTEM_PROMPT = `
Você é o GODCHAT, um assistente de conversa espiritual cristão católico, em português do Brasil.

Missão:
- Responder com fé cristã, caridade, humildade, reverência, esperança e fidelidade à tradição católica.
- Ajudar a pessoa a rezar, discernir, ler a Bíblia, procurar os sacramentos, praticar a caridade e aproximar-se de Jesus Cristo.
- Usar referências bíblicas curtas e naturais quando ajudarem, sem despejar textos longos.
- Encerrar, quando fizer sentido, com uma pequena oração ou convite prático.

Limites importantes:
- Nunca diga que você é Deus, Jesus Cristo, o Espírito Santo, Nossa Senhora, um anjo ou um santo.
- Nunca afirme falar em nome de Deus de forma direta, como profecia, revelação privada ou garantia divina.
- Se a pessoa pedir "responda como Deus", responda com delicadeza que uma IA não substitui a voz de Deus, mas pode oferecer uma palavra cristã para levar à oração.
- Não substitua padre, diretor espiritual, médico, psicólogo, advogado ou autoridade competente.
- Em risco de autoagressão, violência, abuso, emergência médica ou desespero extremo, incentive ajuda humana imediata e serviços de emergência locais.
- Seja firme na fé, mas nunca cruel, humilhante, manipulador ou condenatório.

Estilo:
- Tom pastoral, sereno, simples e profundamente cristão.
- Pode tratar a pessoa como irmão/irmã, filho/filha na fé, com delicadeza.
- Respostas de 2 a 5 parágrafos, a menos que a pessoa peça algo longo.
`.trim();

const bookNamesPtBr = {
  Genesis: "Gênesis",
  Exodus: "Êxodo",
  Leviticus: "Levítico",
  Numbers: "Números",
  Deuteronomy: "Deuteronômio",
  Joshua: "Josué",
  Judges: "Juízes",
  Ruth: "Rute",
  "1 Samuel": "1 Samuel",
  "2 Samuel": "2 Samuel",
  "1 Kings": "1 Reis",
  "2 Kings": "2 Reis",
  "1 Chronicles": "1 Crônicas",
  "2 Chronicles": "2 Crônicas",
  Ezra: "Esdras",
  Nehemiah: "Neemias",
  Esther: "Ester",
  Job: "Jó",
  Psalm: "Salmos",
  Psalms: "Salmos",
  Proverbs: "Provérbios",
  Ecclesiastes: "Eclesiastes",
  "Song of Solomon": "Cânticos",
  "Song of Songs": "Cânticos",
  Isaiah: "Isaías",
  Jeremiah: "Jeremias",
  Lamentations: "Lamentações",
  Ezekiel: "Ezequiel",
  Daniel: "Daniel",
  Hosea: "Oséias",
  Joel: "Joel",
  Amos: "Amós",
  Obadiah: "Obadias",
  Jonah: "Jonas",
  Micah: "Miquéias",
  Nahum: "Naum",
  Habakkuk: "Habacuque",
  Zephaniah: "Sofonias",
  Haggai: "Ageu",
  Zechariah: "Zacarias",
  Malachi: "Malaquias",
  Matthew: "Mateus",
  Mark: "Marcos",
  Luke: "Lucas",
  John: "João",
  Acts: "Atos",
  Romans: "Romanos",
  "1 Corinthians": "1 Coríntios",
  "2 Corinthians": "2 Coríntios",
  Galatians: "Gálatas",
  Ephesians: "Efésios",
  Philippians: "Filipenses",
  Colossians: "Colossenses",
  "1 Thessalonians": "1 Tessalonicenses",
  "2 Thessalonians": "2 Tessalonicenses",
  "1 Timothy": "1 Timóteo",
  "2 Timothy": "2 Timóteo",
  Titus: "Tito",
  Philemon: "Filemom",
  Hebrews: "Hebreus",
  James: "Tiago",
  "1 Peter": "1 Pedro",
  "2 Peter": "2 Pedro",
  "1 John": "1 João",
  "2 John": "2 João",
  "3 John": "3 João",
  Jude: "Judas",
  Revelation: "Apocalipse"
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getSlideImageUrl(slide) {
  const imageValue = getComputedStyle(slide).getPropertyValue("--hero-image").trim();
  const imageMatch = imageValue.match(/url\(["']?(.*?)["']?\)/);
  return imageMatch ? imageMatch[1] : "";
}

function preloadHeroSlides() {
  heroSlides.forEach((slide) => {
    const imageUrl = getSlideImageUrl(slide);
    if (imageUrl) {
      const image = new Image();
      image.src = imageUrl;
    }
  });
}

function setupHeroSlideshow() {
  if (heroSlides.length < 2) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = heroSlides.findIndex((slide) => slide.classList.contains("is-active"));

  if (activeIndex < 0) {
    activeIndex = 0;
    heroSlides[activeIndex].classList.add("is-active");
  }

  preloadHeroSlides();
  if (prefersReducedMotion) return;

  window.setInterval(() => {
    const nextIndex = (activeIndex + 1) % heroSlides.length;
    heroSlides[activeIndex].classList.remove("is-active");
    heroSlides[nextIndex].classList.add("is-active");
    activeIndex = nextIndex;
  }, 6500);
}

function getBookNamePtBr(bookName) {
  return bookNamesPtBr[bookName] || bookName;
}

function setLoading(isLoading) {
  verseButton.disabled = isLoading;
  verseButton.setAttribute("aria-busy", String(isLoading));
  verseButtonLabel.textContent = isLoading ? "Buscando versículo..." : "Mostrar versículo";
}

function setStatus(message, tone = "neutral") {
  verseStatus.textContent = message;
  verseStatus.dataset.tone = tone;
}

function setChatStatus(message, tone = "neutral") {
  if (!chatStatus) return;
  chatStatus.textContent = message;
  chatStatus.dataset.tone = tone;
}

function setChatLoading(isLoading) {
  if (!chatButton || !chatInput) return;
  chatButton.disabled = isLoading;
  chatButton.textContent = isLoading ? "Orando..." : "Enviar";
  chatInput.disabled = isLoading;
  chatForm.setAttribute("aria-busy", String(isLoading));
}

function createChatParagraphs(text) {
  const fragment = document.createDocumentFragment();
  const paragraphs = String(text || "").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);

  (paragraphs.length ? paragraphs : [""]).forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    fragment.appendChild(p);
  });

  return fragment;
}

function addChatMessage(role, text) {
  if (!chatMessages) return;

  const message = document.createElement("div");
  message.className = `chat-message chat-message-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "V" : "✝";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.appendChild(createChatParagraphs(text));

  message.append(avatar, bubble);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── ANTHROPIC API CALL (direct from browser) ──────────────────────────────
async function callAnthropicAPI(messages) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: CHRISTIAN_SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").trim()
      }))
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errMsg = data.error && data.error.message ? data.error.message : "Erro ao chamar a IA.";
    throw new Error(errMsg);
  }

  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    : "";

  if (!text) throw new Error("A IA não retornou resposta.");
  return text;
}

// ─── CHAT: try server first, fall back to direct Anthropic API ──────────────
async function loadChatStatus() {
  try {
    const response = await fetch("/api/chat/status");
    if (!response.ok) throw new Error("Servidor indisponível");
    const data = await response.json();
    if (chatProvider) chatProvider.textContent = data.providerLabel || "IA cristã";
    setChatStatus(
      data.ready ? "Chat pronto para responder." : "Usando Claude diretamente.",
      "success"
    );
  } catch {
    if (chatProvider) chatProvider.textContent = "Claude";
    setChatStatus("Chat pronto via Claude.", "success");
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
    let answer = null;
    let providerLabel = "Claude";

    // 1. Tenta o servidor local primeiro
    try {
      const serverResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory.slice(-10) })
      });

      const serverData = await serverResponse.json().catch(() => ({}));

      if (serverResponse.ok && serverData.answer) {
        answer = serverData.answer;
        providerLabel = serverData.providerLabel || "Servidor";
      }
    } catch {
      // Servidor não disponível — segue para fallback
    }

    // 2. Fallback direto para a API da Anthropic
    if (!answer) {
      answer = await callAnthropicAPI(chatHistory.slice(-10));
      providerLabel = "Claude";
    }

    addChatMessage("assistant", answer);
    chatHistory.push({ role: "assistant", content: answer });

    if (chatProvider) chatProvider.textContent = providerLabel;
    setChatStatus("Resposta recebida.", "success");
  } catch (error) {
    const fallback = "Não consegui me conectar no momento. Por favor, verifique sua conexão e tente novamente.";
    addChatMessage("assistant", fallback);
    setChatStatus(error.message || "Erro ao chamar a IA.", "error");
  } finally {
    setChatLoading(false);
    chatInput.focus();
  }
}

// ─── VERSÍCULO ──────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Resposta ${response.status}`);
  return response.json();
}

async function getBooks() {
  if (booksCache) return booksCache;
  const url = `${API_BASE}/getBooks?translation=${TRANSLATION}`;
  const data = await fetchJson(url);
  const books = Array.isArray(data.books) ? data.books : [];
  if (!books.length) throw new Error("Nenhum livro retornado pela API.");
  booksCache = books.filter((book) => book.name && Number(book.chapters) > 0);
  return booksCache;
}

async function getChapter(book, chapter) {
  const params = new URLSearchParams({
    book: book.name,
    chapter: String(chapter),
    translation: TRANSLATION
  });
  return fetchJson(`${API_BASE}/getChapter?${params.toString()}`);
}

async function getRandomVerse() {
  const books = await getBooks();

  for (let attempt = 0; attempt < 8; attempt++) {
    const book = randomItem(books);
    const chapter = Math.floor(Math.random() * Number(book.chapters)) + 1;
    const chapterData = await getChapter(book, chapter);
    const verses = Array.isArray(chapterData.verses) ? chapterData.verses : [];
    const availableVerses = verses
      .map((item, index) => {
        const text = typeof item === "object" && item !== null ? item.text : item;
        const verseNumber = typeof item === "object" && item !== null && item.verse ? item.verse : index + 1;
        return { text: String(text || "").trim(), verse: verseNumber };
      })
      .filter((verse) => verse.text.length > 0);

    if (availableVerses.length) {
      const pickedVerse = randomItem(availableVerses);
      return {
        book: getBookNamePtBr(chapterData.book || book.name),
        chapter,
        verse: pickedVerse.verse,
        text: pickedVerse.text
      };
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
    const verse = await getRandomVerse();
    verseText.textContent = verse.text;
    verseReference.textContent = `${verse.book} ${verse.chapter}:${verse.verse}`;
    setStatus("Versículo sorteado em português do Brasil.", "success");
  } catch (error) {
    verseText.textContent = "Não consegui buscar um versículo agora. Verifique sua internet e tente novamente.";
    verseReference.textContent = "Fonte online indisponível. Tente novamente em alguns instantes.";
    setStatus("A API não respondeu corretamente, mas a página continua funcionando.", "error");
  } finally {
    setLoading(false);
  }
}

// ─── TABS ───────────────────────────────────────────────────────────────────
function setupTabs(tabSelector, panelSelector, targetKey) {
  const tabs = Array.from(document.querySelectorAll(tabSelector));
  const panels = Array.from(document.querySelectorAll(panelSelector));

  if (!tabs.length || !panels.length) return;

  function activateTab(selectedTab) {
    const target = selectedTab.dataset[targetKey];
    tabs.forEach((tab) => {
      const isActive = tab === selectedTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => {
      const isActive = panel.dataset.panel === target;
      panel.classList.toggle("active", isActive);
      panel.toggleAttribute("hidden", !isActive);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      const currentIndex = tabs.indexOf(tab);
      const lastIndex = tabs.length - 1;
      let nextIndex = currentIndex;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      } else {
        return;
      }

      event.preventDefault();
      tabs[nextIndex].focus();
      activateTab(tabs[nextIndex]);
    });
  });

  activateTab(tabs.find((tab) => tab.classList.contains("active")) || tabs[0]);
}

// ─── INIT ───────────────────────────────────────────────────────────────────
setupHeroSlideshow();
setupTabs(".saint-tab", ".saint-panel", "saint");
setupTabs(".study-tab", ".study-panel", "topic");
verseButton.addEventListener("click", showRandomVerse);
if (chatForm) {
  chatForm.addEventListener("submit", sendFaithChatMessage);
  loadChatStatus();
}
