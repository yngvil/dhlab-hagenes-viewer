const MANIFEST_PATH = "./data/manifest.json";
const TEI_TRANSLATION_PATH = "./data/hagenes.translation-template.tei.xml";

const FALLBACK_MANIFEST = {
  title: "Hagenesmanuskriptet",
  pages: [
    {
      id: "0002",
      label: "Side 2",
      image: "./data/images/no-nb_digimanus_398864_0002.jpg",
    },
    {
      id: "0003",
      label: "Side 3",
      image: "./data/images/no-nb_digimanus_398864_0003.jpg",
    },
    {
      id: "0004",
      label: "Side 4",
      image: "./data/images/no-nb_digimanus_398864_0004.jpg",
    },
    {
      id: "0005",
      label: "Side 5",
      image: "./data/images/no-nb_digimanus_398864_0005.jpg",
    },
    {
      id: "0006",
      label: "Side 6",
      image: "./data/images/no-nb_digimanus_398864_0006.jpg",
    },
  ],
};

const pageImage = document.getElementById("page-image");
const textGrid = document.getElementById("text-grid");
const pageIndicator = document.getElementById("page-indicator");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const openInfoBtn = document.getElementById("open-info");
const pickTeiBtn = document.getElementById("pick-tei");
const teiFileInput = document.getElementById("tei-file");
const dataStatus = document.getElementById("data-status");
const imageOverlay = document.getElementById("image-overlay");
const overlayImage = document.getElementById("overlay-image");
const closeOverlayBtn = document.getElementById("close-overlay");
const infoOverlay = document.getElementById("info-overlay");
const closeInfoBtn = document.getElementById("close-info");

let manifest = null;
let currentIndex = 0;
let teiContentByPageId = new Map();

function countTranslatedSegments(pageMap) {
  let total = 0;
  let translated = 0;
  pageMap.forEach((regions) => {
    regions.forEach((region) => {
      region.sentences.forEach((sentence) => {
        total += 1;
        if (sentence.no) translated += 1;
      });
    });
  });
  return { total, translated };
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isTypingTarget(node) {
  if (!node) return false;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function getXmlAttr(el, localName) {
  return (
    el.getAttribute(`xml:${localName}`) ||
    el.getAttributeNS("http://www.w3.org/XML/1998/namespace", localName)
  );
}

function parseTeiContent(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("Kunne ikke parse TEI");
  }

  const pageMap = new Map();
  const pageDivs = Array.from(xml.getElementsByTagNameNS("*", "div")).filter(
    (div) => div.getAttribute("type") === "page"
  );

  pageDivs.forEach((pageDiv) => {
    const pageXmlId = getXmlAttr(pageDiv, "id") || "";
    const pageId = pageXmlId.replace(/^p/, "");
    if (!pageId) return;

    const regionDivs = Array.from(pageDiv.children).filter(
      (child) => child.localName === "div" && child.getAttribute("type") === "region"
    );

    const regions = regionDivs
      .map((regionDiv) => {
        const pairBlocks = Array.from(regionDiv.children).filter(
          (child) => child.localName === "ab" && child.getAttribute("type") === "segment-pair"
        );

        const sentences = pairBlocks
          .map((ab) => {
            const segs = Array.from(ab.children).filter((child) => child.localName === "seg");
            const laSeg = segs.find((seg) => getXmlAttr(seg, "lang") === "la");
            const noSeg = segs.find((seg) => getXmlAttr(seg, "lang") === "no");
            const la = normalizeText(laSeg ? laSeg.textContent : "");
            const no = normalizeText(noSeg ? noSeg.textContent : "");
            if (!la) return null;
            return { la, no };
          })
          .filter(Boolean);

        return { sentences };
      })
      .filter((region) => region.sentences.length > 0);

    pageMap.set(pageId, regions);
  });

  return pageMap;
}

async function loadDefaultTei() {
  try {
    const response = await fetch(TEI_TRANSLATION_PATH);
    if (!response.ok) {
      throw new Error();
    }
    const teiXml = await response.text();
    teiContentByPageId = parseTeiContent(teiXml);
    const counts = countTranslatedSegments(teiContentByPageId);
    dataStatus.textContent = `TEI lastet automatisk: ${counts.translated}/${counts.total} segmenter med norsk tekst.`;
  } catch (_error) {
    teiContentByPageId = new Map();
    dataStatus.textContent =
      "Kunne ikke laste TEI automatisk. Klikk 'Velg TEI-fil' for lokal visning.";
  }
}

async function goToPage(index) {
  if (!manifest || !Array.isArray(manifest.pages)) return;
  if (index < 0 || index >= manifest.pages.length) return;
  currentIndex = index;
  await renderCurrentPage();
}

function renderRegions(regions) {
  textGrid.innerHTML = "";

  if (!regions.length) {
    textGrid.innerHTML = '<p class="muted">Ingen transkribert tekst for denne siden.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  regions.forEach((region) => {
    const block = document.createElement("section");
    block.className = "region-block";

    region.sentences.forEach((sentence) => {
      const row = document.createElement("article");
      row.className = "line-row";

      const la = document.createElement("p");
      la.className = "line-text";
      la.textContent = sentence.la;

      const no = document.createElement("p");
      no.className = "translation-placeholder";
      no.textContent = sentence.no || "(oversettelse kommer)";

      row.appendChild(la);
      row.appendChild(no);
      block.appendChild(row);
    });

    fragment.appendChild(block);
  });

  textGrid.appendChild(fragment);
}

