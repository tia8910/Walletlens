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
  fmtPct, fmtPrice, dueZakatReminder, trimZakatSent,
} from '../../push-api/notify-logic.js'
import { assetKey, fetchCryptoQuotes, fetchNews, fetchQuotes, quoteFor } from '../../push-api/markets.js'

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
            title: copy("targetTitle", sub.lang)(dir, a.coin_symbol),
            body: copy("targetBody", sub.lang)(a.coin_symbol, a.condition, a.targetPrice, p),
            tag: `price-${id}`,
            sym: a.coin_symbol,
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
    const inPass = (a) => !kinds || kinds.includes(a.kind)
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
        const prevPrice = sub.lastPrice[k]
        const cross = prevPrice
          ? crossedLevel({ price: q.price, prev: prevPrice, lastLevel: sub.lastLevel[k] ?? null })
          : null
        if (sub.lastPrice[k] !== q.price) { sub.lastPrice[k] = q.price; changed = true }

        if (cross && sub.prefs.levels) {
          const levelSent = await send(sub, buildPayload({
            channel: "level",
            title: copy("levelTitle", sub.lang)(a.symbol, fmtPrice(cross.level), cross.up),
            body: copy("levelBody", sub.lang)(a.symbol, fmtPrice(q.price)),
            tag: `level-${k}`,
            sym: a.symbol,
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
          title: copy("moveTitle", sub.lang)(a.symbol, fmtPct(changePct), up),
          body: copy("moveBody", sub.lang)(a.symbol, fmtPct(changePct), fmtPrice(q.price), up),
          tag: `move-${k}`,
          sym: a.symbol,
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
    const subs = (await store.all()).filter(s => s.sub.prefs.news && s.sub.watch.length)
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

      for (const article of articles) {
        const h = shortHash(article.link)
        if (sub.newsSent[h]) continue
        const asset = matchArticle(article, sub.watch)
        if (!asset) continue

        const sent = await send(sub, buildPayload({
          channel: "news",
          title: copy("newsTitle", sub.lang)(asset.symbol),
          body: copy("newsBody", sub.lang)(article.title),
          tag: `news-${h}`,
          sym: asset.symbol,
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

    const due = subs.filter(({ sub }) => {
      const h = localHour(now, sub.tz)
      return (h === DIGEST_HOUR && sub.prefs.digest)
        || (h === RETENTION_HOUR && sub.prefs.retention)
        || (h === ZAKAT_HOUR && sub.prefs.zakat && !!sub.zakatDue)
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
          await send(sub, buildPayload({
            channel: "digest",
            title: copy("digestTitle", sub.lang)(),
            body: copy("digestBody", sub.lang)(
              headline.symbol, fmtPct(headline.pct), headline.pct > 0, sub.watch.length,
            ),
            tag: "digest",
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

          const sent = await send(sub, buildPayload({
            channel: "retention",
            title: copy("retentionTitle", sub.lang)(step),
            body,
            tag: `winback-${step}`,
          }), { now })
          // Only burn the step if it actually went out. Unlike the morning brief,
          // a win-back nudge is not tied to a particular day — tomorrow is a
          // perfectly good time to try it again.
          if (sent) { sub.retention = [...sub.retention, step]; changed = true }
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
  return { checkTargets, checkMoves, checkNews, checkDaily }
}
