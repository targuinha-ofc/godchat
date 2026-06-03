const API_BASE = "https://thebibleapi.netlify.app/.netlify/functions";
const TRANSLATION = "almeida";

const verseButton = document.querySelector("#verseButton");
const verseButtonLabel = document.querySelector("#verseButtonLabel");
const verseText = document.querySelector("#verseText");
const verseReference = document.querySelector("#verseReference");
const verseStatus = document.querySelector("#verseStatus");

let booksCache = null;

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
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
      .map((text, index) => ({
        text: String(text || "").trim(),
        verse: index + 1
      }))
      .filter((verse) => verse.text.length > 0);

    if (availableVerses.length) {
      const pickedVerse = randomItem(availableVerses);

      return {
        book: chapterData.book || book.name,
        chapter,
        verse: pickedVerse.verse,
        text: pickedVerse.text,
        translation: "Jo\u00e3o Ferreira de Almeida"
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
    setStatus(`Tradu\u00e7\u00e3o: ${verse.translation}.`, "success");
  } catch (error) {
    verseText.textContent = "N\u00e3o consegui buscar um vers\u00edculo agora. Verifique sua internet e tente novamente.";
    verseReference.textContent = "Fonte online indispon\u00edvel. Tente novamente em alguns instantes.";
    setStatus("A API n\u00e3o respondeu corretamente, mas a p\u00e1gina continua funcionando.", "error");
  } finally {
    setLoading(false);
  }
}

verseButton.addEventListener("click", showRandomVerse);
