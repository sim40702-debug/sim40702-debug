// generate.js
// Genera un SVG animato: un vecchio Macintosh la cui griglia dello schermo
// e' la contribution graph GitHub dell'utente, con i quadratini che si
// "accendono" in sequenza (effetto scansione CRT).

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

function buildSvg(weeks, { dark }) {
  const cell = 11;
  const gap = 3;
  const cols = weeks.length;
  const rows = 7;

  const screenPaddingX = 24;
  const screenPaddingY = 22;
  const screenW = cols * (cell + gap) - gap + screenPaddingX * 2;
  const screenH = rows * (cell + gap) - gap + screenPaddingY * 2;

  const bezel = 34;
  const baseExtra = 46;
  const macW = screenW + bezel * 2;
  const macH = screenH + bezel * 2 + baseExtra;

  const totalPad = 30;
  const width = macW + totalPad * 2;
  const height = macH + totalPad * 2 + 40;

  const bodyColor = dark ? "#3a3a3c" : "#ede6d3";
  const bodyStroke = dark ? "#1c1c1e" : "#b9ae8f";
  const screenBezel = dark ? "#1c1c1e" : "#c9bfa0";
  const screenBg = dark ? "#05130a" : "#0c1f12";
  const offColor = "#12261a";

  const levels = ["#0d2818", "#0e4429", "#006d32", "#26a641", "#39d353"];

  let max = 0;
  weeks.forEach((w) =>
    w.contributionDays.forEach((d) => {
      if (d.contributionCount > max) max = d.contributionCount;
    })
  );

  const macX = totalPad;
  const macY = totalPad;
  const screenX = macX + bezel;
  const screenY = macY + bezel;

  let squares = "";
  let delayIndex = 0;
  const totalCells = cols * rows;
  const scanDuration = Math.max(6, Math.min(18, totalCells / 40));

  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const level = levelFor(day.contributionCount, max || 1);
      const cx = screenX + screenPaddingX + wi * (cell + gap);
      const cy = screenY + screenPaddingY + day.weekday * (cell + gap);
      const finalColor = level === 0 ? offColor : levels[level];
      const delay = (delayIndex / totalCells) * scanDuration;
      delayIndex++;

      squares += `
      <rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="2" fill="${offColor}">
        <title>${day.date}: ${day.contributionCount} contribuzioni</title>
        <animate attributeName="fill"
          values="${offColor};${finalColor};${finalColor};${offColor}"
          keyTimes="0;0.02;0.85;1"
          dur="${scanDuration}s"
          begin="${delay.toFixed(2)}s"
          repeatCount="indefinite" />
      </rect>`;
    });
  });

  const macintoshFace = `
    <rect x="${macX}" y="${macY}" width="${macW}" height="${macH}" rx="26"
          fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="2"/>
    <rect x="${macX + macW / 2 - 22}" y="${macY + macH - baseExtra + 10}"
          width="44" height="6" rx="3" fill="${bodyStroke}" opacity="0.8"/>
    <g transform="translate(${macX + 22}, ${macY + macH - baseExtra + 6})" opacity="0.85">
      <path d="M9 2c-1.2-1-2.9-1-4 0 1.3-.2 2.7.2 4 0z" fill="${bodyStroke}"/>
      <path d="M9 3c-2.6-1.3-6-.2-6 3.4 0 3.3 2.2 6.6 4 6.6.9 0 1.3-.6 2.4-.6 1.1 0 1.4.6 2.4.6 1.7 0 3.9-3 3.9-5.3 0-.1 0-.1 0-.1-3.2-.2-3.4-4.5-1-6-1.1-1.5-2.8-1.7-3.4-1.7-1.1 0-2 .7-2.3.7-.3 0 0-.1 0 0z" fill="${bodyStroke}"/>
    </g>
    <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="14" fill="${screenBezel}"/>
    <rect x="${screenX + 6}" y="${screenY + 6}" width="${screenW - 12}" height="${screenH - 12}" rx="8" fill="${screenBg}"/>
  `;

  const titleY = macY + macH + 26;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" font-family="Menlo, monospace">
  ${macintoshFace}
  ${squares}
  <text x="${width / 2}" y="${titleY}" text-anchor="middle"
        font-size="12" fill="${dark ? "#8b8b8d" : "#6e6e6e"}">
    @${USER} — contribution graph
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
