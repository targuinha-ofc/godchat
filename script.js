const API_BASE = "https://thebibleapi.netlify.app/.netlify/functions";
const TRANSLATION = "almeida";

const verseButton = document.querySelector("#verseButton");
const verseButtonLabel = document.querySelector("#verseButtonLabel");
const verseText = document.querySelector("#verseText");
const verseReference = document.querySelector("#verseReference");
const verseStatus = document.querySelector("#verseStatus");

let booksCache = null;

const bookNamesPtBr = {
  Genesis: "G\u00eanesis",
  Exodus: "\u00caxodo",
  Leviticus: "Lev\u00edtico",
  Numbers: "N\u00fameros",
  Deuteronomy: "Deuteron\u00f4mio",
  Joshua: "Josu\u00e9",
  Judges: "Ju\u00edzes",
  Ruth: "Rute",
  "1 Samuel": "1 Samuel",
  "2 Samuel": "2 Samuel",
  "1 Kings": "1 Reis",
  "2 Kings": "2 Reis",
  "1 Chronicles": "1 Cr\u00f4nicas",
  "2 Chronicles": "2 Cr\u00f4nicas",
  Ezra: "Esdras",
  Nehemiah: "Neemias",
  Esther: "Ester",
  Job: "J\u00f3",
  Psalm: "Salmos",
  Psalms: "Salmos",
  Proverbs: "Prov\u00e9rbios",
  Ecclesiastes: "Eclesiastes",
  "Song of Solomon": "C\u00e2nticos",
  "Song of Songs": "C\u00e2nticos",
  Isaiah: "Isa\u00edas",
  Jeremiah: "Jeremias",
  Lamentations: "Lamenta\u00e7\u00f5es",
  Ezekiel: "Ezequiel",
  Daniel: "Daniel",
  Hosea: "Os\u00e9ias",
  Joel: "Joel",
  Amos: "Am\u00f3s",
  Obadiah: "Obadias",
  Jonah: "Jonas",
  Micah: "Miqu\u00e9ias",
  Nahum: "Naum",
  Habakkuk: "Habacuque",
  Zephaniah: "Sofonias",
  Haggai: "Ageu",
  Zechariah: "Zacarias",
  Malachi: "Malaquias",
  Matthew: "Mateus",
  Mark: "Marcos",
  Luke: "Lucas",
  John: "Jo\u00e3o",
  Acts: "Atos",
  Romans: "Romanos",
  "1 Corinthians": "1 Cor\u00edntios",
  "2 Corinthians": "2 Cor\u00edntios",
  Galatians: "G\u00e1latas",
  Ephesians: "Ef\u00e9sios",
  Philippians: "Filipenses",
  Colossians: "Colossenses",
  "1 Thessalonians": "1 Tessalonicenses",
  "2 Thessalonians": "2 Tessalonicenses",
  "1 Timothy": "1 Tim\u00f3teo",
  "2 Timothy": "2 Tim\u00f3teo",
  Titus: "Tito",
  Philemon: "Filemom",
  Hebrews: "Hebreus",
  James: "Tiago",
  "1 Peter": "1 Pedro",
  "2 Peter": "2 Pedro",
  "1 John": "1 Jo\u00e3o",
  "2 John": "2 Jo\u00e3o",
  "3 John": "3 Jo\u00e3o",
  Jude: "Judas",
  Revelation: "Apocalipse"
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getBookNamePtBr(bookName) {
  return bookNamesPtBr[bookName] || bookName;
}

function setLoading(isLoading) {
  verseButton.disabled = isLoading;
  verseButton.setAttribute("aria-busy", String(isLoading));
  verseButtonLabel.textContent = isLoading ? "Buscando vers\u00edculo..." : "Mostrar vers\u00edculo";
}

function setStatus(message, tone = "neutral") {
  verseStatus.textContent = message;
  verseStatus.dataset.tone = tone;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Resposta ${response.status}`);
  }

  return response.json();
}

async function getBooks() {
  if (booksCache) {
    return booksCache;
  }

  const url = `${API_BASE}/getBooks?translation=${TRANSLATION}`;
  const data = await fetchJson(url);
  const books = Array.isArray(data.books) ? data.books : [];

  if (!books.length) {
    throw new Error("Nenhum livro retornado pela API.");
  }

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

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const book = randomItem(books);
    const chapter = Math.floor(Math.random() * Number(book.chapters)) + 1;
    const chapterData = await getChapter(book, chapter);
    const verses = Array.isArray(chapterData.verses) ? chapterData.verses : [];
    const availableVerses = verses
      .map((item, index) => {
        const text = typeof item === "object" && item !== null ? item.text : item;
        const verseNumber = typeof item === "object" && item !== null && item.verse ? item.verse : index + 1;

        return {
          text: String(text || "").trim(),
          verse: verseNumber
        };
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

  throw new Error("Nao foi possivel encontrar um versiculo neste momento.");
}

async function showRandomVerse() {
  setLoading(true);
  verseText.textContent = "Buscando uma palavra para este momento...";
  verseReference.textContent = "Aguarde";
  setStatus("Sorteando livro, cap\u00edtulo e vers\u00edculo.", "neutral");

  try {
    const verse = await getRandomVerse();

    verseText.textContent = verse.text;
    verseReference.textContent = `${verse.book} ${verse.chapter}:${verse.verse}`;
    setStatus("Vers\u00edculo sorteado em portugu\u00eas do Brasil.", "success");
  } catch (error) {
    verseText.textContent = "N\u00e3o consegui buscar um vers\u00edculo agora. Verifique sua internet e tente novamente.";
    verseReference.textContent = "Fonte online indispon\u00edvel. Tente novamente em alguns instantes.";
    setStatus("A API n\u00e3o respondeu corretamente, mas a p\u00e1gina continua funcionando.", "error");
  } finally {
    setLoading(false);
  }
}

function setupTabs(tabSelector, panelSelector, targetKey) {
  const tabs = Array.from(document.querySelectorAll(tabSelector));
  const panels = Array.from(document.querySelectorAll(panelSelector));

  if (!tabs.length || !panels.length) {
    return;
  }

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

setupTabs(".saint-tab", ".saint-panel", "saint");
setupTabs(".study-tab", ".study-panel", "topic");
verseButton.addEventListener("click", showRandomVerse);
