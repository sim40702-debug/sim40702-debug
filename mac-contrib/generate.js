// generate.js
// Genera un SVG animato: uno skyline di citta' notturna le cui finestre
// sono la contribution graph GitHub dell'utente. Le finestre si accendono
// in sequenza, come se la citta' si illuminasse al calare della notte.

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GITHUB_TOKEN;
const USER = process.env.GITHUB_USER;

if (!TOKEN || !USER) {
  console.error("Serve GITHUB_TOKEN e GITHUB_USER come env var.");
  process.exit(1);
}

const QUERY = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
  }
}`;

async function fetchContributions() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error("GraphQL error: " + JSON.stringify(json.errors));
  }
  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

function levelFor(count, max) {
  if (count === 0) return 0;
  if (max <= 4) return count >= max ? 4 : Math.min(4, count);
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

// Random deterministico: stesso seed => stessa forma di skyline
// sia nella versione dark che in quella light.
function seeded(n) {
  const x = Math.sin(n * 999.7) * 10000;
  return x - Math.floor(x);
}

function buildSvg(weeks, { dark }) {
  const cell = 10;
  const gap = 3;
  const cols = weeks.length;
  const rows = 7;

  const windowAreaH = rows * (cell + gap) - gap;
  const buildingW = cell + gap - 1;
  const totalPad = 26;

  // altezza extra (sopra le finestre) per ogni edificio -> profilo skyline
  const extras = weeks.map((_, wi) => {
    let e = 8 + Math.round(seeded(wi) * 36); // 8..44
    if (seeded(wi * 7.31) > 0.86) e += 42; // torre alta occasionale
    return e;
  });
  const maxExtra = Math.max(...extras, 0);

  const skyTop = 46;
  const groundY = skyTop + maxExtra + windowAreaH;
  const bottomMargin = 58; // spazio per la scritta in basso

  const width = totalPad * 2 + cols * (cell + gap);
  const height = groundY + bottomMargin;

  const skyDark1 = "#05070f", skyDark2 = "#141a33";
  const skyLight1 = "#ffd9a0", skyLight2 = "#c9dcf0";

  const fillsDark = ["#151a2b", "#1b2138", "#11151f"];
  const fillsLight = ["#5b6b8c", "#6d7ea3", "#4a5878"];

  const unlit = dark ? "#0c0f1c" : "#3d4867";
  const levels = dark
    ? ["#0c0f1c", "#5a3d1e", "#a8722f", "#e8a94a", "#ffdf9b"]
    : ["#3d4867", "#8a6a3a", "#c99a4c", "#f0c069", "#fff2cf"];

  let max = 0;
  weeks.forEach((w) =>
    w.contributionDays.forEach((d) => {
      if (d.contributionCount > max) max = d.contributionCount;
    })
  );

  let totalContrib = 0;
  weeks.forEach((w) =>
    w.contributionDays.forEach((d) => (totalContrib += d.contributionCount))
  );

  const screenX = totalPad;
  const windowsTopY = groundY - windowAreaH;

  const totalCells = cols * rows;
  const scanDuration = Math.max(10, Math.min(26, totalCells / 30));

  // skyline lontana, decorativa, non legata ai dati (profondita')
  let farSkyline = "";
  const farCount = 26;
  for (let i = 0; i < farCount; i++) {
    const fw = width / farCount;
    const fx = i * fw;
    const fh = 20 + seeded(i * 3.7) * (maxExtra * 0.7 + 30);
    farSkyline += `<rect x="${fx.toFixed(1)}" y="${(groundY - fh).toFixed(1)}" width="${(fw + 1).toFixed(1)}" height="${(fh + 6).toFixed(1)}" fill="${dark ? "#0a0d18" : "#7f93b8"}" opacity="${dark ? 0.55 : 0.35}"/>`;
  }

  // cielo: stelle + luna (dark) oppure sole + nuvole (light)
  let skyDeco = "";
  if (dark) {
    for (let i = 0; i < 40; i++) {
      const sx = seeded(i * 13.1) * width;
      const sy = seeded(i * 5.9) * (skyTop + maxExtra * 0.7);
      const r = 0.5 + seeded(i * 2.3) * 1;
      const dur = 2 + seeded(i * 4.1) * 3;
      skyDeco += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(2)}" fill="#ffffff">
        <animate attributeName="opacity" values="0.15;1;0.15" dur="${dur.toFixed(1)}s" repeatCount="indefinite"/>
      </circle>`;
    }
    skyDeco += `<circle cx="${width - 70}" cy="42" r="22" fill="#f3f0e6"/>
      <circle cx="${width - 60}" cy="36" r="22" fill="${skyDark1}"/>`;
  } else {
    skyDeco += `<circle cx="70" cy="46" r="26" fill="#ffe6a8"/>`;
    skyDeco += `<ellipse cx="${width - 140}" cy="60" rx="46" ry="14" fill="#ffffff" opacity="0.55"/>`;
    skyDeco += `<ellipse cx="${width - 90}" cy="70" rx="34" ry="11" fill="#ffffff" opacity="0.5"/>`;
  }

  // edifici (dati reali) + finestre animate
  let buildings = "";
  let windows = "";
  let delayIndex = 0;

  weeks.forEach((week, wi) => {
    const bx = screenX + wi * (cell + gap);
    const extra = extras[wi];
    const bTop = windowsTopY - extra;
    const fillSet = dark ? fillsDark : fillsLight;
    const fill = fillSet[wi % fillSet.length];

    buildings += `<rect x="${bx.toFixed(1)}" y="${bTop.toFixed(1)}" width="${buildingW}" height="${(groundY - bTop).toFixed(1)}" fill="${fill}"/>`;

    // antenna con lucina rossa lampeggiante sulle torri piu' alte
    if (extra > 46) {
      const cxA = bx + buildingW / 2;
      buildings += `<rect x="${(cxA - 1).toFixed(1)}" y="${(bTop - 16).toFixed(1)}" width="2" height="16" fill="${fill}"/>
        <circle cx="${cxA.toFixed(1)}" cy="${(bTop - 17).toFixed(1)}" r="2" fill="#ff5252">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/>
        </circle>`;
    }

    week.contributionDays.forEach((day) => {
      const level = levelFor(day.contributionCount, max || 1);
      const cx = bx + (buildingW - cell) / 2;
      const cy = windowsTopY + day.weekday * (cell + gap);
      const finalColor = levels[level];
      const delay = (delayIndex / totalCells) * scanDuration;
      delayIndex++;

      windows += `
      <rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cell}" height="${cell}" rx="1.5" fill="${unlit}">
        <title>${day.date}: ${day.contributionCount} contribuzioni</title>
        <animate attributeName="fill"
          values="${unlit};${finalColor};${finalColor};${unlit}"
          keyTimes="0;0.03;0.88;1"
          dur="${scanDuration.toFixed(2)}s"
          begin="${delay.toFixed(2)}s"
          repeatCount="indefinite" />
      </rect>`;
    });
  });

  const titleY = height - 34;
  const subtitleY = height - 16;
  const textColor = dark ? "#9aa4c4" : "#5a6785";

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" font-family="Menlo, monospace">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${dark ? skyDark1 : skyLight1}"/>
      <stop offset="100%" stop-color="${dark ? skyDark2 : skyLight2}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${groundY + 4}" fill="url(#sky)"/>
  ${skyDeco}
  ${farSkyline}
  ${buildings}
  ${windows}
  <rect x="0" y="${groundY}" width="${width}" height="2" fill="${dark ? "#000000" : "#33415f"}" opacity="0.35"/>
  <text x="${width / 2}" y="${titleY}" text-anchor="middle" font-size="12" fill="${textColor}">
    @${USER}
  </text>
  <text x="${width / 2}" y="${subtitleY}" text-anchor="middle" font-size="10" fill="${textColor}" opacity="0.8">
    ${totalContrib} contribuzioni nell'ultimo anno
  </text>
</svg>`;
}

async function main() {
  const weeks = await fetchContributions();
  const outDir = path.join(__dirname, "dist");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "mac-contribution-graph.svg"),
    buildSvg(weeks, { dark: true })
  );
  fs.writeFileSync(
    path.join(outDir, "mac-contribution-graph-light.svg"),
    buildSvg(weeks, { dark: false })
  );

  console.log("SVG generati in dist/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
