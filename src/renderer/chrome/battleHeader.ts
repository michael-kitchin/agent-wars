/**
 * The battle header: while a battle is open, the top bar names the battle and its beat, and shows the force bar, in
 * place of the match status.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { countBattleForces, countTwoPartyForces } from '../../shared/battleForceCounts';
import { aiOnlyBeatsLeft, aiOnlyBeatsLeftIsUrgent } from '../../shared/aiOnlyBeatLimit';
import { formatBattleHeaderStatusParts, formatBattleHeaderTitle } from '../../shared/battleHeaderText';
import { paletteForOwner } from '../../shared/seatPalette';
import { HUMAN_SEAT_ID, isNeutralOwnerId } from '../../shared/seatIds';
import { sideDisplayName } from '../../shared/sideNicknames';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';
import { getCachedNamingLineForTarget } from '../map/terrainTooltipStrategicState';

/**
 * The class on `#app-topbar` that switches it to the battle header.
 *
 * Purpose: One switch for the styles that hide the match status and show the battle's parts.
 * When to use: Set and cleared only by `renderBattleHeader`; `static/frameChrome.css` keys on it.
 * Expected outcome: `topbar-battle`.
 * Exceptions: None.
 */
const TOPBAR_BATTLE_CLASS = 'topbar-battle';

/**
 * Counts caption requests, so a reply for an earlier battle cannot overwrite a newer one.
 *
 * Purpose: The caption arrives from the main process after the header is drawn.
 * When to use: Only by `renderBattleHeaderCaption`.
 * Expected outcome: Grows by one with each request.
 * Exceptions: None.
 */
let captionRequestSeq = 0;

/**
 * Switches the top bar between the match status and the battle header.
 *
 * Purpose: The bar keeps its place and height; only what it shows changes with the theater.
 * When to use: From `renderBattleHeader` on every refresh.
 * Expected outcome: `#app-topbar` has `TOPBAR_BATTLE_CLASS` and reads "Battle status" to assistive technology while a
 *   battle is open, and reads "Match status" otherwise.
 * Exceptions: None; a missing bar is skipped.
 */
function switchTopBarToBattle(inBattle: boolean): void {
  const bar = document.getElementById('app-topbar');
  if (!bar) return;
  bar.classList.toggle(TOPBAR_BATTLE_CLASS, inBattle);
  bar.setAttribute('aria-label', inBattle ? 'Battle status' : 'Match status');
}

/**
 * Writes the world hex's caption beside the title, once per battle.
 *
 * Purpose: Names the countries in the battle's hex the way the hex tooltip does, with their flags.
 * When to use: From `renderBattleHeader` while a battle is open.
 * Expected outcome: `#battle-header-caption` is emptied when a new battle opens, then filled when the caption arrives.
 *   Later refreshes of the same battle leave it alone.
 * Exceptions: None; a failed lookup leaves the caption empty.
 */
function renderBattleHeaderCaption(battle: TacticalBattleSnapshot): void {
  const captionEl = document.getElementById('battle-header-caption');
  if (!captionEl || captionEl.dataset.battleId === battle.battleId) return;
  captionEl.dataset.battleId = battle.battleId;
  captionEl.innerHTML = '';
  const requestSeq = ++captionRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: battle.enclosingStrategicH3Index, resolution: 1 }).then((caption) => {
    if (requestSeq !== captionRequestSeq) return;
    captionEl.innerHTML = caption && caption.text.trim() !== '' ? formatHexNamingCaptionHtml(caption) : '';
  });
}

/**
 * Writes the force bar: each side's sub-unit count and the player's share of the bar.
 *
 * Purpose: The player sees at a glance how the two sides compare in the fight.
 * When to use: From `renderBattleHeader` while a battle is open.
 * Expected outcome: The counts and the teal part of the bar follow `countBattleForces` for the battle's sub-units. While
 *   a beat plays back, the snapshot already holds the beat's result, so the bar keeps the counts it showed before the
 *   beat and catches up when the playback ends, as the map does. The light edge between the colors is omitted when the
 *   player's share is 0 or 1, so a side with every remaining sub-unit fills the bar in one color.
 * Exceptions: None; missing elements are skipped.
 */
