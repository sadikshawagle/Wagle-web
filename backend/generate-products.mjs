// Run once: node generate-products.mjs
// Reads Products.xlsx and writes products.json

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wb = XLSX.readFile(path.join(__dirname, '..', 'Products.xlsx'));
const ws = wb.Sheets['Sheet1'];
const rows = XLSX.utils.sheet_to_json(ws);

// ── Electricals: ordered rules (first match wins) ─────────────────────────────
const ELEC_RULES = [
  [/\bFAN\b/, 'fans', 'fan'],
  [/SOLAR WATER HEATER|SOLAR PANEL|SOLAR TUBULAR|SOLAR BATTERY/, 'solar', 'solar'],
  [/TUBULAR BATTERY|LUMINIOUS BATTERY|EXIDE BATTERY|150 AH|160 AH|HOME UPS|CHARGE CONTROLLER|INVERTER|UPS BRAVO/, 'solar', 'battery'],
  [/WIRE\b|MULTISTAND|SQMM|COAX|EARTHING ROD|EARTHING PLATE|COPPER ROD|ABC CABLE|CONCENTRIC|FLEXIBLE WIRE|AUTO CABLE|POWER CABLE|SUBMERSIBLE CABLE/, 'wiring', 'wire'],
  [/\bLED\b|BULB|TUBE LIGHT|FLOOD LIGHT|STREET LIGHT|PENDENT LIGHT|FESTIVAL LIGHT|STRIP LIGHT|PANEL LIGHT|SURFACE LIGHT|EDGE LIGHT|BATTEN|EMERGENCY LED/, 'lighting', 'led'],
  [/MCB|MCCB|DISTRIBUTION BOX|STABILIZ|ARRESTER|CONTACTOR|CHARGE OVER|SURGE/, 'safety', 'mcb'],
  [/SWITCH|SOCKET|SKT|SWITCH PLATE|MODULAR|GANG|INDICATOR|INTERLOCK|DIMMER/, 'switches', 'switch'],
  [/PUMP|SUBMERSIBLE PUMP|MONOBLOCK|MOTOR|BOOSTER/, 'pumps', 'tool'],
  [/GEYSER|CHIMNEY|HOB|RO\b|WASHING|REFRIGER|WATER HEATER|WATER PURIFIER|AC SPLIT|INVETER.*TON/, 'appliances', 'panel'],
  [/DRILL|GRINDING MACHINE|ROTARY HAMMER|PLIER|PILASH|TESTER|MULTIMETER|CUTTER|GLOVE|HELMET/, 'tools', 'tool'],
  [/EARTHING|LIGHTNING/, 'safety', 'mcb'],
  [/PIPE\b|CONDUIT|PVC PIPE|HOSE/, 'extras', 'plug'],
];

// ── Generals: ordered rules ───────────────────────────────────────────────────
const GEN_RULES = [
  [/MIXER|BIB COCK|PILLAR COCK|PILLER COCK|SWAN NECK|DIVERTER|BATHSPOUT|SINK COCK|ANGLE COCK|CONCEALED COCK|LONG BODY|CENTRE HOLE|SINK MIXTURE|SINK MIX|PILLAR TAP/, 'faucets', 'pipe'],
  [/BALL VALVE|GATE VALVE|ANGLE VALVE|CHECK VALVE|CALVE|COMPACT BALL/, 'valves', 'mcb'],
  [/BASIN|WASH BASIN|BESIN|SINK\b|SINK [0-9]|PEDESTAL|PEDISTAL|REDESTAL|URINAL|FLUSH TANK|CISTERN|MANHOLE|EWC|COMMODE|ORISSA PAN|ORRISSA|CT PAN|MALE URINAL|PAN SITE|WALL HUNG/, 'sanitary', 'panel'],
  [/SHOWER|TOWEL|SHELF|CORNER SET|MIRROR|SOAP DISH|SPLASH|SHOWER HEAD|DIVERTER.*CHADARI|GLASS CORNER|STEEL GLASS/, 'bathroom', 'plug'],
  [/\bPIPE\b|GI PIPE|PPR |CPVC PIPE|HDPE|PE100|PVC DURODRAIN|PVC EASY|PIPE KG|CONDUCT PIPE|PVC SINGLE TEE|PVC DOUBLE TEE|PVC R.TEE|PVC BEND|PVC P TRAP|M.SOCKET|F.UNION|M.UNION/, 'pipes', 'wire'],
  [/ADAPTER|NIPPLE|FLANGE|COUPLING|UNION\b|ELBOW|SOCKET\b|CLAMP|BRACKET|HANGER|TRAP\b|BEND\b|CONNECTOR|FITTING|HANDLE\b|PLYWOOD/, 'fittings', 'tool'],
];

function categorize(name, rules) {
  const n = name.toUpperCase();
  for (const [test, cat, icon] of rules) {
    if (test.test(n)) return { cat, icon };
  }
  return { cat: rules === ELEC_RULES ? 'extras' : 'fittings', icon: rules === ELEC_RULES ? 'plug' : 'tool' };
}

function makeKeys(name) {
  return [...new Set(
    name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  )];
}

function toTitleCase(str) {
  return str.toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

const products = [];
let eIdx = 0, gIdx = 0;

for (const row of rows) {
  const eName = (row['Wagle Electricals Products'] || '').toString().trim();
  const gName = (row['Wagle Generals Suppliers Products'] || '').toString().trim();

  if (eName && eName !== 'Wagle Electricals Products' && eName !== '0') {
    eIdx++;
    const { cat, icon } = categorize(eName, ELEC_RULES);
    products.push({
      id: `e${String(eIdx).padStart(3, '0')}`,
      name: toTitleCase(eName),
      brand: 'Wagle Electricals',
      division: 'electricals',
      cat,
      icon,
      stock: 'in',
      ph: 'Wagle Electricals · Damauli',
      keys: makeKeys(eName),
    });
  }

  if (gName && gName !== 'Wagle Generals Suppliers Products' && gName !== '0') {
    gIdx++;
    const { cat, icon } = categorize(gName, GEN_RULES);
    products.push({
      id: `g${String(gIdx).padStart(3, '0')}`,
      name: toTitleCase(gName),
      brand: 'Wagle Generals',
      division: 'generals',
      cat,
      icon,
      stock: 'in',
      ph: 'Wagle Generals · Damauli',
      keys: makeKeys(gName),
    });
  }
}

const outPath = path.join(__dirname, 'products.json');
writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');
console.log(`\n✅ Generated ${products.length} products → products.json`);
console.log(`   Wagle Electricals : ${eIdx} products`);
console.log(`   Wagle Generals    : ${gIdx} products\n`);

const byCat = {};
products.forEach(p => { const k = `${p.division}/${p.cat}`; byCat[k] = (byCat[k] || 0) + 1; });
Object.entries(byCat).sort().forEach(([k, v]) => console.log(`   ${k.padEnd(30)} ${v}`));
console.log('');
