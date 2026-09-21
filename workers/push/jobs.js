// The five notification jobs, lifted out of the Deno service unchanged.
//
// These were EXTRACTED MECHANICALLY rather than retyped: the bodies carry
// comments recording real incidents ("blind to the move", "swallow an 8%
// overnight move", "a level crossing matters most precisely when no percentage
// threshold has been hit"), and hand-copying 360 lines of that is how such
// fixes get quietly dropped. The only changes are the three storage calls and
// the removal of TypeScript annotations; a line-by-line diff against the Deno
// original shows nothing else.
//
// Runtime-agnostic on purpose. Everything platform-specific arrives through
// the adapter, so the same logic runs on Workers here and could run anywhere
// else that provides a store and a sender.
//
//   store.all()          every subscription, cached
//   store.save(key, sub) write a row a cron mutated, without clobbering the user
//   store.get(key)       one row
//   send(sub, payload, opts) deliver one notification; returns truthy on success

import {
  buildPayload, copy, localDayKey, localHour, evaluateMove, seedRefFromChange,
  crossedLevel, MOVE_COOLDOWN_MS, NEWS_COOLDOWN_MS, pickHeadline, pruneSent,
  matchArticle, isBreaking, shortHash, dueRetentionStep, pickFeatureTip,
  FEATURE_TIP_GAP_MS, RETENTION_HOUR, RETENTION_MIN_PCT, DIGEST_MIN_PCT,
  fmtPct, fmtPrice, signedPct, dueZakatReminder, trimZakatSent,
  isMarketStory, pickHack, pickChallenge, portfolioPulse, assetUrl,
  HACK_GAP_MS, HACK_HOUR, ACADEMY_HOUR, PORTFOLIO_HOUR, PULSE_MIN_PCT, isStablecoin,
  trendSwitched,
} from '../../push-api/notify-logic.js'
import { assetKey, fetchCryptoQuotes, fetchNews, fetchQuotes, fetchSevenDay, quoteFor } from '../../push-api/markets.js'
// The same rule the dashboard draws with, imported rather than restated. A
// second copy of the thresholds here would drift, and the failure would be a
// notification contradicting the screen it links to.
import { trendFor } from '../../client/src/assetTrend.js'
// The Academy's own teaching material, in the six languages the app ships.
// Imported rather than restated: a hack is a title and a paragraph written to
// go together, and a second copy on the server is a second thing to translate
// and a guaranteed drift. The file is plain data with no imports of its own,
// which is what makes it safe to pull into a Worker bundle.
import { hacks, questions } from '../../client/src/data/academyContent.js'

// Local clock slots, carried over from the Deno service. The brief goes out at
// 09:00 on the user's own clock; zakat gets its own slot so the two do not
// land together.
const DIGEST_HOUR = 9
const ZAKAT_HOUR = 11

/**
 * Bind the jobs to a storage adapter and a sender.
 *
 * @param store an object with all(), get(), save()
 * @param send  (sub, payload, opts) => Promise<truthy on delivery>
 */