function renderBattleForceBar(battle: TacticalBattleSnapshot): void {
  const bar = document.getElementById('battle-force-bar');
  if (!bar) return;
  if (S.resolutionMoveAnimation != null && bar.dataset.battleId === battle.battleId) return;
  bar.dataset.battleId = battle.battleId;
  const seats = S.gameState?.seats ?? [];
  const leadId = battle.leadPartyId ?? null;
  const opposingId = battle.opposingPartyId ?? battle.subUnits.find((unit) => unit.player !== HUMAN_SEAT_ID)?.player ?? null;
  const twoParty = leadId != null && opposingId != null ? countTwoPartyForces(battle.subUnits, leadId, opposingId) : null;
  const humanCounts = twoParty == null ? countBattleForces(battle.subUnits, opposingId ?? '') : null;
  const leftCount = twoParty != null ? twoParty.left : (humanCounts?.human ?? 0);
  const rightCount = twoParty != null ? twoParty.right : (humanCounts?.opponent ?? 0);
  const leftShare = twoParty != null ? twoParty.leftShare : (humanCounts?.humanShare ?? 0);
  const humanCount = document.getElementById('battle-force-human-count');
  if (humanCount) humanCount.textContent = leftCount.toLocaleString('en-US');
  const opponentCount = document.getElementById('battle-force-enemy-count');
  if (opponentCount) opponentCount.textContent = rightCount.toLocaleString('en-US');
  const leftName = document.getElementById('battle-force-human-name');
  const leadSeat = seats.find((seat) => seat.seatId === leadId);
  if (leftName) {
    const leftLabel = leadId == null ? 'yours' : (leadSeat ? sideDisplayName(leadSeat) : leadId);
    leftName.textContent = leftLabel;
    leftName.title = leftLabel;
  }
  const opposingSeat = seats.find((seat) => seat.seatId === opposingId);
  const nameEl = document.getElementById('battle-force-enemy-name');
  if (nameEl) {
    const rightLabel = opposingId != null && isNeutralOwnerId(opposingId)
      ? 'Neutral'
      : (opposingSeat ? sideDisplayName(opposingSeat) : 'Enemy');
    nameEl.textContent = rightLabel;
    nameEl.title = rightLabel;
  }
  const dot = document.getElementById('battle-force-enemy-dot');
  const enemyPalette = paletteForOwner(opposingId, seats);
  if (dot) dot.style.background = enemyPalette?.map ?? '#9D174D';
  const humanPalette = paletteForOwner(leadId ?? HUMAN_SEAT_ID, seats);
  const fill = document.getElementById('battle-force-human-fill');
  if (fill) {
    fill.style.width = `${(leftShare * 100).toFixed(1)}%`;
    const sidesMeet = leftShare > 0 && leftShare < 1;
    fill.style.borderRightWidth = sidesMeet ? '' : '0';
    if (humanPalette) fill.style.background = humanPalette.forceBar;
  }
  const track = bar.querySelector('.battle-force-track');
  if (track instanceof HTMLElement && enemyPalette) track.style.background = enemyPalette.forceBar;
}

/**
 * Shows the battle header while a battle is open, and the match status otherwise.
 *
 * Purpose: In a battle the player needs where the fight is and which beat it is, not the world-map readouts.
 * When to use: From `renderTopBarStatus`, with the latest game state and `S.tacticalBattleSnapshot`.
 * Expected outcome: With a game state and a battle, the bar switches to the battle header: the title, such as "Battle at
 *   (E8)", the hex caption, and the status line, such as "Beat 2 · Tactical planning · April, Year 1". An AI-only battle
 *   with a beat limit shows " (N left)" immediately to the right of "Beat N", crimson when N is 5 or less. The line ends with the
 *   battle's weather when it has one, and the force bar from `renderBattleForceBar`. Otherwise the bar shows the match
 *   status, and the next battle's caption and counts are written afresh.
 * Exceptions: None; missing elements are skipped.
 */
export function renderBattleHeader(state: GameStateSnapshot | null, battle: TacticalBattleSnapshot | null): void {
  const inBattle = state != null && battle != null;
  switchTopBarToBattle(inBattle);
  if (!state || !battle) {
    const captionEl = document.getElementById('battle-header-caption');
    if (captionEl) delete captionEl.dataset.battleId;
    const bar = document.getElementById('battle-force-bar');
    if (bar) delete bar.dataset.battleId;
    return;
  }
  const titleEl = document.getElementById('battle-header-title');
  if (titleEl) titleEl.textContent = formatBattleHeaderTitle(orderTargetHexCode(battle.enclosingStrategicH3Index, null));
  const statusEl = document.getElementById('battle-header-status');
  if (statusEl) {
    const beatsLeft = battle.leadPartyId != null
      ? aiOnlyBeatsLeft(battle.tacticalTurnNumber, state.aiOnlyBeatLimit ?? null)
      : null;
    const parts = formatBattleHeaderStatusParts({
      beat: battle.tacticalTurnNumber,
      beatPlaybackActive: S.resolutionMoveAnimation != null,
      dateLabel: state.currentDateLabel ?? '',
      garrisonDefendsInPlace: battle.opposingPartyId != null && isNeutralOwnerId(battle.opposingPartyId),
      beatsLeft,
    });
    const beatLabel = document.createElement('span');
    beatLabel.className = 'battle-beat-count';
    beatLabel.append(document.createTextNode(parts.beforeBeatsLeft));
    if (parts.beatsLeftLabel != null && beatsLeft != null) {
      const suffix = document.createElement('span');
      suffix.textContent = parts.beatsLeftLabel;
      if (aiOnlyBeatsLeftIsUrgent(beatsLeft)) suffix.className = 'battle-beats-left-urgent';
      beatLabel.append(suffix);
    }
    statusEl.replaceChildren(beatLabel, document.createTextNode(parts.afterBeatsLeft));
    if (battle.weather) statusEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
  renderBattleHeaderCaption(battle);
  renderBattleForceBar(battle);
}
