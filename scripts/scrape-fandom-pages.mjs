import fs from "fs";
import path from "path";
import crypto from "crypto";
import cheerio from "cheerio";

const OUTPUT_DIR = "data"; // change to your repo path (e.g., "public/data")
const USER_AGENT =
  "tower-wiki-scraper/1.0 (+https://github.com/yourorg/yourrepo)";

// Add every page you want to scrape here.
// Each item becomes one JSON file at: `${OUTPUT_DIR}/${slug}.json`
const PAGES = [
  { slug: "relics", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Relics" },
  { slug: "cards", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Cards" },
  { slug: "modules", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Modules" },
  { slug: "perks", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Perks" },
  { slug: "golden_bot", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Golden_Bot" },
  { slug: "amplify_bot", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Amplify_Bot" },
  { slug: "thunder_bot", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Thunder_Bot" },
  { slug: "flame_bot", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Flame_Bot" },
  { slug: "the_vault", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/The_Vault" },
  { slug: "lab_upgrades", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Lab_Upgrades" },
  { slug: "attack_upgrades", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Attack_Upgrades" },
  { slug: "defense_upgrades", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Defense_Upgrades" },
  { slug: "utility_upgrades", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Utility_Upgrades" },
  { slug: "ultimate_weapons", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Ultimate_Weapons" },
  { slug: "currency", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Currency" },
  { slug: "enemies", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Enemies" },
  { slug: "tournaments", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Tournaments" },
  { slug: "events", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Events" },
  { slug: "milestones", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Milestones" },
  { slug: "daily_missions", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Daily_Missions" },
  { slug: "tiers", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Tiers" },
  { slug: "themes_menu", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Themes_Menu" },
  { slug: "guilds", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Guilds" },
  { slug: "version_history", url: "https://the-tower-idle-tower-defense.fandom.com/wiki/Version_History" }
];

// -------- Helpers --------
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function nearestHeadingText($, tableEl) {
  // Walk backward in DOM order: look for h2/h3/h4 near the table.
  // Cheerio doesn't have native prevAll with boundary, so we iterate parents/siblings.
  let node = $(tableEl);

  // Try previous siblings first, then climb
  for (let climb = 0; climb < 6; climb++) {
    let prev = node.prev();
    while (prev && prev.length) {
      const tag = (prev[0].tagName || "").toLowerCase();
      if (tag === "h2" || tag === "h3" || tag === "h4") {
        return norm(prev.text().replace("[edit]", ""));
      }
      // If there's a heading inside this block, consider it
      const inner = prev.find("h2,h3,h4").first();
      if (inner && inner.length) return norm(inner.text().replace("[edit]", ""));
      prev = prev.prev();
    }
    node = node.parent();
    if (!node || !node.length) break;
  }
  return null;
}

function extractTables($) {
  const tables = $("table").toArray();
  const extracted = [];

  tables.forEach((t, index) => {
    const $t = $(t);

    const captionText = $t.find("caption").first().text();
    const caption = captionText ? norm(captionText) : null;

    // header row: thead tr OR first tr containing th OR first tr
    let $headerRow = $t.find("thead tr").first();
    if (!$headerRow.length) {
      const withTh = $t.find("tr").filter((_, tr) => $(tr).find("th").length > 0).first();
      $headerRow = withTh.length ? withTh : $t.find("tr").first();
    }
    if (!$headerRow.length) return;

    const headers = $headerRow
      .find("th,td")
      .toArray()
      .map((c) => norm($(c).text()));

    // all rows after header row
    const allRows = $t.find("tr").toArray();
    const headerIdx = allRows.indexOf($headerRow[0]);
    const dataRows = allRows.slice(Math.max(headerIdx + 1, 0));

    const rows = dataRows
      .map((r) => $(r).find("th,td").toArray().map((c) => norm($(c).text())))
      .filter((cells) => cells.length && cells.some((v) => v.length));

    if (!rows.length) return;

    const kvPairs =
      headers.length === 2
        ? rows
            .filter((r) => r.length >= 2 && r[0] && r[1])
            .map((r) => ({ key: r[0], value: r[1] }))
        : null;

    extracted.push({
      tableIndex: index,
      contextHeading: nearestHeadingText($, t),
      caption,
      tableId: $t.attr("id") || null,
      className: $t.attr("class") || null,
      headers,
      rows,
      kvPairs
    });
  });

  return { tablesFoundOnPage: $("table").length, tables: extracted };
}

function extractLists($) {
  // Similar to your browser script: lists under .mw-parser-output
  const lists = $(".mw-parser-output ul, .mw-parser-output ol").toArray();
  const out = [];

  lists.forEach((lst, i) => {
    const $lst = $(lst);
    const items = $lst
      .children("li")
      .toArray()
      .map((li) => norm($(li).text()))
      .filter(Boolean);

    if (!items.length) return;

    out.push({
      listIndex: i,
      contextHeading: nearestHeadingText($, lst),
      type: ($lst[0].tagName || "").toLowerCase(),
      items
    });
  });

  return out;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html"
    }
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

// -------- Main --------
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const p of PAGES) {
    console.log(`Scraping: ${p.url}`);
    const html = await fetchHtml(p.url);
    const $ = cheerio.load(html);

    const title =
      norm($("h1").first().text()) ||
      norm($("title").text()) ||
      p.slug;

    const { tablesFoundOnPage, tables } = extractTables($);
    const lists = extractLists($);

    const output = {
      page: {
        title,
        url: p.url,
        extractedAt: new Date().toISOString(),
        htmlSha256: sha256(html)
      },
      summary: {
        tablesFoundOnPage,
        tablesExtracted: tables.length,
        listsExtracted: lists.length
      },
      tables,
      lists
    };

    const outPath = path.join(OUTPUT_DIR, `${p.slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
