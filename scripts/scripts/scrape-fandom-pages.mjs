(() => {
  // ========= SETTINGS =========
  const DOWNLOAD_FILENAME = "the_tower_version_history_page_data.json";

  // For manual copy/paste in sections:
  const PRINT_SECTIONS = false;     // set true to print chunked sections
  const TABLES_PER_SECTION = 3;     // small = safer

  // ========= HELPERS =========
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

  // Find nearest preceding heading (h2/h3/h4) for context
  const nearestHeadingText = (el) => {
    let cur = el;
    while (cur && cur !== document.body) {
      let sib = cur.previousElementSibling;
      while (sib) {
        const tag = sib.tagName?.toLowerCase();
        if (tag === "h2" || tag === "h3" || tag === "h4") {
          return norm(sib.textContent).replace("[edit]", "").trim();
        }
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return null;
  };

  const tableToObject = (table, index) => {
    const caption = table.querySelector("caption");
    const captionText = caption ? norm(caption.textContent) : null;

    // choose a header row:
    // - prefer thead tr
    // - otherwise first tr containing any th
    // - otherwise first tr
    const headerRow =
      table.querySelector("thead tr") ||
      Array.from(table.querySelectorAll("tr")).find(tr => tr.querySelector("th")) ||
      table.querySelector("tr");

    if (!headerRow) return null;

    const headerCells = Array.from(headerRow.querySelectorAll("th, td"))
      .map(c => norm(c.textContent));

    // parse data rows: all trs after headerRow
    const allRows = Array.from(table.querySelectorAll("tr"));
    const headerIndex = allRows.indexOf(headerRow);
    const dataRows = allRows.slice(Math.max(headerIndex + 1, 0));

    const rows = dataRows
      .map(tr => Array.from(tr.querySelectorAll("th, td")).map(td => norm(td.textContent)))
      .filter(cells => cells.length && cells.some(v => v.length));

    // If the table is "key/value" style (2 columns), preserve as pairs too
    const kvPairs =
      headerCells.length === 2
        ? rows
            .filter(r => r.length >= 2 && r[0] && r[1])
            .map(r => ({ key: r[0], value: r[1] }))
        : null;

    const contextHeading = nearestHeadingText(table);
    const tableId = table.getAttribute("id") || null;
    const className = table.getAttribute("class") || null;

    return {
      tableIndex: index,
      contextHeading,
      caption: captionText,
      tableId,
      className,
      headers: headerCells,
      rows,
      kvPairs
    };
  };

  // ========= MAIN EXTRACTION =========
  const title = norm(document.querySelector("h1")?.textContent) || document.title || "Version History";
  const url = location.href;

  const tables = Array.from(document.querySelectorAll("table"));
  const extractedTables = tables
    .map((t, i) => tableToObject(t, i))
    .filter(Boolean)
    .filter(t => (t.rows?.length ?? 0) > 0);

  // Some pages have “charts” as lists; grab structured lists under headings too
  const lists = Array.from(document.querySelectorAll(".mw-parser-output ul, .mw-parser-output ol"))
    .map((lst, i) => {
      const items = Array.from(lst.querySelectorAll(":scope > li")).map(li => norm(li.textContent));
      if (!items.length) return null;
      return {
        listIndex: i,
        contextHeading: nearestHeadingText(lst),
        type: lst.tagName.toLowerCase(),
        items
      };
    })
    .filter(Boolean);

  const output = {
    page: {
      title,
      url,
      extractedAt: new Date().toISOString()
    },
    summary: {
      tablesFoundOnPage: tables.length,
      tablesExtracted: extractedTables.length,
      listsExtracted: lists.length
    },
    tables: extractedTables,
    lists
  };

  // Keep it in memory:
  window.__VERSION_HISTORY_PAGE_EXPORT__ = output;

  // Download as JSON file:
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = DOWNLOAD_FILENAME;
  a.click();
  URL.revokeObjectURL(dlUrl);

  console.log(`Exported ${output.summary.tablesExtracted} tables and ${output.summary.listsExtracted} lists.`);
  console.log("Saved to window.__VERSION_HISTORY_PAGE_EXPORT__ as well.");

  // Optional: Print in sections for manual copy/paste
  if (PRINT_SECTIONS) {
    const chunk = (arr, n) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

    const tableChunks = chunk(output.tables, TABLES_PER_SECTION);

    console.log("\n===== SECTION 00 (page + summary) =====");
    console.log(JSON.stringify({ page: output.page, summary: output.summary }, null, 2));

    tableChunks.forEach((tablesPart, idx) => {
      const sectionNo = String(idx + 1).padStart(2, "0");
      const first = tablesPart[0]?.tableIndex;
      const last = tablesPart[tablesPart.length - 1]?.tableIndex;
      console.log(`\n===== SECTION ${sectionNo} (tables ${first}..${last}) =====`);
      console.log(JSON.stringify({ tables: tablesPart }, null, 2));
    });

    console.log("\n===== FINAL SECTION (lists) =====");
    console.log(JSON.stringify({ lists: output.lists }, null, 2));
  }
})();