export function createJobs({ store, send }) {
  async function checkTargets() {
    const subs = await store.all()
    if (!subs.length) return

    const ids = new Set()
    for (const { sub } of subs) for (const a of sub.alerts) if (a.coin_id) ids.add(a.coin_id)
    if (!ids.size) return

    const quotes = await fetchCryptoQuotes([...ids])
    if (!Object.keys(quotes).length) return

    for (const { key, sub } of subs) {
      let changed = false
      for (const a of sub.alerts) {
        const p = quotes[a.coin_id]?.price
        if (p == null) continue
        const hit = a.condition === "above" ? p >= a.targetPrice : p <= a.targetPrice
        const id = String(a.id)
        if (hit && !sub.fired[id]) {
          const dir = a.condition === "above" ? "🚀" : "🔻"
          await send(sub, buildPayload({
            channel: "target",
            title: copy("targetTitle", sub.lang)(dir, a.coin_symbol, fmtPrice(p)),
            body: copy("targetBody", sub.lang)(
              a.coin_symbol, a.condition, fmtPrice(a.targetPrice),
              signedPct(quotes[a.coin_id]?.change24h)),
            tag: `price-${id}`,
            sym: a.coin_symbol,
            // The asset, not the alerts list. The tap follows the sentence
            // the notification just read out.
            url: assetUrl({ id: a.coin_id }),
          }))
          sub.fired[id] = Date.now()
          changed = true
        } else if (!hit && sub.fired[id]) {
          delete sub.fired[id]
          changed = true
        }
      }
      if (changed) await store.save(key, sub)
    }
  }

  async function checkMoves({ kinds = null, refreshSeen = true } = {}) {
    const subs = await store.all()
    const inPass = (a) => {
      if (kinds && !kinds.includes(a.kind)) return false
      // Stablecoins (USDT, USDC, DAI, etc.) are excluded from move notifications.
      // A 0.01% USDT wobble is noise, not signal — spamming users with it
      // erodes trust in the entire notification feature.
      if (isStablecoin(a.symbol)) return false
      return true
    }
    const watching = subs.filter(s => s.sub.watch.some(inPass))
    if (!watching.length) return

    const assets = new Map()
    for (const { sub } of watching) {
      for (const a of sub.watch) if (inPass(a)) assets.set(`${a.kind}:${a.id}:${a.symbol}`, a)
    }
    const quotes = await fetchQuotes([...assets.values()])
    if (!Object.keys(quotes).length) return

    const now = Date.now()

    for (const { key, sub } of watching) {
      let changed = false

      // Refresh the "last visit" price snapshot when the user has been back
      // since it was taken. Captured here rather than on /seen so the heartbeat
      // stays a fast write with no upstream call on the request path.
      if (refreshSeen && (!sub.seenRef || sub.seenRef.at < sub.lastSeen)) {
        const prices = {}
        for (const a of sub.watch) {
          const q = quoteFor(quotes, a)
          if (q) prices[assetKey(a)] = q.price
        }
        if (Object.keys(prices).length) {
          sub.seenRef = { at: sub.lastSeen, prices }
          changed = true
        }
      }

      for (const a of sub.watch) {
        if (!inPass(a)) continue
        const q = quoteFor(quotes, a)
        if (!q) continue
        const k = assetKey(a)

        // First time we have seen this asset for this device, seed the window
        // from where it was 24h ago rather than from right now. Otherwise a
        // device that starts watching mid-move is blind to the move: it reads
        // 0% from this instant and stays quiet until the asset moves another
        // full threshold on top of what the user already missed.
        const ref = sub.ref[k] ?? seedRefFromChange({ price: q.price, change24h: q.change24h, now })

        const { fire, changePct, nextRef } = evaluateMove({
          price: q.price,
          ref,
          thresholdPct: sub.prefs.movePct,
          now,
          lastFired: sub.moveFired[k] ?? 0,
          cooldownMs: MOVE_COOLDOWN_MS,
        })

        // A crossing we can't send — the move channel is switched off — must
        // keep its old baseline. Rebasing here would swallow an 8% overnight
        // move: by morning the reference would say it had already been accounted
        // for and the user would never hear about it.
        const deliverable = !fire || sub.prefs.moves
        if (deliverable && nextRef !== sub.ref[k]) { sub.ref[k] = nextRef; changed = true }

        // — Round price levels —
        // Checked BEFORE the move `continue` below, because a level crossing
        // matters most precisely when no percentage threshold has been hit: a
        // 0.4% slip past $77,000 is the alert an exchange sends, and the move
        // channel is silent for it by design.
        // Skip stablecoins from level notifications too
        if (isStablecoin(a.symbol)) { sub.lastPrice[k] = q.price; changed = true; continue }
        const prevPrice = sub.lastPrice[k]
        const cross = prevPrice
          ? crossedLevel({ price: q.price, prev: prevPrice, lastLevel: sub.lastLevel[k] ?? null })
          : null
        if (sub.lastPrice[k] !== q.price) { sub.lastPrice[k] = q.price; changed = true }

        if (cross && sub.prefs.levels) {
          const levelSent = await send(sub, buildPayload({
            channel: "level",
            title: copy("levelTitle", sub.lang)(
              a.symbol, fmtPrice(cross.level), cross.up, fmtPrice(q.price)),
            body: copy("levelBody", sub.lang)(a.symbol, signedPct(q.change24h)),
            tag: `level-${k}`,
            sym: a.symbol,
            url: assetUrl(a),
          }), { now })
          if (levelSent) {
            sub.lastLevel[k] = cross.level
            // Start the movement cooldown too. The same slide can satisfy both
            // channels, and "BTC drops below $77,000" followed a second later by
            // "BTC down 5%" is two notifications about one fact.
            sub.moveFired[k] = now
            changed = true
            continue
          }
        }

        if (!fire || !sub.prefs.moves) continue

        const up = changePct > 0
        const sent = await send(sub, buildPayload({
          channel: "move",
          title: copy("moveTitle", sub.lang)(
            a.symbol, signedPct(changePct), up, fmtPrice(q.price)),
          body: copy("moveBody", sub.lang)(a.symbol, signedPct(q.change24h)),
          tag: `move-${k}`,
          sym: a.symbol,
          url: assetUrl(a),
        }), { now })
        if (sent) { sub.moveFired[k] = now; changed = true }
      }

      // Assets the user has since removed would otherwise keep their baselines
      // forever, growing the record on every portfolio edit.
      const live = new Set(sub.watch.map(assetKey))
      for (const k of Object.keys(sub.ref)) if (!live.has(k)) { delete sub.ref[k]; changed = true }
      for (const k of Object.keys(sub.moveFired)) if (!live.has(k)) { delete sub.moveFired[k]; changed = true }
      for (const k of Object.keys(sub.lastPrice)) if (!live.has(k)) { delete sub.lastPrice[k]; changed = true }
      for (const k of Object.keys(sub.lastLevel)) if (!live.has(k)) { delete sub.lastLevel[k]; changed = true }

      if (changed) await store.save(key, sub)
    }
  }

  async function checkNews() {
    // A device with an empty watch list is still a candidate now: market-wide
    // stories are about the market, not about a holding, so having none is not
    // a reason to hear nothing.
    const subs = (await store.all()).filter(s => s.sub.prefs.news || s.sub.prefs.newsMarket)
    if (!subs.length) return

    const now = Date.now()
    const articles = (await fetchNews()).filter(a => isBreaking(a, now))
    if (!articles.length) return

    for (const { key, sub } of subs) {
      // One story per window: a busy news day should not become a news feed on
      // the lock screen.
      if (now - sub.lastNewsAt < NEWS_COOLDOWN_MS) continue
      const pruned = pruneSent(sub.newsSent, now, 48 * 60 * 60 * 1000)
      let changed = Object.keys(pruned).length !== Object.keys(sub.newsSent).length
      sub.newsSent = pruned

      // A story naming something the user holds outranks a market-wide one, so
      // both passes run over the whole list before the weaker kind is
      // considered — otherwise an early general story would spend the window
      // and the "BTC" headline two items down would never be reached.
      const held = sub.prefs.news && sub.watch.length
        ? articles.flatMap(a => {
            const asset = matchArticle(a, sub.watch)
            return asset ? [{ article: a, asset }] : []
          })
        : []
      const market = sub.prefs.newsMarket
        ? articles.filter(a => isMarketStory(a)).map(a => ({ article: a, asset: null }))
        : []

      for (const { article, asset } of [...held, ...market]) {
        const h = shortHash(article.link)
        if (sub.newsSent[h]) continue

        const sent = await send(sub, buildPayload({
          channel: "news",
          title: asset
            ? copy("newsTitle", sub.lang)(asset.symbol)
            : copy("newsMarketTitle", sub.lang)(),
          body: copy("newsBody", sub.lang)(article.title),
          tag: `news-${h}`,
          ...(asset ? { sym: asset.symbol } : {}),
          // A story about something they hold opens that holding. A
          // market-wide one opens the market page — NOT article.link, which
          // would take the reader out of the app and into a news site, where
          // nothing this app knows about their portfolio is on screen.
          url: asset ? assetUrl(asset) : '/market-index',
        }), { now })

        // Recorded either way. A story that reached the send stage has had its
        // turn; re-offering it hours later would push a stale headline.
        sub.newsSent[h] = now
        changed = true
        if (sent) { sub.lastNewsAt = now; break }
      }

      if (changed) await store.save(key, sub)
    }
  }

  async function checkDaily() {
    const subs = await store.all()
    if (!subs.length) return

    const now = Date.now()
    // A feature tip is not tied to a time of day the way a morning brief is —
    // it fires once ever, at most one a week, and only while its precondition
    // holds. Gating it on 10:00 as well meant one chance per day to satisfy all
    // of that, so someone who had just set up could wait most of a day to hear
    // anything. The weekly gap and the eight-ever cap are what keep it from
    // being noise; the hour added nothing but delay.
    const featureDue = (sub) =>
      sub.prefs.features && sub.watch.length > 0 &&
      now - sub.lastFeatureAt >= FEATURE_TIP_GAP_MS

    // One hack every other day, in its own slot. Unlike the feature tips this
    // is not gated on the watch list: a hack is worth reading whether or not
    // the server knows what you hold.
    const hackDue = (sub) =>
      sub.prefs.hacks && localHour(now, sub.tz) === HACK_HOUR &&
      now - (sub.lastHackAt ?? 0) >= HACK_GAP_MS

    const due = subs.filter(({ sub }) => {
      const h = localHour(now, sub.tz)
      return (h === DIGEST_HOUR && sub.prefs.digest)
        || (h === RETENTION_HOUR && sub.prefs.retention)
        || (h === ZAKAT_HOUR && sub.prefs.zakat && !!sub.zakatDue)
        || (h === PORTFOLIO_HOUR && sub.prefs.portfolio)
        || (h === ACADEMY_HOUR && sub.prefs.academy)
        || hackDue(sub)
        || featureDue(sub)
    })
    if (!due.length) return

    // One quote fetch for the union, rather than one per subscription.
    const assets = new Map()
    for (const { sub } of due) for (const a of sub.watch) assets.set(`${a.kind}:${a.id}:${a.symbol}`, a)
    const quotes = assets.size ? await fetchQuotes([...assets.values()]) : {}

    for (const { key, sub } of due) {
      const hour = localHour(now, sub.tz)
      let changed = false

      // — Morning brief —
      // The 09:00 slot is permission to go looking for a reason, not a reason.
      // On a flat day this sends nothing: a notification whose content is
      // "markets are calm" spends the user's attention to tell them nothing, and
      // teaches them to swipe the next one away unread.
      const today = localDayKey(now, sub.tz)
      if (hour === DIGEST_HOUR && sub.prefs.digest && sub.digestDay !== today && sub.watch.length) {
        const headline = pickHeadline(
          sub.watch.flatMap(a => {
            const q = quoteFor(quotes, a)
            return q ? [{ symbol: a.symbol, pct: q.change24h }] : []
          }),
          DIGEST_MIN_PCT,
        )

        if (headline) {
          const headAsset = sub.watch.find(a => a.symbol === headline.symbol)
          await send(sub, buildPayload({
            channel: "digest",
            title: copy("digestTitle", sub.lang)(),
            body: copy("digestBody", sub.lang)(
              headline.symbol, fmtPct(headline.pct), headline.pct > 0, sub.watch.length,
            ),
            tag: "digest",
            sym: headline.symbol,
            // The headline asset, not the dashboard: the brief is about a
            // holding that moved, and the tap should open exactly that page.
            url: headAsset ? assetUrl(headAsset) : undefined,
          }), { now })
        }
        // Either way the day has been evaluated — checking again at 10:00 would
        // just be the same question with a staler answer, and a brief that
        // arrives in the afternoon is not a morning brief.
        sub.digestDay = today
        changed = true
      }

      // — Zakat year completing —
      // A date the user set a year ago, reached on their own local clock. This
      // is the only channel that fires without consulting a price, which is the
      // point: the server has never been told what they owe.
      if (hour === ZAKAT_HOUR && sub.prefs.zakat && sub.zakatDue) {
        const hit = dueZakatReminder({
          dueDate: sub.zakatDue,
          today: localDayKey(now, sub.tz),
          sent: sub.zakatSent,
        })
        if (hit) {
          await send(sub, buildPayload({
            channel: "zakat",
            title: copy("zakatTitle", sub.lang)(hit.days),
            body: copy("zakatBody", sub.lang)(hit.days),
            tag: "zakat",
          }), { now })
          sub.zakatSent = trimZakatSent([...sub.zakatSent, hit.key])
          changed = true
        }
      }

      // — Win-back ladder —
      if (hour === RETENTION_HOUR && sub.prefs.retention) {
        const step = dueRetentionStep({ lastSeen: sub.lastSeen, now, sentSteps: sub.retention })
        if (step) {
          // Being away is not a reason to be interrupted — something having
          // happened while away is. "BTC is up 9% since your last visit" earns
          // the tap; "we miss you" is the app talking about itself.
          //
          // With no headline this sends nothing AND does not burn the step, so
          // the nudge waits for a day worth nudging about rather than being
          // spent on a quiet one. A portfolio that never moves never nags.
          const mover = pickHeadline(
            sub.watch.flatMap(a => {
              const q = quoteFor(quotes, a)
              const base = sub.seenRef?.prices?.[assetKey(a)]
              if (!q || !base || base <= 0) return []
              return [{ symbol: a.symbol, pct: ((q.price - base) / base) * 100 }]
            }),
            RETENTION_MIN_PCT,
          )
          if (!mover) { if (changed) await store.save(key, sub); continue }

          const body = copy("retentionMoverBody", sub.lang)(
            mover.symbol, fmtPct(mover.pct), mover.pct > 0,
          )
          const moveAsset = sub.watch.find(a => a.symbol === mover.symbol)

          const sent = await send(sub, buildPayload({
            channel: "retention",
            title: copy("retentionTitle", sub.lang)(step),
            body,
            tag: `winback-${step}`,
            sym: mover.symbol,
            // The nudge is "BTC is up since you were here" — the asset page
            // is the one screen that answers why anyone should come back.
            url: moveAsset ? assetUrl(moveAsset) : undefined,
          }), { now })
          // Only burn the step if it actually went out. Unlike the morning brief,
          // a win-back nudge is not tied to a particular day — tomorrow is a
          // perfectly good time to try it again.
          if (sent) { sub.retention = [...sub.retention, step]; changed = true }
        }
      }

      // — Portfolio pulse —
      // Breadth rather than a single mover, which is what makes it a different
      // notification from the 09:00 brief and not a second copy of it: the
      // brief says "ETH is down 4%", this says "two of your six are green".
      // Both are built from percentages only — the server has no amounts.
      if (hour === PORTFOLIO_HOUR && sub.prefs.portfolio && sub.pulseDay !== today) {
        const pulse = portfolioPulse(
          sub.watch.flatMap(a => {
            const q = quoteFor(quotes, a)
            return q ? [{ symbol: a.symbol, pct: q.change24h }] : []
          }),
          PULSE_MIN_PCT,
        )
        if (pulse) {
          const leadAsset = sub.watch.find(a => a.symbol === pulse.leader.symbol)
          await send(sub, buildPayload({
            channel: "portfolio",
            title: copy("portfolioTitle", sub.lang)(),
            body: copy("portfolioBody", sub.lang)(
              pulse.up, pulse.total, pulse.leader.symbol,
              fmtPct(pulse.leader.pct), pulse.leader.pct > 0,
            ),
            tag: "portfolio",
            sym: pulse.leader.symbol,
            url: leadAsset ? assetUrl(leadAsset) : undefined,
          }), { now })
          // Only a day that actually produced a pulse is marked done. A flat
          // day leaves the slot unspent, but the hour has passed either way —
          // it simply means tomorrow is evaluated fresh rather than skipped.
          sub.pulseDay = today
          changed = true
        }
      }

      // — Academy daily challenge —
      // The body is the question itself. "Your daily challenge is ready" is
      // the app talking about itself; the actual stem is a thing you either
      // know or want to find out, and that is what earns the tap.
      if (hour === ACADEMY_HOUR && sub.prefs.academy && sub.academyDay !== today) {
        const bank = questions(sub.lang || 'en')
        const idx = pickChallenge({ dayKey: today, count: bank.length })
        const question = idx == null ? null : bank[idx]
        if (question?.q) {
          await send(sub, buildPayload({
            channel: "academy",
            title: copy("academyTitle", sub.lang)(),
            body: question.q,
            tag: `academy-${today}`,
          }), { now })
        }
        // Marked either way: the challenge is tied to this day, and a retry an
        // hour later would be the same question with less of the day left.
        sub.academyDay = today
        changed = true
      }

      // — Investment hacks —
      if (hackDue(sub)) {
        const list = hacks(sub.lang || 'en')
        const choice = pickHack({ count: list.length, sentIds: sub.hacksSent })
        const hack = choice ? list[choice.index] : null
        if (hack) {
          const sent = await send(sub, buildPayload({
            channel: "hack",
            title: copy("hackTitle", sub.lang)(hack.title),
            body: hack.body,
            tag: `hack-${choice.index}`,
            // The hack itself, opened, not a list of forty to search. The
            // index is the same one hacksSent records, so the link and the
            // rotation cannot disagree about which hack this was.
            url: `/academy?tab=hacks&hack=${choice.index}`,
          }), { now })
          if (sent) {
            // A wrap starts the cycle over: the list is finite, the channel is
            // not. Recorded as strings so the bookkeeping does not depend on
            // the list keeping its current length.
            sub.hacksSent = choice.wrapped
              ? [String(choice.index)]
              : [...sub.hacksSent, String(choice.index)]
            sub.lastHackAt = now
            changed = true
          }
        }
      }

      // — Feature tips —
      // Same "reason" test as everything else: the trigger is a fact about this
      // user's own setup, not a slot in a rotation. Each tip fires once ever,
      // at most one a week, and only while its precondition still holds — so a
      // user who sets a price target before the tip goes out simply never gets
      // it. Runs in the retention hour to keep all the once-a-day work together.
      if (featureDue(sub)) {
        {
          const tip = pickFeatureTip({
            watchCount: sub.watch.length,
            alertCount: sub.alerts.length,
            kinds: [...new Set(sub.watch.map(a => a.kind))],
            setup: sub.setup,
          }, sub.featuresSent)

          if (tip) {
            const cap = (id) => id.charAt(0).toUpperCase() + id.slice(1)
            const sent = await send(sub, buildPayload({
              channel: "feature",
              title: copy(`feat${cap(tip.id)}Title`, sub.lang)(),
              // Only the targets tip names an asset; the others take no argument
              // and ignore what they are handed.
              body: copy(`feat${cap(tip.id)}Body`, sub.lang)(sub.watch[0]?.symbol),
              tag: `feature-${tip.id}`,
              url: tip.url,
            }), { now })
            // Mark it sent only on delivery. Each tip fires once ever, so one
            // that failed to send must keep its turn rather than burning it.
            if (sent) {
              sub.featuresSent = [...sub.featuresSent, tip.id]
              sub.lastFeatureAt = now
              changed = true
            }
          }
        }
      }

      if (changed) await store.save(key, sub)
    }
  }
  /**
   * A holding's seven-day trend changed direction.
   *
   * Runs hourly, on the schedule that already exists. A weekly window does not
   * turn over faster than that, and the account is at the Workers Free cron
   * limit, so a fourth trigger was not available to spend.
   *
   * Crypto only, and deliberately: the weekly numbers come from market.json,
   * which is a CoinGecko snapshot. A stock has no entry there, and inventing
   * one from the 24h quote would mean this channel and the dashboard's own
   * chip disagreeing about the same asset on the same screen.
   */
  async function checkTrend() {
    const subs = await store.all()
    const watching = subs.filter(s =>
      s.sub.prefs.trend && s.sub.watch.some(a => (a.kind || 'crypto') === 'crypto' && !isStablecoin(a.symbol)))
    if (!watching.length) return

    const weekly = await fetchSevenDay()
    if (!Object.keys(weekly).length) return

    const now = Date.now()

    for (const { key, sub } of watching) {
      let changed = false
      sub.trendRef ??= {}
      sub.trendFired ??= {}

      for (const a of sub.watch) {
        if ((a.kind || 'crypto') !== 'crypto' || isStablecoin(a.symbol)) continue
        const pct7d = weekly[String(a.id).toLowerCase()]
        if (!Number.isFinite(pct7d)) continue

        const k = assetKey(a)
        const { dir } = trendFor({ pct7d })
        const prev = sub.trendRef[k]

        if (trendSwitched({ prev, next: dir, firedAt: sub.trendFired[k], now })) {
          const sent = await send(sub, buildPayload({
            channel: 'trend',
            title: copy('trendTitle', sub.lang)(a.symbol, dir === 'up'),
            body: copy('trendBody', sub.lang)(a.symbol, signedPct(pct7d)),
            tag: `trend-${k}`,
            sym: a.symbol,
            url: assetUrl(a),
          }), { now })
          if (sent) { sub.trendFired[k] = now; changed = true }
        }

        // Recorded whether or not anything was sent, and that is what makes
        // the first sighting silent rather than a notification per holding the
        // moment the channel is switched on.
        if (sub.trendRef[k] !== dir) { sub.trendRef[k] = dir; changed = true }
      }

      // Assets the user has since sold would otherwise keep their direction
      // forever, growing the record on every portfolio edit.
      const live = new Set(sub.watch.map(assetKey))
      for (const k of Object.keys(sub.trendRef)) {
        if (!live.has(k)) { delete sub.trendRef[k]; delete sub.trendFired[k]; changed = true }
      }

      if (changed) await store.save(key, sub)
    }
  }

  return { checkTargets, checkMoves, checkNews, checkDaily, checkTrend }
}