function openOverlay() {
  if (!pageImage.src) return;
  overlayImage.src = pageImage.src;
  overlayImage.alt = pageImage.alt;
  imageOverlay.hidden = false;
}

function closeOverlay() {
  imageOverlay.hidden = true;
}

function openInfo() {
  infoOverlay.hidden = false;
}

function closeInfo() {
  infoOverlay.hidden = true;
}

async function renderCurrentPage() {
  const page = manifest.pages[currentIndex];
  if (!page) return;

  pageImage.src = page.image;
  pageImage.alt = `${page.label} original`;
  pageIndicator.textContent = `Side ${currentIndex + 1} av ${manifest.pages.length}`;
  prevPageBtn.disabled = currentIndex === 0;
  nextPageBtn.disabled = currentIndex === manifest.pages.length - 1;

  const regions = teiContentByPageId.get(page.id) || [];
  renderRegions(regions);
}

async function init() {
  try {
    let loadedManifest = null;
    try {
      const response = await fetch(MANIFEST_PATH);
      if (response.ok) {
        loadedManifest = await response.json();
      }
    } catch (_error) {
      loadedManifest = null;
    }

    manifest = loadedManifest || FALLBACK_MANIFEST;

    if (manifest.title) {
      document.title = manifest.title;
      const heading = document.querySelector(".title-block h1");
      if (heading) heading.textContent = manifest.title;
    }
    if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
      throw new Error("Ingen sider i manifestet");
    }

    await loadDefaultTei();
    await renderCurrentPage();
  } catch (_error) {
    pageIndicator.textContent = "Feil ved lasting";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    textGrid.innerHTML = "";
  }
}

prevPageBtn.addEventListener("click", async () => {
  await goToPage(currentIndex - 1);
});

nextPageBtn.addEventListener("click", async () => {
  await goToPage(currentIndex + 1);
});

openInfoBtn.addEventListener("click", openInfo);
pickTeiBtn.addEventListener("click", () => teiFileInput.click());
teiFileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    teiContentByPageId = parseTeiContent(text);
    const counts = countTranslatedSegments(teiContentByPageId);
    dataStatus.textContent = `TEI lastet fra fil (${file.name}): ${counts.translated}/${counts.total} segmenter med norsk tekst.`;
    await renderCurrentPage();
  } catch (_error) {
    dataStatus.textContent = "Klarte ikke lese valgt TEI-fil.";
  }
});

pageImage.addEventListener("click", openOverlay);
pageImage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openOverlay();
  }
});

closeOverlayBtn.addEventListener("click", closeOverlay);
closeInfoBtn.addEventListener("click", closeInfo);

imageOverlay.addEventListener("click", (event) => {
  if (event.target === imageOverlay) {
    closeOverlay();
  }
});

infoOverlay.addEventListener("click", (event) => {
  if (event.target === infoOverlay) {
    closeInfo();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageOverlay.hidden) {
    closeOverlay();
    return;
  }
  if (event.key === "Escape" && !infoOverlay.hidden) {
    closeInfo();
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void goToPage(currentIndex - 1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    void goToPage(currentIndex + 1);
  }
});

init();
