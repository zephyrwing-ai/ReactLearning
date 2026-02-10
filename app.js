const docList = document.getElementById("docList");
const docContent = document.getElementById("docContent");
const siteTitle = document.querySelector(".site-title");

const CODE_START_PATTERN = /[{};]|^\s*(import|export|function|const|let|class)\b/;

function normalizeLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function findCodeStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (CODE_START_PATTERN.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

function splitInlineComment(line) {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (!inDouble && !inBacktick && char === "'" && !escaped) {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && char === '"' && !escaped) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "`" && !escaped) {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (char === "/" && next === "/") {
        return {
          code: line.slice(0, i),
          note: line.slice(i + 2).trim(),
        };
      }
      if (char === "/" && next === "*") {
        const end = line.indexOf("*/", i + 2);
        if (end !== -1) {
          return {
            code: line.slice(0, i),
            note: line.slice(i + 2, end).trim(),
          };
        }
      }
    }
  }

  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return {
      code: "",
      note: trimmed.slice(1).trim(),
    };
  }

  return { code: line, note: "" };
}

function buildCodeBlock(codeLines) {
  const block = document.createElement("div");
  block.className = "code-block";

  codeLines.forEach((line) => {
    const { code, note } = splitInlineComment(line);
    const lineWrap = document.createElement("div");
    lineWrap.className = "code-line";

    const codeSpan = document.createElement("span");
    codeSpan.className = "code-text";
    codeSpan.textContent = code === "" ? " " : code;
    if (code.trim() === "") {
      codeSpan.classList.add("empty-code");
    }

    lineWrap.appendChild(codeSpan);

    let noteBlock = null;
    if (note) {
      const toggle = document.createElement("button");
      toggle.className = "note-toggle";
      toggle.type = "button";
      toggle.textContent = "注释";
      toggle.setAttribute("aria-expanded", "false");

      noteBlock = document.createElement("div");
      noteBlock.className = "note";
      noteBlock.hidden = true;
      noteBlock.textContent = note;

      toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!isOpen));
        noteBlock.hidden = isOpen;
      });

      lineWrap.appendChild(toggle);
    }

    block.appendChild(lineWrap);
    if (noteBlock) {
      block.appendChild(noteBlock);
    }
  });

  return block;
}

function appendParagraphs(lines) {
  let buffer = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const paragraph = document.createElement("p");
    paragraph.textContent = buffer.join("\n");
    docContent.appendChild(paragraph);
    buffer = [];
  };

  lines.forEach((line) => {
    if (line.trim() === "") {
      flush();
      return;
    }
    buffer.push(line);
  });
  flush();
}

function renderDoc(text) {
  docContent.innerHTML = "";
  const lines = normalizeLines(text);
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmpty === -1) {
    docContent.textContent = "内容为空。";
    return;
  }

  let titleLine = lines[firstNonEmpty];
  if (titleLine.trim().startsWith("#")) {
    titleLine = titleLine.replace(/^#+\s*/, "");
  }

  const title = document.createElement("h2");
  title.textContent = titleLine;
  docContent.appendChild(title);

  const remaining = lines.slice(firstNonEmpty + 1);
  const codeStart = findCodeStart(remaining);
  const proseLines = codeStart === -1 ? remaining : remaining.slice(0, codeStart);
  const codeLines = codeStart === -1 ? [] : remaining.slice(codeStart);

  if (proseLines.length > 0) {
    appendParagraphs(proseLines);
  }

  if (codeLines.length > 0) {
    docContent.appendChild(buildCodeBlock(codeLines));
  }
}

function setActiveLink(docId) {
  const links = docList.querySelectorAll(".doc-link");
  links.forEach((link) => {
    link.classList.toggle("active", link.dataset.docId === docId);
  });
}

async function loadDoc(doc) {
  const response = await fetch(doc.path);
  if (!response.ok) {
    throw new Error(`Failed to load ${doc.path}`);
  }
  const text = await response.text();
  renderDoc(text);
  setActiveLink(doc.id);
  history.replaceState(null, "", `#${doc.id}`);
}

function normalizeDocs(payload) {
  if (!payload) {
    return { title: "ReactLearning", sections: [], flatDocs: [] };
  }

  const title = payload.title || "ReactLearning";
  let sections = [];

  if (Array.isArray(payload.sections)) {
    sections = payload.sections;
  } else if (Array.isArray(payload.docs)) {
    sections = [{ id: "docs", title: "Docs", items: payload.docs }];
  } else if (Array.isArray(payload)) {
    sections = [{ id: "docs", title: "Docs", items: payload }];
  }

  const flatDocs = sections.flatMap((section) => section.items || []);
  return { title, sections, flatDocs };
}

function renderDocList(sections) {
  docList.innerHTML = "";
  sections.forEach((section) => {
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "doc-section-title";
    sectionTitle.textContent = section.title;
    docList.appendChild(sectionTitle);

    (section.items || []).forEach((doc) => {
      const link = document.createElement("a");
      link.href = `#${doc.id}`;
      link.className = "doc-link";
      link.textContent = doc.title;
      link.dataset.docId = doc.id;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        loadDoc(doc).catch((error) => {
          docContent.textContent = `加载失败：${error.message}`;
        });
      });
      docList.appendChild(link);
    });
  });
}

async function init() {
  const response = await fetch("./docs.json");
  if (!response.ok) {
    docContent.textContent = "无法读取文档列表。";
    return;
  }
  const payload = await response.json();
  const { title, sections, flatDocs } = normalizeDocs(payload);
  if (siteTitle) {
    siteTitle.textContent = title;
  }
  renderDocList(sections);

  const initialId = location.hash.replace("#", "");
  const initialDoc =
    flatDocs.find((doc) => doc.id === initialId) || flatDocs[0];
  if (initialDoc) {
    loadDoc(initialDoc).catch((error) => {
      docContent.textContent = `加载失败：${error.message}`;
    });
  }
}

init();
